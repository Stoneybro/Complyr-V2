// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    FHE,
    ebool,
    euint8,
    euint64,
    externalEuint8,
    externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig, ZamaConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";
import {ExternalAuditFields, CallbackAuditFields} from "./IComplyrTypes.sol";

interface IConfidentialFungibleTokenReceiver {
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool);
}

interface IReviewTestRegistry {
    function evaluateAll(uint256 paymentId) external;
    function createSodFinding(uint256 paymentId, address auditor) external;
    function storeAuthBreachResult(uint256 paymentId, address approver, ebool breach, euint64 authLevelHandle) external;
}

/// @notice Minimal interface for forwarding cUSDC to the actual recipient after audit recording.
interface IConfidentialToken {
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditRegistry — rebuilt for Complyr V2
//
// Stores encrypted payment records and findings per business.
// Deployed as an EIP-1167 clone by ComplyrFactory (one instance per business).
// The sole payment entry point is onConfidentialTransferReceived — no self-reporting.
//
// Key design decisions:
//   - approved/approver always false/address(0) at creation; only approvePayment() sets them
//   - ReviewTestRegistry gets read access via a dedicated path, NOT via the _auditors array
//   - The _auditors array cap (MAX_AUDITORS = 5) is exclusively for external human auditors
//   - setAuthTierThresholds is onlyOwner — business sets its own Delegation of Authority policy
// ─────────────────────────────────────────────────────────────────────────────
contract AuditRegistry is IConfidentialFungibleTokenReceiver, ZamaEthereumConfig {

    // ─── Enums ───────────────────────────────────────────────────────────────

    /// @notice GL-level payment categories replacing ISO 20022 purpose codes.
    ///         8 buckets vs old 12 = 33% fewer rollup FHE ops.
    enum Category {
        OPEX,         // 0 — Operating expenses (supplies, utilities, general)
        CAPEX,        // 1 — Capital expenditure (equipment, property)
        PAYROLL,      // 2 — Salary, wages, benefits
        PROFESSIONAL, // 3 — Consulting, legal, advisory services
        INTERCOMPANY, // 4 — Related party / intra-group transfers
        TAX,          // 5 — Tax payments to authorities
        DEBT_SERVICE, // 6 — Loan repayments, interest
        OTHER         // 7 — Unclassified
    }

    /// @notice Derived authorization level for the payment. Never submitted — always computed
    ///         from amount vs owner-configured DoA thresholds.
    enum AuthLevel {
        ROUTINE,  // 0 — Below manager threshold, no human authorization needed
        MANAGER,  // 1 — Requires manager sign-off
        DIRECTOR, // 2 — Requires director sign-off
        BOARD     // 3 — Requires board resolution
    }

    /// @notice Tiered access model for external auditors.
    enum AuditorAccess {
        NONE,      // 0 — No access
        SIGNAL,    // 1 — Findings feed only (severity + testType, no handles)
        ANALYTICS, // 2 — Encrypted rollup totals + category handles
        FULL       // 3 — Full payment handle access + analytics
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct AuditorProfile {
        AuditorAccess access;
        uint248       engagementId;
    }

    /// @notice The canonical payment record. Immutable after creation except for
    ///         the approved/approver fields which are set via approvePayment().
    struct PaymentRecord {
        // Encrypted — FHE handles
        euint64 amount;      // Token transfer amount — cryptographically verified (from callback)
        euint8  category;    // GL category declared by sender (Category enum)
        euint8  authLevel;   // DERIVED by contract from amount vs DoA thresholds (AuthLevel enum)

        // Plaintext with access control
        address sender;      // Who initiated the payment
        address recipient;   // Who received the payment
        address approver;    // Who authorized — address(0) until approvePayment() is called
        bool    approved;    // Always false at creation; set true only by approvePayment()

        // Evidence anchors — immutable after creation
        bytes32 invoiceHash; // keccak256 of supporting invoice — feeds MISSING_EVIDENCE test
        bytes32 poHash;      // keccak256 of purchase order — off-chain three-way match anchor

        // Metadata
        uint32  blockNumber; // Block when recorded
    }

    /// @notice A finding created when a ReviewTestRegistry test fires.
    struct Finding {
        uint256 paymentId;
        uint8   testType;         // Maps to TestType enum in ReviewTestRegistry
        uint8   severity;         // Plaintext — mirrors auditor's configured Priority
        euint64 flaggedHandle;    // Encrypted value that triggered the test
        uint32  triggeredAtBlock;
        bytes32 narrativeHash;    // Optional: keccak256 of auditor's written finding narrative
        bool    escalated;
        address triggeredBy;      // Who triggered it
        bool    isShared;         // Whether this is a globally shared finding
    }

    // ─── Constants ───────────────────────────────────────────────────────────

    uint8 private constant CATEGORY_BUCKETS = 8;
    uint8 private constant MAX_AUDITORS     = 5; // Hard cap for external human auditors

    // ─── State Variables ─────────────────────────────────────────────────────

    // NOTE: not immutable — EIP-1167 clone pattern requires mutable state
    address public confidentialToken;
    address public owner;
    address public reviewTestRegistry;
    bool    public authThresholdsConfigured;

    // Reentrancy guard
    bool private _locked;

    // DoA thresholds — set exclusively by owner (onlyOwner)
    euint64 private _managerThreshold;
    euint64 private _directorThreshold;
    euint64 private _boardThreshold;

    // Storage
    PaymentRecord[] private _payments;
    Finding[]       private _findings;
    address[]       private _auditors; // External human auditors only; capped at MAX_AUDITORS

    // Mappings
    mapping(address auditor  => AuditorProfile profile) public  auditorProfile;
    mapping(uint8   category => euint64 total)           private _categoryTotals;
    mapping(address recipient => euint64 total)          private _recipientTotals;
    mapping(address auditor  => bool listed)             private _auditorListed;
    mapping(address auditor  => uint256[] findingIds)    private _auditorFindings;
    mapping(address approver => bool authorized)          public  authorizedApprovers;
    mapping(address approver => euint8 tier)              private _approverTiers;
    mapping(address approver => bool configured)          private _approverTierConfigured;
    // Per-payment access for FULL auditors — set at recording time (existing auditors) or via
    // grantHistoricalAccess (late-added auditors). Prevents a FULL auditor added after a payment
    // from reading records they were never scoped into.
    mapping(address auditor  => mapping(uint256 paymentId => bool granted)) private _paymentAccessGranted;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AuditorAccessSet(address indexed auditor, AuditorAccess access, uint32 engagementId);
    event AuthThresholdsSet(address indexed by);
    event PaymentRecorded(uint256 indexed paymentId, address indexed sender, address indexed recipient);
    event PaymentApproved(uint256 indexed paymentId, address indexed approver);
    event FindingCreated(uint256 indexed findingId, uint256 indexed paymentId, uint8 testType, uint8 severity);
    event FindingEscalated(uint256 indexed findingId, address indexed escalatedBy);
    event ReviewTestRegistrySet(address indexed registry);
    event ApproverAuthorizationSet(address indexed approver, bool authorized);
    event ApproverTierSet(address indexed approver);
    event HistoricalAccessGranted(address indexed auditor, uint256 recordCount);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotOwner();
    error NotToken();
    error NotReviewRegistry();
    error InvalidAddress();
    error ThresholdsNotConfigured();
    error Unauthorized();
    error PaymentNotFound();
    error PaymentAlreadyApproved();
    error AlreadyInitialized();
    error AuditorLimitReached();
    error Reentrant();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier paymentExists(uint256 paymentId) {
        if (paymentId >= _payments.length) revert PaymentNotFound();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrant();
        _locked = true;
        _;
        _locked = false;
    }

    // ─── Initialization (Clone Pattern) ──────────────────────────────────────

    /// @notice Lock the implementation contract so it can never be initialized directly.
    constructor() {
        confidentialToken = address(1); // non-zero sentinel — prevents initialization
    }

    /// @notice Called once by ComplyrFactory after cloning. Replaces the constructor.
    ///         Explicitly re-calls FHE.setCoprocessor because EIP-1167 clone proxies do not
    ///         execute the implementation constructor — the clone starts with empty storage.
    ///         Without this, every FHE.fromExternal() call reverts with 'unexpected amount of data'.
    function initialize(address confidentialToken_, address initialOwner) external {
        if (confidentialToken != address(0)) revert AlreadyInitialized();
        if (confidentialToken_ == address(0)) revert InvalidAddress();
        if (initialOwner == address(0)) revert InvalidAddress();

        // Re-initialise the coprocessor for this clone's storage.
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());

        confidentialToken = confidentialToken_;
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    // ─── Admin Functions ─────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setReviewTestRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert InvalidAddress();
        reviewTestRegistry = registry;
        emit ReviewTestRegistrySet(registry);
    }

    /// @notice Grants or revokes payment approval rights for a given address.
    ///         Only authorized approvers can call approvePayment().
    ///         onlyOwner — the business controls who holds approval authority.
    function setAuthorizedApprover(address approver, bool authorized) external onlyOwner {
        if (approver == address(0)) revert InvalidAddress();
        authorizedApprovers[approver] = authorized;
        emit ApproverAuthorizationSet(approver, authorized);
    }

    /// @notice Sets an encrypted authority tier for an authorized approver.
    ///         Tier values map to the AuthLevel enum: 0=ROUTINE, 1=MANAGER, 2=DIRECTOR, 3=BOARD.
    ///         Must be called after setAuthorizedApprover — approver must already be authorized.
    ///         Used in approvePayment() for AUTHORIZATION_BREACH detection: if approver tier <
    ///         payment authLevel, an encrypted breach ebool is recorded in ReviewTestRegistry
    ///         without ever revealing either value in plaintext.
    function setApproverTier(
        address        approver,
        externalEuint8 tier,
        bytes calldata inputProof
    ) external onlyOwner {
        if (approver == address(0)) revert InvalidAddress();
        if (!authorizedApprovers[approver]) revert Unauthorized();
        euint8 encTier = FHE.fromExternal(tier, inputProof);
        _approverTiers[approver]         = encTier;
        _approverTierConfigured[approver] = true;
        FHE.allowThis(encTier);
        FHE.allow(encTier, approver);
        emit ApproverTierSet(approver);
    }

    /// @notice Grants an external human auditor access to payment data.
    ///         ReviewTestRegistry access is handled separately — do NOT pass it here.
    ///         Cap: MAX_AUDITORS (5) external auditors per registry.
    function setAuditorAccess(address auditor, AuditorAccess access, uint32 engagementId) external onlyOwner {
        if (auditor == address(0)) revert InvalidAddress();

        if (access == AuditorAccess.NONE) {
            if (_auditorListed[auditor]) {
                _auditorListed[auditor] = false;
                for (uint256 i = 0; i < _auditors.length; i++) {
                    if (_auditors[i] == auditor) {
                        _auditors[i] = _auditors[_auditors.length - 1];
                        _auditors.pop();
                        break;
                    }
                }
            }
            auditorProfile[auditor] = AuditorProfile(AuditorAccess.NONE, 0);
            emit AuditorAccessSet(auditor, access, 0);
            return;
        }

        if (!_auditorListed[auditor]) {
            if (_auditors.length >= MAX_AUDITORS) revert AuditorLimitReached();
            _auditorListed[auditor] = true;
            _auditors.push(auditor);
        }
        auditorProfile[auditor] = AuditorProfile(access, engagementId);
        emit AuditorAccessSet(auditor, access, engagementId);
    }

    /// @notice Sets the business's Delegation of Authority thresholds.
    ///         onlyOwner — this is an internal control policy, not auditor methodology.
    ///         Must be called before any payment can be recorded.
    function setAuthTierThresholds(
        externalEuint64 managerThreshold,
        externalEuint64 directorThreshold,
        externalEuint64 boardThreshold,
        bytes calldata inputProof
    ) external onlyOwner {
        _managerThreshold  = FHE.fromExternal(managerThreshold,  inputProof);
        _directorThreshold = FHE.fromExternal(directorThreshold, inputProof);
        _boardThreshold    = FHE.fromExternal(boardThreshold,    inputProof);

        FHE.allowThis(_managerThreshold);
        FHE.allowThis(_directorThreshold);
        FHE.allowThis(_boardThreshold);
        FHE.allow(_managerThreshold,  msg.sender);
        FHE.allow(_directorThreshold, msg.sender);
        FHE.allow(_boardThreshold,    msg.sender);

        authThresholdsConfigured = true;
        emit AuthThresholdsSet(msg.sender);
    }

    /// @notice Grants FHE ACL access to specific historical payment records for an auditor.
    ///         Gas cost is O(records disclosed), not O(all history) — caller specifies exactly
    ///         which paymentIds to disclose. Matches real audit methodology: auditors work from
    ///         a defined engagement scope, not a blanket history dump.
    ///         Only FULL auditors get per-payment handle access; ANALYTICS tier is rollups-only.
    ///         onlyOwner — business controls what historical records external auditors can see.
    function grantHistoricalAccess(
        address   auditor,
        uint256[] calldata paymentIds
    ) external onlyOwner {
        AuditorAccess access = auditorProfile[auditor].access;
        if (access == AuditorAccess.NONE) revert Unauthorized();
        if (access != AuditorAccess.FULL) revert Unauthorized(); // only FULL gets per-payment handles
        for (uint256 i = 0; i < paymentIds.length; i++) {
            if (paymentIds[i] >= _payments.length) revert PaymentNotFound();
            PaymentRecord storage p = _payments[paymentIds[i]];
            FHE.allow(p.amount,    auditor);
            FHE.allow(p.category,  auditor);
            FHE.allow(p.authLevel, auditor);
            _paymentAccessGranted[auditor][paymentIds[i]] = true; // Solidity gate mirrors FHE ACL grant
        }
        emit HistoricalAccessGranted(auditor, paymentIds.length);
    }

    // ─── Payment Entry Point (sole path — no self-reporting) ─────────────────

    /// @notice Called by ConfidentialUSDC after a confidentialTransferAndCallWithAudit.
    ///         The amount handle is pulled from the actual token transfer — not submitted by caller.
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override nonReentrant returns (ebool) {
        if (msg.sender != confidentialToken) revert NotToken();
        CallbackAuditFields memory fields = abi.decode(data, (CallbackAuditFields));
        _recordPayment(from, amount, fields);
        return FHE.asEbool(true);
    }

    // ─── Payment Approval ────────────────────────────────────────────────────

    /// @notice The only path to set approved=true and approver on a payment.
    ///         Two detective SoD checks run here (sender==approver, recipient==approver).
    ///         If the approver has a configured encrypted tier, an AUTHORIZATION_BREACH
    ///         result is computed via FHE and stored in ReviewTestRegistry for auditor review.
    function approvePayment(uint256 paymentId) external paymentExists(paymentId) {
        // Access control: only addresses explicitly authorized by the business owner
        // can approve payments. This prevents arbitrary wallets from flipping approved=true.
        if (!authorizedApprovers[msg.sender]) revert Unauthorized();

        PaymentRecord storage payment = _payments[paymentId];
        if (payment.approved) revert PaymentAlreadyApproved();

        // SoD check — sender == approver: initiator cannot self-authorize.
        // Detective control — approval goes through; a finding is created.
        if (msg.sender == payment.sender && reviewTestRegistry != address(0)) {
            IReviewTestRegistry(reviewTestRegistry).createSodFinding(paymentId, msg.sender);
        }

        // SoD check — recipient == approver: covers self-dealing / collusion
        // (Authorization + Existence assertions). Separate finding from sender-SoD.
        if (msg.sender == payment.recipient && reviewTestRegistry != address(0)) {
            IReviewTestRegistry(reviewTestRegistry).createSodFinding(paymentId, msg.sender);
        }

        payment.approved = true;
        payment.approver = msg.sender;

        // Authorization breach check — compare approver's encrypted tier against payment's
        // encrypted authLevel. FHE computation runs in AuditRegistry context because this
        // contract holds allowThis on both handles. ReviewTestRegistry stores the result.
        // Only runs if the approver has a configured tier (prevents ops on zero handles).
        if (reviewTestRegistry != address(0) && _approverTierConfigured[msg.sender]) {
            // lt(approverTier, authLevel): true = approver's authority is BELOW required level
            ebool breach     = FHE.lt(_approverTiers[msg.sender], payment.authLevel);
            euint64 authU64  = FHE.asEuint64(payment.authLevel);
            FHE.allowThis(breach);
            FHE.allow(breach, reviewTestRegistry);
            FHE.allow(breach, msg.sender); // approver can decrypt their own result
            FHE.allowThis(authU64);
            FHE.allow(authU64, reviewTestRegistry);

            // Grant all ANALYTICS/FULL auditors decrypt access to the breach ebool.
            // Without this cryptographic grant, auditors can reach getAuthBreachResult()
            // in storage but the FHEVM ACL will block decryption — dead end at the ACL layer.
            for (uint256 i = 0; i < _auditors.length; i++) {
                AuditorAccess access = auditorProfile[_auditors[i]].access;
                if (access == AuditorAccess.ANALYTICS || access == AuditorAccess.FULL) {
                    FHE.allow(breach, _auditors[i]);
                }
            }

            IReviewTestRegistry(reviewTestRegistry).storeAuthBreachResult(
                paymentId, msg.sender, breach, authU64
            );
        }

        emit PaymentApproved(paymentId, msg.sender);
    }

    // ─── Finding Entry Point (called by ReviewTestRegistry only) ─────────────

    /// @notice Creates a finding. Called by the paired ReviewTestRegistry after Gateway
    ///         decryption confirms a test was triggered.
    function recordFinding(
        uint256 paymentId,
        uint8   testType,
        uint8   severity,
        euint64 flaggedHandle,
        bytes32 narrativeHash,
        address auditor,
        bool    isShared
    ) external {
        if (msg.sender != reviewTestRegistry) revert NotReviewRegistry();
        _createFinding(paymentId, testType, severity, flaggedHandle, narrativeHash, auditor, isShared);
    }

    /// @notice Escalates a finding to board-level attention.
    ///         Only owner or FULL auditors can escalate; only CRITICAL severity (== 3) findings
    ///         are eligible. Escalation is immutable — idempotent on double-call.
    ///         Severity 3 maps to Priority.CRITICAL in ReviewTestRegistry.
    function escalateFinding(uint256 findingId) external {
        if (findingId >= _findings.length) revert PaymentNotFound();
        if (msg.sender != owner && auditorProfile[msg.sender].access != AuditorAccess.FULL) revert Unauthorized();
        Finding storage finding = _findings[findingId];
        if (finding.severity != 3) revert Unauthorized(); // only CRITICAL findings may be escalated
        if (finding.escalated) return;                    // idempotent — no revert on repeat call
        finding.escalated = true;
        emit FindingEscalated(findingId, msg.sender);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    function paymentCount() external view returns (uint256) {
        return _payments.length;
    }

    function findingCount() external view returns (uint256) {
        return _findings.length;
    }

    function auditorFindingCount(address auditor) external view returns (uint256) {
        return _auditorFindings[auditor].length;
    }

    function auditorFindingAt(address auditor, uint256 index) external view returns (uint256) {
        return _auditorFindings[auditor][index];
    }

    /// @notice Returns whether an auditor has been granted access to a specific payment.
    ///         True if the auditor was present when the payment was recorded, or if
    ///         grantHistoricalAccess was called for this auditor + paymentId pair.
    ///         Use this on the frontend to check access without relying on revert-as-control-flow.
    function paymentAccessGranted(address auditor, uint256 paymentId) external view returns (bool) {
        return _paymentAccessGranted[auditor][paymentId];
    }

    function auditorCount() external view returns (uint256) {
        return _auditors.length;
    }

    function auditorAt(uint256 index) external view returns (address) {
        return _auditors[index];
    }

    function getAuditors() external view returns (address[] memory) {
        return _auditors;
    }

    /// @notice Returns plaintext metadata for a payment.
    ///         Access controlled: owner, sender, recipient, FULL auditors, or ReviewTestRegistry.
    function getPaymentMeta(uint256 paymentId)
        external
        view
        paymentExists(paymentId)
        returns (
            address sender,
            address recipient,
            address approver,
            bytes32 invoiceHash,
            bytes32 poHash,
            uint32  blockNumber,
            bool    approved
        )
    {
        PaymentRecord storage payment = _payments[paymentId];
        if (!_canReadPayment(payment, paymentId, msg.sender)) revert Unauthorized();
        return (
            payment.sender,
            payment.recipient,
            payment.approver,
            payment.invoiceHash,
            payment.poHash,
            payment.blockNumber,
            payment.approved
        );
    }

    /// @notice Returns the encrypted handles for a payment.
    ///         Access controlled: owner, sender, recipient, FULL auditors, or ReviewTestRegistry.
    function getPaymentHandles(uint256 paymentId)
        external
        view
        paymentExists(paymentId)
        returns (euint64 amount, euint8 category, euint8 authLevel)
    {
        PaymentRecord storage payment = _payments[paymentId];
        if (!_canReadPayment(payment, paymentId, msg.sender)) revert Unauthorized();
        return (payment.amount, payment.category, payment.authLevel);
    }

    /// @notice Returns the encrypted running total for a GL category.
    ///         Access: ANALYTICS or FULL auditors, or the owner.
    function getCategoryTotal(uint8 category) external view returns (euint64) {
        if (category >= CATEGORY_BUCKETS) revert InvalidAddress(); // reusing error for range check
        if (!_canReadAnalytics(msg.sender)) revert Unauthorized();
        return _categoryTotals[category];
    }

    /// @notice Returns the encrypted running total for a recipient address.
    function getRecipientTotal(address recipient) external view returns (euint64) {
        if (!_canReadAnalytics(msg.sender) && msg.sender != recipient) revert Unauthorized();
        return _recipientTotals[recipient];
    }

    /// @notice Returns finding metadata. Access: owner, payment sender/recipient, or FULL auditor.
    ///         Includes the encrypted flaggedHandle — requires FULL access.
    ///         For SIGNAL/ANALYTICS auditors, use getFindingSignal() instead.
    function getFinding(uint256 findingId)
        external
        view
        returns (
            uint256 paymentId,
            uint8   testType,
            uint8   severity,
            euint64 flaggedHandle,
            uint32  triggeredAtBlock,
            bytes32 narrativeHash,
            bool    escalated,
            address triggeredBy,
            bool    isShared
        )
    {
        if (findingId >= _findings.length) revert PaymentNotFound();
        Finding storage finding = _findings[findingId];
        PaymentRecord storage payment = _payments[finding.paymentId];
        if (!_canReadPayment(payment, finding.paymentId, msg.sender)) revert Unauthorized();
        return (
            finding.paymentId,
            finding.testType,
            finding.severity,
            finding.flaggedHandle,
            finding.triggeredAtBlock,
            finding.narrativeHash,
            finding.escalated,
            finding.triggeredBy,
            finding.isShared
        );
    }

    /// @notice Returns plaintext finding metadata for SIGNAL-tier auditors and above.
    ///         Returns testType, severity, block, and paymentId — NOT the encrypted flaggedHandle.
    ///         This fulfils the SIGNAL tier promise ("findings feed") without requiring FULL access.
    ///         Gate: caller must have any access level other than NONE, or be the owner.
    function getFindingSignal(uint256 findingId)
        external
        view
        returns (uint8 testType, uint8 severity, uint32 triggeredAtBlock, uint256 paymentId, address triggeredBy, bool isShared)
    {
        if (findingId >= _findings.length) revert PaymentNotFound();
        if (auditorProfile[msg.sender].access == AuditorAccess.NONE && msg.sender != owner) revert Unauthorized();
        Finding storage f = _findings[findingId];
        return (f.testType, f.severity, f.triggeredAtBlock, f.paymentId, f.triggeredBy, f.isShared);
    }

    // ─── Internal: Payment Recording ─────────────────────────────────────────

    function _recordPayment(
        address sender,
        euint64 amount,
        CallbackAuditFields memory fields
    ) private {
        if (!authThresholdsConfigured) revert ThresholdsNotConfigured();
        if (fields.recipient == address(0)) revert InvalidAddress();

        // Category range validation — clamp any encrypted value >= CATEGORY_BUCKETS to OTHER (7).
        // Without this, an out-of-range category silently matches no rollup bucket and disappears
        // from all analytics and CATEGORY_CONCENTRATION testing while remaining a valid payment.
        // FHE.select avoids decrypting the submitted value at any point.
        ebool  validCategory = FHE.lt(fields.category, FHE.asEuint8(CATEGORY_BUCKETS));
        euint8 safeCategory  = FHE.select(
            validCategory,
            fields.category,
            FHE.asEuint8(uint8(Category.OTHER))
        );

        euint8 derivedAuthLevel = _deriveAuthLevel(amount);

        uint256 paymentId = _payments.length;
        _payments.push(PaymentRecord({
            amount:      amount,
            category:    safeCategory,
            authLevel:   derivedAuthLevel,
            sender:      sender,
            recipient:   fields.recipient,
            approver:    address(0),   // always address(0) at creation
            approved:    false,        // always false at creation
            invoiceHash: fields.invoiceHash,
            poHash:      fields.poHash,
            blockNumber: uint32(block.number)
        }));

        _allowPaymentHandles(_payments[paymentId]);
        _updateRollups(amount, fields.category, fields.recipient);

        // Forward the payment to the actual recipient.
        // The AuditRegistry receives the full cUSDC amount from ConfidentialUSDC
        // (it is the `to` address in the callback), records the audit entry, then
        // immediately routes the funds onward. The AuditRegistry is a pass-through,
        // not a custodian. The stored `payment.amount` handle remains a valid
        // cryptographic reference to the transfer even after funds move on.
        // FHE.allow(amount, address(this)) was already set by ConfidentialUSDC._transfer
        // when it transferred to this contract, so FHE.isAllowed passes.
        IConfidentialToken(confidentialToken).confidentialTransfer(fields.recipient, amount);

        if (reviewTestRegistry != address(0)) {
            IReviewTestRegistry(reviewTestRegistry).evaluateAll(paymentId);
        }

        emit PaymentRecorded(paymentId, sender, fields.recipient);
    }

    // ─── Internal: FHE Derivations ───────────────────────────────────────────

    /// @notice Derives the required authorization level from the payment amount.
    ///         Pure FHE — never decrypted, stored as a handle for test comparisons.
    function _deriveAuthLevel(euint64 amount) private returns (euint8) {
        return FHE.select(
            FHE.gt(amount, _boardThreshold),
            FHE.asEuint8(uint8(AuthLevel.BOARD)),
            FHE.select(
                FHE.gt(amount, _directorThreshold),
                FHE.asEuint8(uint8(AuthLevel.DIRECTOR)),
                FHE.select(
                    FHE.gt(amount, _managerThreshold),
                    FHE.asEuint8(uint8(AuthLevel.MANAGER)),
                    FHE.asEuint8(uint8(AuthLevel.ROUTINE))
                )
            )
        );
    }

    // ─── Internal: Rollups ───────────────────────────────────────────────────

    /// @notice Updates encrypted running totals for category and recipient dimensions.
    ///         Uses FHE.select loop for category (no plaintext leakage of which bucket was hit).
    function _updateRollups(euint64 amount, euint8 category, address recipient) private {
        euint64 zero = FHE.asEuint64(0);

        // Category rollup — 8 FHE iterations (vs old 22 iterations = 64% reduction)
        for (uint8 i = 0; i < CATEGORY_BUCKETS; i++) {
            euint64 delta = FHE.select(FHE.eq(category, FHE.asEuint8(i)), amount, zero);
            _categoryTotals[i] = FHE.add(_categoryTotals[i], delta);
            FHE.allowThis(_categoryTotals[i]);
            _allowAnalyticsHandle(_categoryTotals[i]);
        }

        // Recipient rollup — direct add (recipient is plaintext)
        _recipientTotals[recipient] = FHE.add(_recipientTotals[recipient], amount);
        FHE.allowThis(_recipientTotals[recipient]);
        FHE.allow(_recipientTotals[recipient], recipient);
        _allowAnalyticsHandle(_recipientTotals[recipient]);
    }

    // ─── Internal: ACL Grants ────────────────────────────────────────────────

    /// @notice Issues FHE ACL grants for all encrypted fields on a newly recorded payment.
    ///         ReviewTestRegistry gets direct grants (outside the auditor loop) so it never
    ///         occupies one of the 5 external auditor slots.
    function _allowPaymentHandles(PaymentRecord storage payment) private {
        // Contract self-access — needed for future FHE ops on stored handles
        FHE.allowThis(payment.amount);
        FHE.allowThis(payment.category);
        FHE.allowThis(payment.authLevel);

        // Sender and recipient can decrypt their own payment
        FHE.allow(payment.amount,    payment.sender);
        FHE.allow(payment.amount,    payment.recipient);
        FHE.allow(payment.category,  payment.sender);
        FHE.allow(payment.category,  payment.recipient);
        FHE.allow(payment.authLevel, payment.sender);
        FHE.allow(payment.authLevel, payment.recipient);

        // ReviewTestRegistry — direct grant outside auditor loop (not in _auditors array)
        if (reviewTestRegistry != address(0)) {
            FHE.allow(payment.amount,    reviewTestRegistry);
            FHE.allow(payment.category,  reviewTestRegistry);
            FHE.allow(payment.authLevel, reviewTestRegistry);
        }

        // External human auditors (capped at 5).
        // ANALYTICS tier: rollup totals only (via getCategoryTotal/getRecipientTotal).
        // Per-payment handles (amount/category/authLevel) are FULL-only — ANALYTICS has no
        // getter path to retrieve individual payment handles, so granting them is dead weight.
        for (uint256 i = 0; i < _auditors.length; i++) {
            address auditor = _auditors[i];
            if (auditorProfile[auditor].access == AuditorAccess.FULL) {
                FHE.allow(payment.amount,    auditor);
                FHE.allow(payment.category,  auditor);
                FHE.allow(payment.authLevel, auditor);
                // Record Solidity-level access so _canReadPayment scopes correctly.
                // Only auditors present at recording time get auto-access; late-added FULL
                // auditors must go through grantHistoricalAccess.
                _paymentAccessGranted[auditor][_payments.length - 1] = true;
            }
        }
    }

    /// @notice Issues FHE ACL grants for an analytics handle (rollup total) to all
    ///         ANALYTICS/FULL auditors AND to ReviewTestRegistry.
    ///         ReviewTestRegistry needs access to call FHE.gt(rollupHandle, testThreshold)
    ///         inside evaluateAll() for CATEGORY_CONCENTRATION and RECIPIENT_CONCENTRATION tests.
    function _allowAnalyticsHandle(euint64 handle) private {
        // ReviewTestRegistry always gets access — it needs to FHE.gt() these handles
        if (reviewTestRegistry != address(0)) {
            FHE.allow(handle, reviewTestRegistry);
        }

        for (uint256 i = 0; i < _auditors.length; i++) {
            address auditor = _auditors[i];
            AuditorAccess access = auditorProfile[auditor].access;
            if (access == AuditorAccess.ANALYTICS || access == AuditorAccess.FULL) {
                FHE.allow(handle, auditor);
            }
        }
    }

    // ─── Internal: Finding Creation ──────────────────────────────────────────

    /// @notice Creates a finding and links it to the triggering auditor only.
    ///         flaggedHandle ACL: contract + payment parties + triggering auditor.
    ///         SIGNAL/ANALYTICS auditors see the finding metadata but not the handle.
    function _createFinding(
        uint256 paymentId,
        uint8   testType,
        uint8   severity,
        euint64 flaggedHandle,
        bytes32 narrativeHash,
        address triggeringAuditor,
        bool    isShared
    ) private {
        uint256 findingId = _findings.length;
        _findings.push(Finding({
            paymentId:        paymentId,
            testType:         testType,
            severity:         severity,
            flaggedHandle:    flaggedHandle,
            triggeredAtBlock: uint32(block.number),
            narrativeHash:    narrativeHash,
            escalated:        false,
            triggeredBy:      triggeringAuditor,
            isShared:         isShared
        }));

        PaymentRecord storage payment = _payments[paymentId];
        FHE.allowThis(flaggedHandle);
        FHE.allow(flaggedHandle, payment.sender);
        FHE.allow(flaggedHandle, payment.recipient);
        FHE.allow(flaggedHandle, triggeringAuditor);

        // All auditors with at least SIGNAL access see this finding in their feed if in scope
        uint248 triggeringEngagement = auditorProfile[triggeringAuditor].engagementId;
        for (uint256 i = 0; i < _auditors.length; i++) {
            address aud = _auditors[i];
            if (auditorProfile[aud].access != AuditorAccess.NONE) {
                bool isSameEngagement = auditorProfile[aud].engagementId == triggeringEngagement;
                if (isShared || isSameEngagement) {
                    _auditorFindings[aud].push(findingId);
                }
            }
        }
        // Also add to the triggering auditor (in case they're not in _auditors — e.g. ReviewTestRegistry itself for SoD)
        if (!_auditorListed[triggeringAuditor]) {
            _auditorFindings[triggeringAuditor].push(findingId);
        }

        emit FindingCreated(findingId, paymentId, testType, severity);
    }

    // ─── Internal: Access Control ────────────────────────────────────────────

    /// @notice Checks if an account can read a specific payment's data.
    ///         ReviewTestRegistry gets unconditional read access for test evaluation.
    ///         FULL auditors: must have been present at recording time (auto-granted) or
    ///         explicitly scoped via grantHistoricalAccess for late-added auditors.
    function _canReadPayment(PaymentRecord storage payment, uint256 paymentId, address account) private view returns (bool) {
        if (
            account == owner ||
            account == payment.sender ||
            account == payment.recipient ||
            account == reviewTestRegistry
        ) return true;

        // FULL auditors: check per-payment access grant (set at recording time or via grantHistoricalAccess)
        if (auditorProfile[account].access == AuditorAccess.FULL) {
            return _paymentAccessGranted[account][paymentId];
        }
        return false;
    }

    function _canReadAnalytics(address account) private view returns (bool) {
        AuditorAccess access = auditorProfile[account].access;
        return
            account == owner ||
            account == reviewTestRegistry ||
            access == AuditorAccess.ANALYTICS ||
            access == AuditorAccess.FULL;
    }
}
