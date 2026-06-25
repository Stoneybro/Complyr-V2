// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// ─────────────────────────────────────────────────────────────────────────────
// ComplyrFactory — deploys per-business (AuditRegistry + ReviewTestRegistry)
// clone pairs using the EIP-1167 minimal proxy pattern.
//
// Deployment sequence for each business:
//   1. Clone AuditRegistry implementation
//   2. Clone ReviewTestRegistry implementation
//   3. Initialize both with the factory as temporary owner
//   4. Wire them together (setReviewTestRegistry)
//   5. Grant ReviewTestRegistry FULL access in AuditRegistry (for getPaymentHandles)
//   6. Transfer ownership of both to the business
//   7. Record the deployment in registries mapping
//
// After step 6, the factory has ZERO privileged access to business data.
// The business owner controls their own registry from that point.
// ─────────────────────────────────────────────────────────────────────────────

interface IAuditRegistryInit {
    function initialize(address confidentialToken, address initialOwner) external;
    function setReviewTestRegistry(address registry) external;
    function setAuditorAccess(address auditor, uint8 access) external;
    function transferOwnership(address newOwner) external;
}

interface IReviewTestRegistryInit {
    function initialize(address auditRegistry, address initialOwner) external;
    function transferOwnership(address newOwner) external;
}

contract ComplyrFactory {

    // ─── State Variables ─────────────────────────────────────────────────────

    address public immutable confidentialToken;
    address public immutable auditRegistryImpl;
    address public immutable reviewTestImpl;
    address public owner;

    struct BusinessRegistry {
        address auditRegistry;
        address reviewTestRegistry;
        bool    active;
        uint256 deployedAtBlock;
    }

    mapping(address business => BusinessRegistry) public registries;
    address[] public businesses;

    // ─── Events ──────────────────────────────────────────────────────────────

    event BusinessRegistered(
        address indexed business,
        address indexed auditRegistry,
        address indexed reviewTestRegistry
    );
    event BusinessDeactivated(address indexed business);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotOwner();
    error InvalidAddress();
    error AlreadyRegistered();
    error CloneFailed();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address confidentialToken_,
        address auditRegistryImpl_,
        address reviewTestImpl_
    ) {
        if (confidentialToken_  == address(0)) revert InvalidAddress();
        if (auditRegistryImpl_  == address(0)) revert InvalidAddress();
        if (reviewTestImpl_     == address(0)) revert InvalidAddress();

        confidentialToken  = confidentialToken_;
        auditRegistryImpl  = auditRegistryImpl_;
        reviewTestImpl     = reviewTestImpl_;
        owner              = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Core: Deploy a Business Registry Pair ───────────────────────────────

    /// @notice Deploys an isolated (AuditRegistry, ReviewTestRegistry) clone pair
    ///         for a business. Wires them together. Transfers ownership to the business.
    ///         After this call, the factory has no privileged access to the deployed contracts.
    function deployRegistry(address business) external onlyOwner returns (address auditProxy, address reviewProxy) {
        if (business == address(0)) revert InvalidAddress();
        if (registries[business].deployedAtBlock != 0) revert AlreadyRegistered();

        // 1. Clone both implementations
        auditProxy  = _clone(auditRegistryImpl);
        reviewProxy = _clone(reviewTestImpl);

        // 2. Initialize with factory as temporary owner
        IAuditRegistryInit(auditProxy).initialize(confidentialToken, address(this));
        IReviewTestRegistryInit(reviewProxy).initialize(auditProxy, address(this));

        // 3. Wire: tell AuditRegistry which ReviewTestRegistry it works with
        IAuditRegistryInit(auditProxy).setReviewTestRegistry(reviewProxy);

        // 4. Grant ReviewTestRegistry FULL access in AuditRegistry.
        //    This allows ReviewTestRegistry to call getPaymentHandles/getPaymentMeta.
        //    ReviewTestRegistry is NOT added to the _auditors array (it gets direct read
        //    access via the reviewTestRegistry address check in _canReadPayment).
        //    We use setAuditorAccess(reviewProxy, 3) here only to satisfy the auditorAccess
        //    mapping that _isApprovedAuditor reads inside ReviewTestRegistry.
        //    AuditRegistry.setAuditorAccess caps at MAX_AUDITORS — reviewProxy is the first
        //    and only "system" entry; real auditors fill the remaining 4 slots (plus 1 more
        //    since factory adds reviewProxy as auditor, effectively reserving 1 slot).
        //
        // NOTE: An alternative is to check msg.sender == reviewTestRegistry in
        //       _isApprovedAuditor. That would avoid consuming an auditor slot entirely.
        //       For V1 simplicity, we use the access mapping approach.
        IAuditRegistryInit(auditProxy).setAuditorAccess(reviewProxy, 3); // 3 = FULL

        // 5. Transfer ownership to the business — factory loses all admin rights
        IAuditRegistryInit(auditProxy).transferOwnership(business);
        IReviewTestRegistryInit(reviewProxy).transferOwnership(business);

        // 6. Record deployment
        registries[business] = BusinessRegistry({
            auditRegistry:      auditProxy,
            reviewTestRegistry: reviewProxy,
            active:             true,
            deployedAtBlock:    block.number
        });
        businesses.push(business);

        emit BusinessRegistered(business, auditProxy, reviewProxy);
    }

    /// @notice Marks a business as inactive. Does NOT touch their deployed contracts.
    ///         Data and ownership remain with the business.
    function deactivateBusiness(address business) external onlyOwner {
        registries[business].active = false;
        emit BusinessDeactivated(business);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    function businessCount() external view returns (uint256) {
        return businesses.length;
    }

    function getRegistry(address business) external view returns (BusinessRegistry memory) {
        return registries[business];
    }

    // ─── Internal: EIP-1167 Minimal Proxy Clone ───────────────────────────────

    /// @notice Deploys an EIP-1167 minimal proxy clone of the given implementation.
    ///         Uses inline assembly to avoid requiring openzeppelin/contracts as a dependency.
    function _clone(address implementation) internal returns (address instance) {
        // EIP-1167 bytecode: delegates all calls to `implementation`
        assembly {
            let ptr := mload(0x40)
            // Store the first part of the proxy bytecode
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            // Store the implementation address (20 bytes, right-aligned in 32-byte word)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            // Store the second part of the proxy bytecode
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            // Deploy: 0x37 = 55 bytes total
            instance := create(0, ptr, 0x37)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
