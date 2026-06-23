// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ConfidentialFungibleToken} from "@openzeppelin/confidential-contracts/token/ConfidentialFungibleToken.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialUSDC is ConfidentialFungibleToken {
    constructor() ConfidentialFungibleToken("Confidential USDC", "cUSDC", "") {}

    /**
     * @dev Simple mint function for the demo environment. 
     * In a real system, this would be an admin function, or wrapped around real USDC.
     */
    function mint(address to, euint64 amount) public {
        _mint(to, amount);
    }
}
