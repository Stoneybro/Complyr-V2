// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";
import {ExternalAuditFields, CallbackAuditFields} from "./IComplyrTypes.sol";

interface IConfidentialTransferReceiver {
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool);
}

contract ConfidentialUSDC is ZamaEthereumConfig {
    string public constant name = "Confidential USDC";
    string public constant symbol = "cUSDC";
    uint8 public constant decimals = 6;

    address public owner;
    mapping(address account => euint64 balance) private _balances;

    // ExternalAuditFields and CallbackAuditFields are imported from IComplyrTypes.sol
    // to avoid struct duplication between ConfidentialUSDC and AuditRegistry.

    event ConfidentialTransfer(address indexed from, address indexed to, euint64 amount);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error InvalidAddress();
    error UnauthorizedHandle();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }



    /// @notice Public mint for hackathon testing
    function mint(address to, uint64 amount) external returns (euint64) {
        if (to == address(0)) revert InvalidAddress();
        euint64 encryptedAmount = FHE.asEuint64(amount);
        euint64 newBalance = FHE.add(_balances[to], encryptedAmount);
        _balances[to] = newBalance;

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, to);
        FHE.allow(encryptedAmount, to);
        FHE.allowThis(encryptedAmount);

        emit ConfidentialTransfer(address(0), to, encryptedAmount);
        return encryptedAmount;
    }

    function confidentialTransfer(
        address to,
        externalEuint64 amount,
        bytes calldata inputProof
    ) external returns (euint64) {
        euint64 encryptedAmount = FHE.fromExternal(amount, inputProof);
        return _transfer(msg.sender, to, encryptedAmount);
    }

    function confidentialTransfer(address to, euint64 amount) external returns (euint64) {
        if (!FHE.isAllowed(amount, msg.sender)) revert UnauthorizedHandle();
        return _transfer(msg.sender, to, amount);
    }

    function confidentialTransferAndCall(
        address to,
        externalEuint64 amount,
        bytes calldata inputProof,
        bytes calldata data
    ) external returns (euint64) {
        euint64 encryptedAmount = FHE.fromExternal(amount, inputProof);
        return _transferAndCall(msg.sender, to, encryptedAmount, data);
    }

    /// @notice Primary audit entry point. Transfers tokens and records payment metadata
    ///         in AuditRegistry atomically. The amount handle is pulled from the actual
    ///         token transfer — NOT self-reported. Only category is encrypted at submission.
    function confidentialTransferAndCallWithAudit(
        address to,
        externalEuint64 amount,
        bytes calldata amountProof,
        ExternalAuditFields calldata fields
    ) external returns (euint64) {
        euint64 encryptedAmount = FHE.fromExternal(amount, amountProof);
        euint8  category        = FHE.fromExternal(fields.category, fields.inputProof);

        // Grant `to` (AuditRegistry) transient read access to category for the callback
        FHE.allowThis(category);
        FHE.allow(category, to);
        FHE.allowTransient(category, to);

        bytes memory data = abi.encode(CallbackAuditFields({
            category:    category,
            recipient:   fields.recipient,
            invoiceHash: fields.invoiceHash,
            poHash:      fields.poHash
        }));

        return _transferAndCall(msg.sender, to, encryptedAmount, data);
    }

    function confidentialTransferAndCall(address to, euint64 amount, bytes calldata data) external returns (euint64) {
        if (!FHE.isAllowed(amount, msg.sender)) revert UnauthorizedHandle();
        return _transferAndCall(msg.sender, to, amount, data);
    }

    function _transfer(address from, address to, euint64 amount) private returns (euint64) {
        if (to == address(0)) revert InvalidAddress();

        _balances[from] = FHE.sub(_balances[from], amount);
        _balances[to] = FHE.add(_balances[to], amount);

        FHE.allowThis(_balances[from]);
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[from], from);
        FHE.allow(_balances[to], to);
        FHE.allow(amount, from);
        FHE.allow(amount, to);
        FHE.allowThis(amount);
        FHE.allowTransient(amount, to);

        emit ConfidentialTransfer(from, to, amount);
        return amount;
    }

    function _transferAndCall(address from, address to, euint64 amount, bytes memory data) private returns (euint64) {
        euint64 transferred = _transfer(from, to, amount);
        ebool success = IConfidentialTransferReceiver(to).onConfidentialTransferReceived(
            msg.sender,
            from,
            transferred,
            data
        );
        // FHE.allowThis(success);
        return transferred;
    }
}
