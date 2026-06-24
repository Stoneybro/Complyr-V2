// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "../fhevmTemp/@fhevm/solidity/config/ZamaConfig.sol";

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

    function mint(address to, externalEuint64 amount, bytes calldata inputProof) external onlyOwner returns (euint64) {
        if (to == address(0)) revert InvalidAddress();
        euint64 encryptedAmount = FHE.fromExternal(amount, inputProof);
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

    function confidentialTransferAndCallWithAudit(
        address to,
        externalEuint64 amount,
        bytes calldata amountProof,
        ExternalAuditFields calldata fields
    ) external returns (euint64) {
        euint64 encryptedAmount = FHE.fromExternal(amount, amountProof);
        euint8 purposeCode = FHE.fromExternal(fields.purposeCode, fields.inputProof);
        euint8 riskTier = FHE.fromExternal(fields.riskTier, fields.inputProof);
        euint8 counterpartyType = FHE.fromExternal(fields.counterpartyType, fields.inputProof);

        FHE.allowThis(purposeCode);
        FHE.allowThis(riskTier);
        FHE.allowThis(counterpartyType);
        FHE.allow(purposeCode, to);
        FHE.allow(riskTier, to);
        FHE.allow(counterpartyType, to);
        FHE.allowTransient(purposeCode, to);
        FHE.allowTransient(riskTier, to);
        FHE.allowTransient(counterpartyType, to);

        bytes memory data = abi.encode(
            CallbackAuditFields({
                purposeCode: purposeCode,
                riskTier: riskTier,
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
        FHE.allowThis(success);
        return transferred;
    }
}
