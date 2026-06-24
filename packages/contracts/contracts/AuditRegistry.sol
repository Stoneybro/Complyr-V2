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
import {ZamaEthereumConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";

interface IConfidentialFungibleTokenReceiver {
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool);
}

contract AuditRegistry is IConfidentialFungibleTokenReceiver, ZamaEthereumConfig {
    enum PurposeCode {
        GDDS,
        SVCS,
        SALA,
        SUPP,
        CONS,
        REBT,
        RENT,
        TAXS,
        INTC,
        LOAN,
        INVS,
        OTHR
    }

    enum RiskTier {
        LOW,
        MEDIUM,
        HIGH,
        WATCHLIST
    }

    enum CounterpartyType {
        VENDOR,
        CONTRACTOR,
        EMPLOYEE,
        INTERCOMPANY,
        GOVERNMENT
    }

    enum AuthTier {
        ROUTINE,
        MANAGER,
        DIRECTOR,
        BOARD
    }

    enum JurisdictionCode {
        DOMESTIC,
        FATF_COMPLIANT,
        FATF_GREY,
        HIGH_RISK,
        SANCTIONED
    }

    enum AuditorAccess {
        NONE,
        SIGNAL,
        ANALYTICS,
        FULL
    }

    struct PaymentRecord {
        euint64 amount;
        euint8 purposeCode;
        euint8 riskTier;
        euint8 counterpartyType;
        euint8 authTier;
        address sender;
        address recipient;
        address approver;
        bytes32 referenceId;
        bytes32 docHash;
        uint32 blockNumber;
        uint8 jurisdictionCode;
        bool requiresApproval;
        bool approved;
    }

    struct Finding {
        uint256 paymentId;
        uint8 testType;
        uint8 severity;
        euint64 flaggedHandle;
        uint32 triggeredAtBlock;
        bytes32 narrativeHash;
        bool escalated;
    }

    struct ExternalAuditFields {
        externalEuint8 purposeCode;
        externalEuint8 riskTier;
        externalEuint8 counterpartyType;
        bytes inputProof;
        address recipient;
        bytes32 referenceId;
        bytes32 docHash;
        uint8 jurisdictionCode;
        bool requiresApproval;
        bool approved;
        address approver;
    }

    struct CallbackAuditFields {
        euint8 purposeCode;
        euint8 riskTier;
        euint8 counterpartyType;
        address recipient;
        bytes32 referenceId;
        bytes32 docHash;
        uint8 jurisdictionCode;
        bool requiresApproval;
        bool approved;
        address approver;
    }

    uint8 private constant PURPOSE_BUCKETS = 12;
    uint8 private constant RISK_BUCKETS = 4;
    uint8 private constant JURISDICTION_BUCKETS = 5;
    uint8 private constant COUNTERPARTY_BUCKETS = 5;

    address public immutable confidentialToken;
    address public owner;
    bool public authThresholdsConfigured;

    euint64 private _managerThreshold;
    euint64 private _directorThreshold;
    euint64 private _boardThreshold;

    PaymentRecord[] private _payments;
    Finding[] private _findings;
    address[] private _auditors;

    mapping(address auditor => AuditorAccess access) public auditorAccess;
    mapping(uint8 purposeCode => euint64 total) private _purposeTotals;
    mapping(uint8 riskTier => euint64 total) private _riskTierTotals;
    mapping(uint8 counterpartyType => euint64 total) private _counterpartyTotals;
    mapping(uint8 jurisdictionCode => euint64 total) private _jurisdictionTotals;
    mapping(address recipient => euint64 total) private _recipientTotals;
    mapping(address auditor => bool listed) private _auditorListed;
    mapping(address auditor => uint256[] findingIds) private _auditorFindings;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AuditorAccessSet(address indexed auditor, AuditorAccess access);
    event AuthTierThresholdsSet(address indexed auditor);
    event PaymentRecorded(uint256 indexed paymentId, address indexed sender, address indexed recipient);
    event DocumentAttached(uint256 indexed paymentId, bytes32 docHash);
    event PaymentApproved(uint256 indexed paymentId, address indexed approver);
    event FindingCreated(uint256 indexed findingId, uint256 indexed paymentId, uint8 testType, uint8 severity);

    error NotOwner();
    error NotToken();
    error InvalidAddress();
    error InvalidEnumValue();
    error ThresholdsNotConfigured();
    error Unauthorized();
    error PaymentNotFound();
    error DocumentAlreadyAttached();
    error SelfApproval();
    error PaymentAlreadyApproved();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier paymentExists(uint256 paymentId) {
        if (paymentId >= _payments.length) revert PaymentNotFound();
        _;
    }

    constructor(address confidentialToken_) {
        if (confidentialToken_ == address(0)) revert InvalidAddress();
        confidentialToken = confidentialToken_;
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAuditorAccess(address auditor, AuditorAccess access) external onlyOwner {
        if (auditor == address(0)) revert InvalidAddress();
        if (!_auditorListed[auditor]) {
            _auditorListed[auditor] = true;
            _auditors.push(auditor);
        }
        auditorAccess[auditor] = access;
        emit AuditorAccessSet(auditor, access);
    }

    /**
     * ACL grants:
     * - address(this): required because future payment auth-tier derivation compares payment amounts with these handles.
     * - msg.sender: lets the configuring auditor re-encrypt/decrypt their own thresholds for local verification.
     */
    function setAuthTierThresholds(
        externalEuint64 managerThreshold,
        externalEuint64 directorThreshold,
        externalEuint64 boardThreshold,
        bytes calldata inputProof
    ) external {
        AuditorAccess access = auditorAccess[msg.sender];
        if (msg.sender != owner && access != AuditorAccess.ANALYTICS && access != AuditorAccess.FULL) revert Unauthorized();

        _managerThreshold = FHE.fromExternal(managerThreshold, inputProof);
        _directorThreshold = FHE.fromExternal(directorThreshold, inputProof);
        _boardThreshold = FHE.fromExternal(boardThreshold, inputProof);

        FHE.allowThis(_managerThreshold);
        FHE.allowThis(_directorThreshold);
        FHE.allowThis(_boardThreshold);
        FHE.allow(_managerThreshold, msg.sender);
        FHE.allow(_directorThreshold, msg.sender);
        FHE.allow(_boardThreshold, msg.sender);

        authThresholdsConfigured = true;
        emit AuthTierThresholdsSet(msg.sender);
    }

    function recordPayment(
        externalEuint64 amount,
        bytes calldata amountProof,
        ExternalAuditFields calldata fields
    ) external returns (uint256 paymentId) {
        euint64 encryptedAmount = FHE.fromExternal(amount, amountProof);
        euint8 purposeCode = FHE.fromExternal(fields.purposeCode, fields.inputProof);
        euint8 submittedRiskTier = FHE.fromExternal(fields.riskTier, fields.inputProof);
        euint8 counterpartyType = FHE.fromExternal(fields.counterpartyType, fields.inputProof);

        return
            _recordPayment(
                msg.sender,
                encryptedAmount,
                CallbackAuditFields({
                    purposeCode: purposeCode,
                    riskTier: submittedRiskTier,
                    counterpartyType: counterpartyType,
                    recipient: fields.recipient,
                    referenceId: fields.referenceId,
                    docHash: fields.docHash,
                    jurisdictionCode: fields.jurisdictionCode,
                    requiresApproval: fields.requiresApproval,
                    approved: fields.approved,
                    approver: fields.approver
                })
            );
    }

    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override returns (ebool) {
        if (msg.sender != confidentialToken) revert NotToken();
        CallbackAuditFields memory fields = abi.decode(data, (CallbackAuditFields));
        _recordPayment(from, amount, fields);
        return FHE.asEbool(true);
    }

    function attachDocument(uint256 paymentId, bytes32 docHash) external paymentExists(paymentId) {
        PaymentRecord storage payment = _payments[paymentId];
        if (msg.sender != payment.sender) revert Unauthorized();
        if (payment.docHash != bytes32(0)) revert DocumentAlreadyAttached();
        payment.docHash = docHash;
        emit DocumentAttached(paymentId, docHash);
    }

    function approvePayment(uint256 paymentId) external paymentExists(paymentId) {
        PaymentRecord storage payment = _payments[paymentId];
        if (payment.approved) revert PaymentAlreadyApproved();
        if (msg.sender == payment.sender) revert SelfApproval();
        if (payment.approver != address(0) && msg.sender != payment.approver) revert Unauthorized();

        payment.approved = true;
        payment.approver = msg.sender;
        emit PaymentApproved(paymentId, msg.sender);
    }

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

    function getPaymentMeta(
        uint256 paymentId
    )
        external
        view
        paymentExists(paymentId)
        returns (
            address sender,
            address recipient,
            address approver,
            bytes32 referenceId,
            bytes32 docHash,
            uint32 blockNumber,
            uint8 jurisdictionCode,
            bool requiresApproval,
            bool approved
        )
    {
        PaymentRecord storage payment = _payments[paymentId];
        return (
            payment.sender,
            payment.recipient,
            payment.approver,
            payment.referenceId,
            payment.docHash,
            payment.blockNumber,
            payment.jurisdictionCode,
            payment.requiresApproval,
            payment.approved
        );
    }

    function getPaymentHandles(
        uint256 paymentId
    )
        external
        view
        paymentExists(paymentId)
        returns (euint64 amount, euint8 purposeCode, euint8 riskTier, euint8 counterpartyType, euint8 authTier)
    {
        PaymentRecord storage payment = _payments[paymentId];
        if (!_canReadPayment(payment, msg.sender)) revert Unauthorized();
        return (payment.amount, payment.purposeCode, payment.riskTier, payment.counterpartyType, payment.authTier);
    }

    function getPurposeTotal(uint8 purposeCode) external view returns (euint64) {
        if (purposeCode >= PURPOSE_BUCKETS) revert InvalidEnumValue();
        if (!_canReadAnalytics(msg.sender)) revert Unauthorized();
        return _purposeTotals[purposeCode];
    }

    function getRiskTierTotal(uint8 riskTier) external view returns (euint64) {
        if (riskTier >= RISK_BUCKETS) revert InvalidEnumValue();
        if (!_canReadAnalytics(msg.sender)) revert Unauthorized();
        return _riskTierTotals[riskTier];
    }

    function getJurisdictionTotal(uint8 jurisdictionCode) external view returns (euint64) {
        if (jurisdictionCode >= JURISDICTION_BUCKETS) revert InvalidEnumValue();
        if (!_canReadAnalytics(msg.sender)) revert Unauthorized();
        return _jurisdictionTotals[jurisdictionCode];
    }

    function getCounterpartyTotal(uint8 counterpartyType) external view returns (euint64) {
        if (counterpartyType >= COUNTERPARTY_BUCKETS) revert InvalidEnumValue();
        if (!_canReadAnalytics(msg.sender)) revert Unauthorized();
        return _counterpartyTotals[counterpartyType];
    }

    function getRecipientTotal(address recipient) external view returns (euint64) {
        if (!_canReadAnalytics(msg.sender) && msg.sender != recipient) revert Unauthorized();
        return _recipientTotals[recipient];
    }

    function getFinding(
        uint256 findingId
    )
        external
        view
        returns (
            uint256 paymentId,
            uint8 testType,
            uint8 severity,
            euint64 flaggedHandle,
            uint32 triggeredAtBlock,
            bytes32 narrativeHash,
            bool escalated
        )
    {
        Finding storage finding = _findings[findingId];
        PaymentRecord storage payment = _payments[finding.paymentId];
        if (!_canReadPayment(payment, msg.sender)) revert Unauthorized();
        return (
            finding.paymentId,
            finding.testType,
            finding.severity,
            finding.flaggedHandle,
            finding.triggeredAtBlock,
            finding.narrativeHash,
            finding.escalated
        );
    }

    function riskFloorFromJurisdiction(uint8 jurisdictionCode) public pure returns (uint8) {
        if (jurisdictionCode == uint8(JurisdictionCode.SANCTIONED)) return uint8(RiskTier.WATCHLIST);
        if (jurisdictionCode == uint8(JurisdictionCode.HIGH_RISK)) return uint8(RiskTier.HIGH);
        if (jurisdictionCode == uint8(JurisdictionCode.FATF_GREY)) return uint8(RiskTier.MEDIUM);
        if (jurisdictionCode < JURISDICTION_BUCKETS) return uint8(RiskTier.LOW);
        revert InvalidEnumValue();
    }

    function _recordPayment(
        address sender,
        euint64 amount,
        CallbackAuditFields memory fields
    ) private returns (uint256 paymentId) {
        if (!authThresholdsConfigured) revert ThresholdsNotConfigured();
        if (fields.recipient == address(0)) revert InvalidAddress();
        _validatePlainEnums(fields.jurisdictionCode);

        euint8 effectiveRiskTier = _clampRiskTier(fields.jurisdictionCode, fields.riskTier);
        euint8 derivedAuthTier = _deriveAuthTier(amount);

        paymentId = _payments.length;
        _payments.push(
            PaymentRecord({
                amount: amount,
                purposeCode: fields.purposeCode,
                riskTier: effectiveRiskTier,
                counterpartyType: fields.counterpartyType,
                authTier: derivedAuthTier,
                sender: sender,
                recipient: fields.recipient,
                approver: fields.approver,
                referenceId: fields.referenceId,
                docHash: fields.docHash,
                blockNumber: uint32(block.number),
                jurisdictionCode: fields.jurisdictionCode,
                requiresApproval: fields.requiresApproval,
                approved: fields.approved
            })
        );

        _allowPaymentHandles(_payments[paymentId]);
        _updateRollups(
            amount,
            fields.purposeCode,
            effectiveRiskTier,
            fields.counterpartyType,
            fields.jurisdictionCode,
            fields.recipient
        );

        if (fields.requiresApproval && !fields.approved) {
            _createFinding(paymentId, 10, 2, amount, bytes32(0));
        }
        if (fields.approved && fields.approver == sender) {
            _createFinding(paymentId, 11, 3, amount, bytes32(0));
        }

        emit PaymentRecorded(paymentId, sender, fields.recipient);
    }

    function _validatePlainEnums(uint8 jurisdictionCode) private pure {
        if (jurisdictionCode >= JURISDICTION_BUCKETS) revert InvalidEnumValue();
    }

    function _deriveAuthTier(euint64 amount) private returns (euint8) {
        return
            FHE.select(
                FHE.gt(amount, _boardThreshold),
                FHE.asEuint8(uint8(AuthTier.BOARD)),
                FHE.select(
                    FHE.gt(amount, _directorThreshold),
                    FHE.asEuint8(uint8(AuthTier.DIRECTOR)),
                    FHE.select(
                        FHE.gt(amount, _managerThreshold),
                        FHE.asEuint8(uint8(AuthTier.MANAGER)),
                        FHE.asEuint8(uint8(AuthTier.ROUTINE))
                    )
                )
            );
    }

    function _clampRiskTier(uint8 jurisdictionCode, euint8 submittedRiskTier) private returns (euint8) {
        euint8 floor = FHE.asEuint8(riskFloorFromJurisdiction(jurisdictionCode));
        return FHE.select(FHE.gt(floor, submittedRiskTier), floor, submittedRiskTier);
    }

    function _updateRollups(
        euint64 amount,
        euint8 purposeCode,
        euint8 riskTier,
        euint8 counterpartyType,
        uint8 jurisdictionCode,
        address recipient
    ) private {
        euint64 zero = FHE.asEuint64(0);

        for (uint8 i = 0; i < PURPOSE_BUCKETS; i++) {
            euint64 delta = FHE.select(FHE.eq(purposeCode, FHE.asEuint8(i)), amount, zero);
            _purposeTotals[i] = FHE.add(_purposeTotals[i], delta);
            FHE.allowThis(_purposeTotals[i]);
            _allowAnalyticsHandle(_purposeTotals[i]);
        }

        for (uint8 i = 0; i < RISK_BUCKETS; i++) {
            euint64 delta = FHE.select(FHE.eq(riskTier, FHE.asEuint8(i)), amount, zero);
            _riskTierTotals[i] = FHE.add(_riskTierTotals[i], delta);
            FHE.allowThis(_riskTierTotals[i]);
            _allowAnalyticsHandle(_riskTierTotals[i]);
        }

        for (uint8 i = 0; i < COUNTERPARTY_BUCKETS; i++) {
            euint64 delta = FHE.select(FHE.eq(counterpartyType, FHE.asEuint8(i)), amount, zero);
            _counterpartyTotals[i] = FHE.add(_counterpartyTotals[i], delta);
            FHE.allowThis(_counterpartyTotals[i]);
            _allowAnalyticsHandle(_counterpartyTotals[i]);
        }

        _jurisdictionTotals[jurisdictionCode] = FHE.add(_jurisdictionTotals[jurisdictionCode], amount);
        FHE.allowThis(_jurisdictionTotals[jurisdictionCode]);
        _allowAnalyticsHandle(_jurisdictionTotals[jurisdictionCode]);

        _recipientTotals[recipient] = FHE.add(_recipientTotals[recipient], amount);
        FHE.allowThis(_recipientTotals[recipient]);
        FHE.allow(_recipientTotals[recipient], recipient);
        _allowAnalyticsHandle(_recipientTotals[recipient]);
    }

    /**
     * ACL grants:
     * - address(this): required for future FHE computations over stored payment fields.
     * - sender and recipient: each party can re-encrypt/decrypt its own payment record.
     * - analytics/full auditors: can inspect encrypted classifications; full auditors can inspect amount handles.
     */
    function _allowPaymentHandles(PaymentRecord storage payment) private {
        FHE.allowThis(payment.amount);
        FHE.allowThis(payment.purposeCode);
        FHE.allowThis(payment.riskTier);
        FHE.allowThis(payment.counterpartyType);
        FHE.allowThis(payment.authTier);

        FHE.allow(payment.amount, payment.sender);
        FHE.allow(payment.amount, payment.recipient);
        FHE.allow(payment.purposeCode, payment.sender);
        FHE.allow(payment.purposeCode, payment.recipient);
        FHE.allow(payment.riskTier, payment.sender);
        FHE.allow(payment.riskTier, payment.recipient);
        FHE.allow(payment.counterpartyType, payment.sender);
        FHE.allow(payment.counterpartyType, payment.recipient);
        FHE.allow(payment.authTier, payment.sender);
        FHE.allow(payment.authTier, payment.recipient);

        for (uint256 i = 0; i < _auditors.length; i++) {
            address auditor = _auditors[i];
            AuditorAccess access = auditorAccess[auditor];
            if (access == AuditorAccess.ANALYTICS || access == AuditorAccess.FULL) {
                FHE.allow(payment.purposeCode, auditor);
                FHE.allow(payment.riskTier, auditor);
                FHE.allow(payment.counterpartyType, auditor);
                FHE.allow(payment.authTier, auditor);
            }
            if (access == AuditorAccess.FULL) {
                FHE.allow(payment.amount, auditor);
            }
        }
    }

    /**
     * ACL grants:
     * - address(this): assigned by the caller before this helper for future threshold tests.
     * - analytics/full auditors: can decrypt aggregate totals without receiving every raw payment amount.
     */
    function _allowAnalyticsHandle(euint64 handle) private {
        for (uint256 i = 0; i < _auditors.length; i++) {
            address auditor = _auditors[i];
            AuditorAccess access = auditorAccess[auditor];
            if (access == AuditorAccess.ANALYTICS || access == AuditorAccess.FULL) {
                FHE.allow(handle, auditor);
            }
        }
    }

    function _createFinding(
        uint256 paymentId,
        uint8 testType,
        uint8 severity,
        euint64 flaggedHandle,
        bytes32 narrativeHash
    ) private {
        uint256 findingId = _findings.length;
        _findings.push(
            Finding({
                paymentId: paymentId,
                testType: testType,
                severity: severity,
                flaggedHandle: flaggedHandle,
                triggeredAtBlock: uint32(block.number),
                narrativeHash: narrativeHash,
                escalated: false
            })
        );

        PaymentRecord storage payment = _payments[paymentId];
        FHE.allowThis(flaggedHandle);
        FHE.allow(flaggedHandle, payment.sender);
        FHE.allow(flaggedHandle, payment.recipient);

        for (uint256 i = 0; i < _auditors.length; i++) {
            address auditor = _auditors[i];
            if (auditorAccess[auditor] != AuditorAccess.NONE) {
                _auditorFindings[auditor].push(findingId);
                if (auditorAccess[auditor] == AuditorAccess.FULL) {
                    FHE.allow(flaggedHandle, auditor);
                }
            }
        }

        emit FindingCreated(findingId, paymentId, testType, severity);
    }

    function _canReadPayment(PaymentRecord storage payment, address account) private view returns (bool) {
        return
            account == owner ||
            account == payment.sender ||
            account == payment.recipient ||
            auditorAccess[account] == AuditorAccess.FULL;
    }

    function _canReadAnalytics(address account) private view returns (bool) {
        AuditorAccess access = auditorAccess[account];
        return account == owner || access == AuditorAccess.ANALYTICS || access == AuditorAccess.FULL;
    }
}
