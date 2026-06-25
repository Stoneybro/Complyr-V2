// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint8} from "@fhevm/solidity/lib/FHE.sol";
import {externalEuint8} from "@fhevm/solidity/lib/FHE.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types used by both ConfidentialUSDC and AuditRegistry.
// Import this file in both contracts to avoid struct duplication.
// ─────────────────────────────────────────────────────────────────────────────

/// @notice Fields submitted by the caller via confidentialTransferAndCallWithAudit.
///         The token decrypts the encrypted fields and passes CallbackAuditFields to
///         AuditRegistry.onConfidentialTransferReceived via the data parameter.
struct ExternalAuditFields {
    externalEuint8 category;   // GL category (Category enum in AuditRegistry)
    bytes          inputProof; // Proof for the category ciphertext
    address        recipient;  // Who receives the payment
    bytes32        invoiceHash; // keccak256 of supporting invoice document
    bytes32        poHash;      // keccak256 of purchase order
    // NOTE: approved and approver are NOT here. Only approvePayment() can set them.
}

/// @notice Decoded version passed from ConfidentialUSDC to AuditRegistry callback.
///         All previously-external FHE fields are now internal handles.
struct CallbackAuditFields {
    euint8  category;
    address recipient;
    bytes32 invoiceHash;
    bytes32 poHash;
    // approved and approver are always false/address(0) at creation.
    // Use AuditRegistry.approvePayment() to set them post-creation.
}
