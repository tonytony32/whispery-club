// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";

contract WhisperyNFTTest is Test {
    WhisperyNFT nft;

    address admin   = address(0xA11CE);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address charlie = address(0xCCCC);
    address dave    = address(0xDAEF);

    function setUp() public {
        WhisperyNFT impl = new WhisperyNFT();
        bytes memory initData = abi.encodeCall(
            WhisperyNFT.initialize,
            ("Whispery Group Alpha", "WGALPHA", admin)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        nft = WhisperyNFT(address(proxy));
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────

    function test_mint_assignsTokenId() public {
        vm.prank(admin);
        uint256 id = nft.mint(alice);
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.tokenIdOf(alice), 1);
        assertTrue(nft.isMember(alice));
    }

    function test_mint_incrementsTokenIds() public {
        vm.startPrank(admin);
        uint256 id1 = nft.mint(alice);
        uint256 id2 = nft.mint(bob);
        uint256 id3 = nft.mint(charlie);
        vm.stopPrank();
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(nft.totalMinted(), 3);
    }

    function test_mint_revertsIfAlreadyMember() public {
        vm.startPrank(admin);
        nft.mint(alice);
        vm.expectRevert(abi.encodeWithSelector(WhisperyNFT.AlreadyMember.selector, alice));
        nft.mint(alice);
        vm.stopPrank();
    }

    function test_mint_revertsIfNotOwner() public {
        vm.prank(bob);
        vm.expectRevert();
        nft.mint(charlie);
    }

    // ─── Burn ─────────────────────────────────────────────────────────────────

    function test_burn_removesMembership() public {
        vm.startPrank(admin);
        nft.mint(alice);
        nft.burn(alice);
        vm.stopPrank();
        assertFalse(nft.isMember(alice));
        assertEq(nft.tokenIdOf(alice), 0);
        assertEq(nft.balanceOf(alice), 0);
    }

    function test_burn_revertsIfNotMember() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WhisperyNFT.NotAMember.selector, dave));
        nft.burn(dave);
    }

    function test_burn_revertsIfNotOwner() public {
        vm.prank(admin);
        nft.mint(alice);
        vm.prank(bob);
        vm.expectRevert();
        nft.burn(alice);
    }

    // ─── Transfer ─────────────────────────────────────────────────────────────

    function test_transfer_works() public {
        vm.prank(admin);
        nft.mint(alice);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
        // _tokenOfOwner mapping must follow the transfer
        assertEq(nft.tokenIdOf(alice), 0);
        assertEq(nft.tokenIdOf(bob), 1);
        assertFalse(nft.isMember(alice));
        assertTrue(nft.isMember(bob));
    }

    // ─── Non-member ───────────────────────────────────────────────────────────

    function test_nonMember_returnsZero() public view {
        assertEq(nft.tokenIdOf(dave), 0);
        assertFalse(nft.isMember(dave));
    }

    // ─── Upgrade (UUPS) ───────────────────────────────────────────────────────

    function test_upgrade_onlyOwner() public {
        WhisperyNFT newImpl = new WhisperyNFT();
        // Non-owner cannot upgrade
        vm.prank(bob);
        vm.expectRevert();
        nft.upgradeToAndCall(address(newImpl), "");
        // Owner can upgrade
        vm.prank(admin);
        nft.upgradeToAndCall(address(newImpl), "");
    }
}
