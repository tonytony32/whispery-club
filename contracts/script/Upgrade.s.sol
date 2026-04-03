// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";

/// @notice Upgrades the WhisperyNFT proxy to a new implementation,
///         then sets the IPFS tokenURI for each founding member.
///
/// Usage (Sepolia):
///   forge script script/Upgrade.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
///
/// Requires in contracts/.env:
///   NFT_PROXY, TOKEN_URI_1, TOKEN_URI_2, TOKEN_URI_3
contract Upgrade is Script {
    function run() external {
        address proxy = vm.envAddress("NFT_PROXY");
        string memory u1 = string.concat("ipfs://", vm.envString("TOKEN_URI_1"));
        string memory u2 = string.concat("ipfs://", vm.envString("TOKEN_URI_2"));
        string memory u3 = string.concat("ipfs://", vm.envString("TOKEN_URI_3"));

        vm.startBroadcast();

        // 1. Deploy new implementation
        WhisperyNFT newImpl = new WhisperyNFT();
        console.log("New impl:", address(newImpl));

        // 2. Upgrade proxy to new implementation (UUPS — no data needed)
        WhisperyNFT nft = WhisperyNFT(proxy);
        nft.upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded:", proxy);

        // 3. Set tokenURIs
        nft.setTokenURI(1, u1);
        nft.setTokenURI(2, u2);
        nft.setTokenURI(3, u3);

        vm.stopBroadcast();

        console.log("tokenURI(1):", nft.tokenURI(1));
        console.log("tokenURI(2):", nft.tokenURI(2));
        console.log("tokenURI(3):", nft.tokenURI(3));
    }
}
