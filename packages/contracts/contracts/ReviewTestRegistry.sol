// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig, ZamaConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";

// ─────────────────────────────────────────────────────────────────────────────
// IAuditRegistry — interface used by ReviewTestRegistry to read payment data
// and write findings back to AuditRegistry.
// ─────────────────────────────────────────────────────────────────────────────
interface IAuditRegistry {
    function auditorProfile(address auditor) external view returns (uint8 access, uint248 engagementId);

    function getPaymentHandles(uint256 paymentId)
        external
        view
        returns (euint64 amount, euint8 category, euint8 authLevel);

    function getPaymentMeta(uint256 paymentId)
        external
        view
        returns (
            address sender,
            address recipient,
            address approver,
            bytes32 invoiceHash,
            bytes32 poHash,
            uint32  blockNumber,
            bool    approved
        );

    function getCategoryTotal(uint8 category) external view returns (euint64);
    function getRecipientTotal(address recipient) external view returns (euint64);

    function recordFinding(
        uint256 paymentId,
        uint8   testType,
        uint8   severity,
        euint64 flaggedHandle,
        bytes32 narrativeHash,
        address auditor,
        bool    isShared
    ) external;
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewTestRegistry — rebuilt for Complyr V2
//
// Auditors configure tests here. evaluateAll() is called per payment by AuditRegistry.
// Test results (encrypted ebool) are stored and exposed to auditors who then call
// requestFindingCreation() to trigger Gateway decryption → finding creation.
//
// Key design decisions:
//   - 7 test types, all mapped to real ISA audit assertions
//   - STRUCTURING deferred to V2 (enum value reserved, no-op in evaluateAll)
//   - SEGREGATION_OF_DUTIES fires from approvePayment() not evaluateAll()
//   - Gateway pattern for finding creation (two-phase: evaluate → request → callback)
//   - maxActiveAuditors defaults to 5 (was 32)
//
// V1 known limitations (documented, not bugs):
//   - AUTHORIZATION_BREACH only catches unapproved non-routine payments.
//     Detecting "wrong authority level" requires an on-chain AuthorityRegistry (V2).
//   - STRUCTURING requires encrypted band configuration tied to DoA thresholds (V2).
//   - category is self-reported by sender; auditors verify off-chain via invoiceHash/poHash.
// ─────────────────────────────────────────────────────────────────────────────
contract ReviewTestRegistry is ZamaEthereumConfig {

    // ─── Enums ───────────────────────────────────────────────────────────────

    /// @notice The 7 test types, each mapped to one or more ISA audit assertions.
    enum TestType {
        MATERIALITY,              // 0 — amount > threshold (ISA: Occurrence, Accuracy)
        AUTHORIZATION_BREACH,     // 1 — authLevel > ROUTINE AND !approved (ISA: Authorization)
                                  //     V1: catches unapproved non-routine payments only.
                                  //     V2: add AuthorityRegistry to check approver's level.
        SEGREGATION_OF_DUTIES,    // 2 — sender == approver (ISA: Authorization)
                                  //     Fires from approvePayment(), NOT from evaluateAll().
                                  //     createSodFinding() is the entry point.
        MISSING_EVIDENCE,         // 3 — amount > threshold AND invoiceHash == 0 (ISA: Occurrence)
        CATEGORY_CONCENTRATION,   // 4 — categoryTotal[scope] > threshold (ISA: Classification)
        RECIPIENT_CONCENTRATION,  // 5 — recipientTotal[addr] > threshold (ISA: Completeness)
        STRUCTURING               // 6 — DEFERRED TO V2. Enum reserved. No-op in evaluateAll().
                                  //     Reason: requires encrypted band relative to DoA thresholds.
    }

    /// @notice Test execution priority — controls whether and when a test runs.
    enum Priority {
        NONE,       // 0 — Test disabled
        MONITORING, // 1 — Runs on a cadence (every N payments, via monitoringFrequency)
        STANDARD,   // 2 — Runs on every payment
        CRITICAL    // 3 — Runs on every payment, maps to highest finding severity
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct ReviewTest {
        euint64  threshold;          // Encrypted comparison threshold configured by auditor
        Priority priority;           // Controls when the test runs
        uint8    scope;              // Category index for CATEGORY_CONCENTRATION (0–7); 0 elsewhere
        uint16   monitoringFrequency;// Used only when priority == MONITORING
        bool     exists;
    }

    // ─── State Variables ─────────────────────────────────────────────────────

    // NOTE: not immutable — EIP-1167 clone pattern
    IAuditRegistry public auditRegistry;
    address        public owner;
    uint256        public maxActiveAuditors = 5; // default changed from 32

    mapping(address auditor => mapping(uint8 testType => ReviewTest))                          private _tests;
    mapping(address auditor => mapping(uint256 paymentId => mapping(uint8 testType => ebool))) private _testResults;
    mapping(address auditor => mapping(uint256 paymentId => mapping(uint8 testType => euint64))) private _testedValues; // for Phase 2 finding creation
    mapping(address auditor => mapping(uint256 paymentId => mapping(uint8 testType => bool)))  private _hasTestResult;
    mapping(address auditor => mapping(address recipient => uint256 count))                    private _recipientEvaluationCount;

    // Authorization breach results — keyed by paymentId (not approver) so any ANALYTICS/FULL
    // auditor can retrieve the result. The approver-keyed shape from V1 was cryptographically
    // inert: only the approver could ever decrypt, defeating the audit purpose.
    mapping(uint256 paymentId => ebool  result) private _authBreachResults;
    mapping(uint256 paymentId => bool   hasResult) private _hasAuthBreachResult;
    mapping(address auditor => bool listed)                                                    private _auditorListed;
    mapping(address auditor => bool active)                                                    public  auditorActive;

    address[] public activeAuditors;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event MaxActiveAuditorsSet(uint256 newLimit);
    event TestCreated(address indexed auditor, uint8 indexed testType, uint8 scope, Priority priority);
    event TestDisabled(address indexed auditor, uint8 indexed testType);
    event TestsEvaluated(uint256 indexed paymentId, uint256 auditorCount);
    event TestEvaluated(address indexed auditor, uint256 indexed paymentId, uint8 indexed testType, ebool result);
    event FindingRequested(address indexed auditor, uint256 indexed paymentId, uint8 indexed testType);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotOwner();
    error InvalidAddress();
    error InvalidTestType();
    error InvalidPriority();
    error InvalidScope();
    error InvalidFrequency();
    error Unauthorized();
    error ActiveAuditorLimitReached();
    error TestNotConfigured();
    error ResultNotAvailable();
    error AlreadyInitialized();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Initialization (Clone Pattern) ──────────────────────────────────────

    /// @notice Lock the implementation contract.
    constructor() {
        auditRegistry = IAuditRegistry(address(1));
    }

    /// @notice Called once by ComplyrFactory after cloning. Replaces the constructor.
    ///         Explicitly re-calls FHE.setCoprocessor because EIP-1167 clone proxies do not
    ///         execute the implementation constructor — the clone starts with empty storage.
    ///         Also sets maxActiveAuditors since it defaults to 0 (not 5) on a fresh clone.
    function initialize(address auditRegistry_, address initialOwner) external {
        if (address(auditRegistry) != address(0)) revert AlreadyInitialized();
        if (auditRegistry_ == address(0)) revert InvalidAddress();
        if (initialOwner == address(0)) revert InvalidAddress();

        // Re-initialise the coprocessor for this clone's storage.
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());

        // Restore maxActiveAuditors default (uint256 storage slot is 0 on a fresh clone).
        maxActiveAuditors = 5;

        auditRegistry = IAuditRegistry(auditRegistry_);
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    // ─── Admin Functions ─────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMaxActiveAuditors(uint256 newLimit) external onlyOwner {
        if (newLimit == 0) revert ActiveAuditorLimitReached();
        maxActiveAuditors = newLimit;
        emit MaxActiveAuditorsSet(newLimit);
    }

    // ─── Auditor Test Configuration ───────────────────────────────────────────

    /// @notice Configures or updates a test for the calling auditor.
    ///         Auditor must have ANALYTICS or FULL access granted by the business owner.
    function createTest(
        uint8          testType,
        uint8          scope,
        externalEuint64 encThreshold,
        bytes calldata inputProof,
        Priority       priority,
        uint16         monitoringFrequency
    ) external {
        _requireApprovedAuditor(msg.sender);
        _validateTest(testType, scope, priority, monitoringFrequency);

        euint64 threshold = FHE.fromExternal(encThreshold, inputProof);
        _tests[msg.sender][testType] = ReviewTest({
            threshold:          threshold,
            priority:           priority,
            scope:              scope,
            monitoringFrequency: monitoringFrequency,
            exists:             true
        });

        FHE.allowThis(threshold);
        FHE.allow(threshold, msg.sender);

        _activateAuditor(msg.sender);
        emit TestCreated(msg.sender, testType, scope, priority);
    }

    /// @notice Disables a test (sets priority to NONE) without deleting its config.
    function disableTest(uint8 testType) external {
        if (!_isValidTestType(testType)) revert InvalidTestType();
        ReviewTest storage testConfig = _tests[msg.sender][testType];
        if (!testConfig.exists) revert TestNotConfigured();
        testConfig.priority = Priority.NONE;
        emit TestDisabled(msg.sender, testType);
    }

    // ─── Test Evaluation ─────────────────────────────────────────────────────

    /// @notice Called by AuditRegistry._recordPayment for each payment.
    ///         Runs all configured active tests for all active auditors.
    ///         Results stored as ebool — auditors call requestFindingCreation() to escalate.
    function evaluateAll(uint256 paymentId) external {
        if (msg.sender != address(auditRegistry)) revert Unauthorized();

        // Read payment data once — shared across all auditor iterations
        (euint64 amount, , ) =
            auditRegistry.getPaymentHandles(paymentId);
        (, address recipient, , bytes32 invoiceHash, , ,) =
            auditRegistry.getPaymentMeta(paymentId);

        uint256 auditorCount;

        for (uint256 i = 0; i < activeAuditors.length; i++) {
            address auditor = activeAuditors[i];
            if (!auditorActive[auditor]) continue;
            if (!_isApprovedAuditor(auditor)) continue;

            auditorCount++;
            _recipientEvaluationCount[auditor][recipient]++;

            // ── Test 0: MATERIALITY ─────────────────────────────────────────
            // Assertion: Occurrence, Accuracy — "was this payment above examination threshold?"
            _evaluateEncryptedTest(auditor, paymentId, uint8(TestType.MATERIALITY), amount, recipient);

            // ── Test 1: AUTHORIZATION_BREACH ────────────────────────────────
            // Assertion: Authorization — "approver's encrypted tier < payment's encrypted authLevel?"
            // No longer fires from evaluateAll(). Fires from AuditRegistry.approvePayment() via
            // storeAuthBreachResult() — the only point where both the approver's encrypted tier
            // and the payment's encrypted authLevel are available for a genuine FHE comparison.
            // See AuditRegistry.setApproverTier() for tier configuration.

            // ── Test 2: SEGREGATION_OF_DUTIES ──────────────────────────────
            // Assertion: Authorization — "did the same person initiate and approve?"
            // Does NOT fire here — fires from AuditRegistry.approvePayment() via createSodFinding().
            // At evaluateAll time, approved is always false (no approver yet).

            // ── Test 3: MISSING_EVIDENCE ────────────────────────────────────
            // Assertion: Occurrence — "is there supporting documentation for this payment?"
            // Only run if invoiceHash is empty — no FHE cost if document was provided.
            if (invoiceHash == bytes32(0)) {
                _evaluateEncryptedTest(auditor, paymentId, uint8(TestType.MISSING_EVIDENCE), amount, recipient);
            }

            // ── Test 4: CATEGORY_CONCENTRATION ──────────────────────────────
            // Assertion: Classification — "is too much spend in one GL category?"
            // Guard: only fetch the rollup total if this auditor has configured the test.
            {
                ReviewTest storage catTest = _tests[auditor][uint8(TestType.CATEGORY_CONCENTRATION)];
                if (catTest.exists && catTest.priority != Priority.NONE) {
                    euint64 catTotal = auditRegistry.getCategoryTotal(catTest.scope);
                    _evaluateEncryptedTest(auditor, paymentId, uint8(TestType.CATEGORY_CONCENTRATION), catTotal, recipient);
                }
            }

            // ── Test 5: RECIPIENT_CONCENTRATION ────────────────────────────
            // Assertion: Completeness, Occurrence — "too much spend to one recipient?"
            {
                ReviewTest storage recTest = _tests[auditor][uint8(TestType.RECIPIENT_CONCENTRATION)];
                if (recTest.exists && recTest.priority != Priority.NONE) {
                    euint64 recipientTotal = auditRegistry.getRecipientTotal(recipient);
                    _evaluateEncryptedTest(auditor, paymentId, uint8(TestType.RECIPIENT_CONCENTRATION), recipientTotal, recipient);
                }
            }

            // ── Test 6: STRUCTURING — DEFERRED TO V2 ────────────────────────
            // Reason: detecting "amount just below DoA threshold" requires encrypted band
            // configuration tied to encrypted DoA thresholds. Cannot be configured safely
            // without leaking what the thresholds are. See implementation_plan.md Section 11.
        }

        emit TestsEvaluated(paymentId, auditorCount);
    }

    // ─── SoD Finding Entry Point (called by AuditRegistry.approvePayment) ───

    /// @notice Creates a SEGREGATION_OF_DUTIES finding when approvePayment detects
    ///         that the approver and sender are the same address.
    ///         This bypasses the Gateway flow since the condition is pure plaintext.
    function createSodFinding(uint256 paymentId, address auditor) external {
        if (msg.sender != address(auditRegistry)) revert Unauthorized();

        // Use the payment amount as the flagged handle (most relevant to the finding)
        (euint64 amount, , ) = auditRegistry.getPaymentHandles(paymentId);

        // Create finding directly — no Gateway needed for a plaintext condition
        auditRegistry.recordFinding(
            paymentId,
            uint8(TestType.SEGREGATION_OF_DUTIES),
            uint8(Priority.CRITICAL), // SoD is always critical severity
            amount,
            bytes32(0),
            auditor,
            true // isShared = true for SoD
        );
    }

    // ─── Two-Phase Finding Creation (Gateway Pattern) ────────────────────────

    /// @notice Phase 2 entry point. Called by auditor (or auditor's relay) after
    ///         seeing a TestEvaluated event. Submits the stored ebool to the FHEVM
    ///         Gateway for decryption. If the test fired, onFindingDecrypted creates
    ///         the finding in AuditRegistry.
    ///
    ///         NOTE: Full Gateway integration requires GatewayCaller from the fhevm solidity library.
    ///         If that import is unavailable in the current fhevm version, this function acts as a
    ///         placeholder and the finding can be created via recordFindingIfTriggered().
    function requestFindingCreation(uint256 paymentId, uint8 testType) external {
        _requireApprovedAuditor(msg.sender);
        if (!_isValidTestType(testType)) revert InvalidTestType();
        if (testType == uint8(TestType.SEGREGATION_OF_DUTIES)) revert InvalidTestType(); // handled via createSodFinding
        if (!_hasTestResult[msg.sender][paymentId][testType]) revert ResultNotAvailable();

        emit FindingRequested(msg.sender, paymentId, testType);

        // TODO: Replace with Gateway.requestDecryption when GatewayCaller is available.
        // Current implementation: stub that auditor's off-chain system listens to via
        // FindingRequested event, decrypts the ebool, and calls recordFindingIfTriggered.
    }

    /// @notice Called by auditor's off-chain system after decrypting the ebool result.
    ///         Only creates a finding if the result was true (triggered).
    ///         In production: replaced by onFindingDecrypted Gateway callback.
    function recordFindingIfTriggered(
        uint256 paymentId,
        uint8   testType,
        bool    triggered
    ) external {
        _requireApprovedAuditor(msg.sender);
        if (!_isValidTestType(testType)) revert InvalidTestType();
        if (!_hasTestResult[msg.sender][paymentId][testType]) revert ResultNotAvailable();

        if (!triggered) return; // Test didn't fire — no finding, no on-chain trace

        ReviewTest storage testConfig = _tests[msg.sender][testType];
        euint64 flaggedHandle = _testedValues[msg.sender][paymentId][testType];

        auditRegistry.recordFinding(
            paymentId,
            testType,
            uint8(testConfig.priority),
            flaggedHandle,
            bytes32(0),
            msg.sender,
            false // isShared = false for auditor-specific tests
        );
    }

    // ─── Authorization Breach Result Storage (called by AuditRegistry.approvePayment) ──

    /// @notice Stores a pre-computed AUTHORIZATION_BREACH result from AuditRegistry.
    ///         AuditRegistry performs FHE.lt(approverTier, authLevel) in its own context
    ///         because it holds allowThis on both handles. The breach ebool has already had
    ///         FHE.allow granted to this contract and to all ANALYTICS/FULL auditors before
    ///         this call is made (AuditRegistry loops its _auditors array).
    ///         breach = true: approver's tier was BELOW the payment's required authLevel.
    ///         breach = false: approver had sufficient authority — no finding will be created.
    ///
    ///         Keyed by paymentId (not approver) so any ANALYTICS/FULL auditor can retrieve
    ///         via getAuthBreachResult(). The approver address is retained only for the event.
    function storeAuthBreachResult(
        uint256 paymentId,
        address approver,
        ebool   breach,
        euint64 authLevelHandle
    ) external {
        if (msg.sender != address(auditRegistry)) revert Unauthorized();
        uint8 testType = uint8(TestType.AUTHORIZATION_BREACH);

        _authBreachResults[paymentId]   = breach;
        _hasAuthBreachResult[paymentId] = true;

        FHE.allowThis(breach);
        FHE.allowThis(authLevelHandle);
        // approver retains personal decrypt access
        FHE.allow(breach, approver);

        emit TestEvaluated(approver, paymentId, testType, breach);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /// @notice Returns the AUTHORIZATION_BREACH ebool for a payment.
    ///         Access: ANALYTICS or FULL auditors, and the payment approver (via personal grant).
    ///         Unlike getTestResult(), this is keyed by paymentId — the breach is a per-payment
    ///         fact, not a per-auditor test result.
    function getAuthBreachResult(uint256 paymentId) external view returns (ebool) {
        if (!_isApprovedAuditor(msg.sender) && msg.sender != owner) revert Unauthorized();
        if (!_hasAuthBreachResult[paymentId]) revert ResultNotAvailable();
        return _authBreachResults[paymentId];
    }

    function getTest(address auditor, uint8 testType)
        external
        view
        returns (Priority priority, uint8 scope, uint16 monitoringFrequency, bool exists, euint64 threshold)
    {
        if (msg.sender != auditor && msg.sender != owner) revert Unauthorized();
        if (!_isValidTestType(testType)) revert InvalidTestType();
        ReviewTest storage testConfig = _tests[auditor][testType];
        return (
            testConfig.priority,
            testConfig.scope,
            testConfig.monitoringFrequency,
            testConfig.exists,
            testConfig.threshold
        );
    }

    function getTestResult(address auditor, uint256 paymentId, uint8 testType) external view returns (ebool) {
        if (msg.sender != auditor && msg.sender != owner) revert Unauthorized();
        if (!_isValidTestType(testType)) revert InvalidTestType();
        if (!_hasTestResult[auditor][paymentId][testType]) revert ResultNotAvailable();
        return _testResults[auditor][paymentId][testType];
    }

    function activeAuditorCount() external view returns (uint256) {
        return activeAuditors.length;
    }

    // ─── Internal: Test Execution ────────────────────────────────────────────

    /// @notice Runs a single FHE comparison test and stores the encrypted result.
    ///         Also stores the tested value for use as a flaggedHandle in Phase 2.
    ///         recipient is passed through to _shouldRun so MONITORING frequency
    ///         gates work correctly (count-based per recipient).
    function _evaluateEncryptedTest(
        address auditor,
        uint256 paymentId,
        uint8   testType,
        euint64 valueToTest,
        address recipient
    ) private {
        ReviewTest storage testConfig = _tests[auditor][testType];
        if (!testConfig.exists || testConfig.priority == Priority.NONE) return;
        if (!_shouldRun(testConfig, auditor, recipient)) return;

        ebool result = FHE.gt(valueToTest, testConfig.threshold);

        _testResults[auditor][paymentId][testType]  = result;
        _testedValues[auditor][paymentId][testType] = valueToTest; // stored for Phase 2 flaggedHandle
        _hasTestResult[auditor][paymentId][testType] = true;

        FHE.allowThis(result);
        FHE.allow(result, auditor);

        emit TestEvaluated(auditor, paymentId, testType, result);
    }

    // ─── Internal: Helpers ────────────────────────────────────────────────────

    function _shouldRun(ReviewTest storage testConfig, address auditor, address recipient) private view returns (bool) {
        if (testConfig.priority == Priority.CRITICAL || testConfig.priority == Priority.STANDARD) return true;
        // MONITORING: run only on every Nth occurrence for this recipient
        if (recipient == address(0)) return true; // non-recipient-specific tests always run
        uint256 count = _recipientEvaluationCount[auditor][recipient];
        return count != 0 && count % testConfig.monitoringFrequency == 0;
    }

    function _activateAuditor(address auditor) private {
        if (_auditorListed[auditor]) {
            auditorActive[auditor] = true;
            return;
        }
        if (activeAuditors.length >= maxActiveAuditors) revert ActiveAuditorLimitReached();
        _auditorListed[auditor] = true;
        auditorActive[auditor] = true;
        activeAuditors.push(auditor);
    }

    function _requireApprovedAuditor(address auditor) private view {
        if (!_isApprovedAuditor(auditor)) revert Unauthorized();
    }

    function _isApprovedAuditor(address auditor) private view returns (bool) {
        (uint8 access, ) = auditRegistry.auditorProfile(auditor);
        return access == 2 || access == 3; // ANALYTICS or FULL
    }

    function _validateTest(uint8 testType, uint8 scope, Priority priority, uint16 monitoringFrequency) private pure {
        if (!_isValidTestType(testType)) revert InvalidTestType();
        if (uint8(priority) > uint8(Priority.CRITICAL)) revert InvalidPriority();
        if (priority == Priority.MONITORING && monitoringFrequency == 0) revert InvalidFrequency();
        if (priority != Priority.MONITORING && monitoringFrequency != 0) revert InvalidFrequency();

        // CATEGORY_CONCENTRATION: scope must be a valid Category index (0–7)
        if (testType == uint8(TestType.CATEGORY_CONCENTRATION) && scope > 7) revert InvalidScope();

        // All other tests: scope must be 0 (unused)
        if (testType != uint8(TestType.CATEGORY_CONCENTRATION) && scope != 0) revert InvalidScope();
    }

    function _isValidTestType(uint8 testType) private pure returns (bool) {
        return testType <= uint8(TestType.STRUCTURING); // 0–6
    }
}
