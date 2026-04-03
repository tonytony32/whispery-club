// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WhisperyNFT} from "../src/WhisperyNFT.sol";
import {WhisperyBackpack} from "../src/WhisperyBackpack.sol";

contract WhisperyBackpackTest is Test {
    WhisperyNFT     nft;
    WhisperyBackpack backpack;

    address admin   = address(0xA11CE);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address charlie = address(0xCCCC);
    address dave    = address(0xDAEF); // not a member

    bytes32 constant CHANNEL_ID    = keccak256("whispery/nft/1");
    string  constant EEE_POINTER   = "bzz://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    bytes32 constant SWARM_OVERLAY = bytes32(uint256(0xBEEF));

    function setUp() public {
        // Deploy WhisperyNFT behind proxy
        WhisperyNFT impl = new WhisperyNFT();
        bytes memory initData = abi.encodeCall(
            WhisperyNFT.initialize,
            ("Whispery Group Alpha", "WGALPHA", admin)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        nft = WhisperyNFT(address(proxy));

        // Mint membership tokens
        vm.startPrank(admin);
        nft.mint(alice);
        nft.mint(bob);
        nft.mint(charlie);
        vm.stopPrank();

        // Deploy WhisperyBackpack (registry)
        backpack = new WhisperyBackpack(address(nft));
    }

    // ─── setChannel ───────────────────────────────────────────────────────────

    function test_setChannel_memberCanPublish() public {
        vm.prank(alice);
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 0);

        (string memory ptr, uint256 epoch) = backpack.getEEE(CHANNEL_ID);
        assertEq(ptr, EEE_POINTER);
        assertEq(epoch, 0);
    }

    function test_setChannel_nonMemberReverts() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(WhisperyBackpack.NotAMember.selector, dave));
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 0);
    }

    function test_setChannel_emptyPointerReverts() public {
        vm.prank(alice);
        vm.expectRevert(WhisperyBackpack.EmptyPointer.selector);
        backpack.setChannel(CHANNEL_ID, "", SWARM_OVERLAY, 0);
    }

    function test_setChannel_epochCanAdvance() public {
        vm.startPrank(alice);
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 0);
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 1); // rotation
        vm.stopPrank();

        (, uint256 epoch) = backpack.getEEE(CHANNEL_ID);
        assertEq(epoch, 1);
    }

    function test_setChannel_epochCannotGoBack() public {
        vm.startPrank(alice);
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 2);
        vm.expectRevert(
            abi.encodeWithSelector(WhisperyBackpack.EpochMustAdvance.selector, 2, 1)
        );
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 1);
        vm.stopPrank();
    }

    function test_setChannel_recordsMetadata() public {
        vm.prank(bob);
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 0);

        WhisperyBackpack.ChannelState memory s = backpack.getChannel(CHANNEL_ID);
        assertEq(s.updatedBy, bob);
        assertEq(s.swarmOverlay, SWARM_OVERLAY);
        assertTrue(s.updatedAt > 0);
    }

    // ─── getChannel on unknown channelId ─────────────────────────────────────

    function test_getChannel_unknownReturnsZero() public view {
        WhisperyBackpack.ChannelState memory s = backpack.getChannel(bytes32(0));
        assertEq(bytes(s.eeePointer).length, 0);
        assertEq(s.epoch, 0);
    }

    // ─── access revoked after burn ────────────────────────────────────────────

    function test_setChannel_revokedAfterBurn() public {
        vm.prank(admin);
        nft.burn(bob);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(WhisperyBackpack.NotAMember.selector, bob));
        backpack.setChannel(CHANNEL_ID, EEE_POINTER, SWARM_OVERLAY, 0);
    }
}
