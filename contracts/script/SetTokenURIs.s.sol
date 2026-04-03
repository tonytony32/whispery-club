// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";

/// @notice Sets the IPFS metadata URI for each founding member token.
///
/// Usage (Sepolia):
///   forge script script/SetTokenURIs.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast
///
/// Requires in contracts/.env:
///   NFT_PROXY=0x...
///   TOKEN_URI_1=Qm...   (CID only, without ipfs://)
///   TOKEN_URI_2=Qm...
///   TOKEN_URI_3=Qm...
contract SetTokenURIs is Script {
    function run() external {
        address proxy    = vm.envAddress("NFT_PROXY");
        string memory u1 = string.concat("ipfs://", vm.envString("TOKEN_URI_1"));
        string memory u2 = string.concat("ipfs://", vm.envString("TOKEN_URI_2"));
        string memory u3 = string.concat("ipfs://", vm.envString("TOKEN_URI_3"));

        WhisperyNFT nft = WhisperyNFT(proxy);

        vm.startBroadcast();
        nft.setTokenURI(1, u1);
        nft.setTokenURI(2, u2);
        nft.setTokenURI(3, u3);
        vm.stopBroadcast();

        console.log("tokenURI(1):", nft.tokenURI(1));
        console.log("tokenURI(2):", nft.tokenURI(2));
        console.log("tokenURI(3):", nft.tokenURI(3));
    }
}
