// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";

interface IAuditRegistry {
    function auditorAccess(address auditor) external view returns (uint8);

    function getPaymentHandles(
        uint256 paymentId
    ) external view returns (euint64 amount, bytes32 purposeCode, bytes32 riskTier, bytes32 counterpartyType, bytes32 authTier);

    function getPaymentMeta(
        uint256 paymentId
    )
        external
        view
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
        );

    function getPurposeTotal(uint8 purposeCode) external view returns (euint64);
    function getRiskTierTotal(uint8 riskTier) external view returns (euint64);
    function getCounterpartyTotal(uint8 counterpartyType) external view returns (euint64);
    function getJurisdictionTotal(uint8 jurisdictionCode) external view returns (euint64);
    function getRecipientTotal(address recipient) external view returns (euint64);
}

contract ReviewTestRegistry is ZamaEthereumConfig {
    enum TestType {
        LARGE_PAYMENT,
        PURPOSE_EXPOSURE,
        RISK_TIER_SPIKE,
        JURISDICTION_EXPOSURE,
        RECIPIENT_EXPOSURE,
        COUNTERPARTY_PATTERN
    }

    enum Priority {
        NONE,
        MONITORING,
        STANDARD,
        CRITICAL
    }

    struct ReviewTest {
        euint64 threshold;
        Priority priority;
        uint8 scope;
        uint16 monitoringFrequency;
        bool exists;
    }

    IAuditRegistry public immutable auditRegistry;
    address public owner;
    uint256 public maxActiveAuditors = 32;

    mapping(address auditor => mapping(uint8 testType => ReviewTest testConfig)) private _tests;
    mapping(address auditor => mapping(uint256 paymentId => mapping(uint8 testType => ebool result))) private _testResults;
    mapping(address auditor => mapping(uint256 paymentId => mapping(uint8 testType => bool exists))) private _hasTestResult;
    mapping(address auditor => mapping(address recipient => uint256 count)) private _recipientEvaluationCount;
    mapping(address auditor => bool listed) private _auditorListed;
    mapping(address auditor => bool active) public auditorActive;

    address[] public activeAuditors;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event MaxActiveAuditorsSet(uint256 maxActiveAuditors);
    event TestCreated(address indexed auditor, uint8 indexed testType, uint8 scope, Priority priority);
    event TestDisabled(address indexed auditor, uint8 indexed testType);
    event TestsEvaluated(uint256 indexed paymentId, uint256 auditorCount);
    event TestEvaluated(address indexed auditor, uint256 indexed paymentId, uint8 indexed testType, ebool result);

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

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address auditRegistry_) {
        if (auditRegistry_ == address(0)) revert InvalidAddress();
        auditRegistry = IAuditRegistry(auditRegistry_);
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

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

    /**
     * ACL grants:
     * - address(this): required so this registry can compare payment values with the encrypted threshold.
     * - msg.sender: lets the creating auditor decrypt/re-encrypt their own threshold for local verification.
     */
    function createTest(
        uint8 testType,
        uint8 scope,
        externalEuint64 encThreshold,
        bytes calldata inputProof,
        Priority priority,
        uint16 monitoringFrequency
    ) external {
        _requireApprovedAuditor(msg.sender);
        _validateTest(testType, scope, priority, monitoringFrequency);

        euint64 threshold = FHE.fromExternal(encThreshold, inputProof);
        _tests[msg.sender][testType] = ReviewTest({
            threshold: threshold,
            priority: priority,
            scope: scope,
            monitoringFrequency: monitoringFrequency,
            exists: true
        });

        FHE.allowThis(threshold);
        FHE.allow(threshold, msg.sender);

        _activateAuditor(msg.sender);
        emit TestCreated(msg.sender, testType, scope, priority);
    }

    function disableTest(uint8 testType) external {
        if (!_isValidTestType(testType)) revert InvalidTestType();
        ReviewTest storage testConfig = _tests[msg.sender][testType];
        if (!testConfig.exists) revert TestNotConfigured();
        testConfig.priority = Priority.NONE;
        emit TestDisabled(msg.sender, testType);
    }

    function evaluateAll(uint256 paymentId) external {
        if (msg.sender != address(auditRegistry)) revert Unauthorized();

        (euint64 amount, , , , ) = auditRegistry.getPaymentHandles(paymentId);
        (, address recipient, , , , , uint8 jurisdictionCode, , ) = auditRegistry.getPaymentMeta(paymentId);

        uint256 auditorCount;
        for (uint256 i = 0; i < activeAuditors.length; i++) {
            address auditor = activeAuditors[i];
            if (!auditorActive[auditor]) continue;
            if (!_isApprovedAuditor(auditor)) continue;

            auditorCount++;
            _recipientEvaluationCount[auditor][recipient]++;

            _evaluateTest(auditor, paymentId, uint8(TestType.LARGE_PAYMENT), amount, recipient);
            _evaluateTest(
                auditor,
                paymentId,
                uint8(TestType.PURPOSE_EXPOSURE),
                auditRegistry.getPurposeTotal(_tests[auditor][uint8(TestType.PURPOSE_EXPOSURE)].scope),
                recipient
            );
            _evaluateTest(auditor, paymentId, uint8(TestType.RISK_TIER_SPIKE), _highAndWatchlistTotal(), recipient);
            _evaluateTest(
                auditor,
                paymentId,
                uint8(TestType.JURISDICTION_EXPOSURE),
                auditRegistry.getJurisdictionTotal(jurisdictionCode),
                recipient
            );
            _evaluateTest(
                auditor,
                paymentId,
                uint8(TestType.RECIPIENT_EXPOSURE),
                auditRegistry.getRecipientTotal(recipient),
                recipient
            );
            _evaluateTest(
                auditor,
                paymentId,
                uint8(TestType.COUNTERPARTY_PATTERN),
                auditRegistry.getCounterpartyTotal(_tests[auditor][uint8(TestType.COUNTERPARTY_PATTERN)].scope),
                recipient
            );
        }

        emit TestsEvaluated(paymentId, auditorCount);
    }

    function getTest(
        address auditor,
        uint8 testType
    ) external view returns (Priority priority, uint8 scope, uint16 monitoringFrequency, bool exists, euint64 threshold) {
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

    function _evaluateTest(
        address auditor,
        uint256 paymentId,
        uint8 testType,
        euint64 valueToTest,
        address recipient
    ) private {
        ReviewTest storage testConfig = _tests[auditor][testType];
        if (!testConfig.exists || testConfig.priority == Priority.NONE) return;
        if (!_shouldRun(testConfig, auditor, recipient)) return;

        ebool result = FHE.gt(valueToTest, testConfig.threshold);
        _testResults[auditor][paymentId][testType] = result;
        _hasTestResult[auditor][paymentId][testType] = true;

        FHE.allowThis(result);
        FHE.allow(result, auditor);

        emit TestEvaluated(auditor, paymentId, testType, result);
    }

    function _highAndWatchlistTotal() private returns (euint64) {
        euint64 highTotal = auditRegistry.getRiskTierTotal(2);
        euint64 watchlistTotal = auditRegistry.getRiskTierTotal(3);
        euint64 combined = FHE.add(highTotal, watchlistTotal);
        FHE.allowThis(combined);
        return combined;
    }

    function _shouldRun(ReviewTest storage testConfig, address auditor, address recipient) private view returns (bool) {
        if (testConfig.priority == Priority.CRITICAL || testConfig.priority == Priority.STANDARD) return true;

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
        uint8 access = auditRegistry.auditorAccess(auditor);
        return access == 2 || access == 3;
    }

    function _validateTest(uint8 testType, uint8 scope, Priority priority, uint16 monitoringFrequency) private pure {
        if (!_isValidTestType(testType)) revert InvalidTestType();
        if (uint8(priority) > uint8(Priority.CRITICAL)) revert InvalidPriority();
        if (priority == Priority.MONITORING && monitoringFrequency == 0) revert InvalidFrequency();
        if (priority != Priority.MONITORING && monitoringFrequency != 0) revert InvalidFrequency();

        if (testType == uint8(TestType.PURPOSE_EXPOSURE) && scope > 11) revert InvalidScope();
        if (testType == uint8(TestType.COUNTERPARTY_PATTERN) && scope > 4) revert InvalidScope();
        if (
            testType != uint8(TestType.PURPOSE_EXPOSURE) &&
            testType != uint8(TestType.COUNTERPARTY_PATTERN) &&
            scope != 0
        ) revert InvalidScope();
    }

    function _isValidTestType(uint8 testType) private pure returns (bool) {
        return testType <= uint8(TestType.COUNTERPARTY_PATTERN);
    }
}
