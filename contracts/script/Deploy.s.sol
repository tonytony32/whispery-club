// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";

/// @notice Deploys WhisperyNFT behind a UUPS (ERC-1967) proxy and mints
///         one membership token to each of Alice, Bob, and Charlie.
///
/// Usage (Sepolia):
///   forge script script/Deploy.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
contract DeployScript is Script {
    // Override these via environment variables or edit directly for local testing.
    address constant ALICE   = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Anvil #0
    address constant BOB     = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Anvil #1
    address constant CHARLIE = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Anvil #2

    function run() external {
        address deployer = vm.envOr("DEPLOYER_ADDRESS", ALICE);

        vm.startBroadcast();

        // 1. Deploy implementation
        WhisperyNFT impl = new WhisperyNFT();

        // 2. Encode initializer call
        bytes memory initData = abi.encodeCall(
            WhisperyNFT.initialize,
            ("Whispery Group Alpha", "WGALPHA", deployer)
        );

        // 3. Deploy UUPS proxy pointing at the implementation
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        WhisperyNFT nft = WhisperyNFT(address(proxy));

        console.log("Implementation:", address(impl));
        console.log("Proxy (use this address):", address(proxy));

        // 4. Mint one token per founding member
        uint256 idAlice   = nft.mint(ALICE);
        uint256 idBob     = nft.mint(BOB);
        uint256 idCharlie = nft.mint(CHARLIE);

        console.log("Alice   tokenId:", idAlice);
        console.log("Bob     tokenId:", idBob);
        console.log("Charlie tokenId:", idCharlie);

        vm.stopBroadcast();
    }
}
