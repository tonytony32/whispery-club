// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";
import {WhisperyBackpack} from "../src/WhisperyBackpack.sol";

/// @notice Deploys WhisperyNFT (proxy) + WhisperyBackpack, mints one
///         membership token to Alice, Bob, and Charlie.
///
/// Usage (Sepolia):
///   forge script script/Deploy.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
contract DeployScript is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address ALICE    = vm.envOr("ALICE",   deployer);
        address BOB      = vm.envAddress("BOB");
        address CHARLIE  = vm.envAddress("CHARLIE");

        vm.startBroadcast();

        // ── 1. WhisperyNFT ────────────────────────────────────────────────────

        WhisperyNFT impl = new WhisperyNFT();

        bytes memory initData = abi.encodeCall(
            WhisperyNFT.initialize,
            ("Whispery Group Alpha", "WGALPHA", deployer)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        WhisperyNFT nft = WhisperyNFT(address(proxy));

        console.log("WhisperyNFT impl  :", address(impl));
        console.log("WhisperyNFT proxy :", address(proxy));

        // ── 2. Mint founding members ──────────────────────────────────────────

        uint256 idAlice   = nft.mint(ALICE);
        uint256 idBob     = nft.mint(BOB);
        uint256 idCharlie = nft.mint(CHARLIE);

        console.log("Alice   tokenId:", idAlice);
        console.log("Bob     tokenId:", idBob);
        console.log("Charlie tokenId:", idCharlie);

        // ── 3. WhisperyBackpack ───────────────────────────────────────────────

        WhisperyBackpack backpack = new WhisperyBackpack(address(proxy));

        console.log("WhisperyBackpack  :", address(backpack));

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("---");
        console.log("Save these addresses in your .env:");
        console.log("  NFT_PROXY=", address(proxy));
        console.log("  BACKPACK=", address(backpack));
    }
}
