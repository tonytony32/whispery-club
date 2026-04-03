// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WhisperyNFT} from "./WhisperyNFT.sol";

/// @title WhisperyBackpack
/// @notice Stores off-chain pointers for a Whispery group channel:
///         - eeePointer : Swarm hash (or IPFS CID) of the current EEE file
///         - swarmOverlay: hex-encoded Swarm overlay address of the node
///                         that is hosting the EEE and envelopes
///         - epoch       : must match the epoch inside the EEE; used by
///                         clients to detect stale reads
///
///         Write access is gated by membership: only addresses that currently
///         hold a WhisperyBackpack token can update the pointers.
///         The contract is intentionally not upgradeable — it is a simple
///         key/value store. Deploy a new one if the schema changes.
contract WhisperyBackpack {
    // ─── State ────────────────────────────────────────────────────────────────

    WhisperyNFT public immutable backpack;

    struct ChannelState {
        string  eeePointer;    // e.g. "bzz://a1b2c3…" or "ipfs://Qm…"
        bytes32 swarmOverlay;  // 32-byte Swarm overlay address of the hosting node
        uint256 epoch;         // mirrors EEE.epoch — increments on key rotation
        uint256 updatedAt;     // block.timestamp of last update
        address updatedBy;     // member who pushed this update
    }

    /// @dev channelId → current channel state.
    ///      channelId = sha256("whispery/nft/" + tokenId), computed off-chain.
    mapping(bytes32 => ChannelState) private _channels;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ChannelUpdated(
        bytes32 indexed channelId,
        uint256 indexed epoch,
        string  eeePointer,
        bytes32 swarmOverlay,
        address updatedBy
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAMember(address caller);
    error EpochMustAdvance(uint256 current, uint256 provided);
    error EmptyPointer();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address backpack_) {
        backpack = WhisperyNFT(backpack_);
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Publish a new EEE pointer for `channelId`.
    ///
    /// @param channelId    sha256("whispery/nft/" + tokenId) — computed off-chain
    /// @param eeePointer   Swarm or IPFS URI pointing to the EEE JSON for this epoch
    /// @param swarmOverlay Swarm overlay address of the node hosting the data
    /// @param epoch        Epoch number inside the EEE (must be >= current epoch)
    function setChannel(
        bytes32 channelId,
        string  calldata eeePointer,
        bytes32 swarmOverlay,
        uint256 epoch
    ) external {
        if (!backpack.isMember(msg.sender)) revert NotAMember(msg.sender);
        if (bytes(eeePointer).length == 0)  revert EmptyPointer();

        ChannelState storage s = _channels[channelId];
        if (epoch < s.epoch) revert EpochMustAdvance(s.epoch, epoch);

        s.eeePointer   = eeePointer;
        s.swarmOverlay = swarmOverlay;
        s.epoch        = epoch;
        s.updatedAt    = block.timestamp;
        s.updatedBy    = msg.sender;

        emit ChannelUpdated(channelId, epoch, eeePointer, swarmOverlay, msg.sender);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Returns the current channel state for `channelId`.
    ///         Returns zero-values if the channel has never been registered.
    function getChannel(bytes32 channelId)
        external
        view
        returns (ChannelState memory)
    {
        return _channels[channelId];
    }

    /// @notice Convenience getter — returns only the EEE pointer and epoch.
    function getEEE(bytes32 channelId)
        external
        view
        returns (string memory eeePointer, uint256 epoch)
    {
        ChannelState storage s = _channels[channelId];
        return (s.eeePointer, s.epoch);
    }
}
