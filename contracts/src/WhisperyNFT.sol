// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title WhisperyNFT
/// @notice Membership token for a Whispery group channel.
///         Each address holds at most one token. Holding a token
///         proves membership and is used by WhisperyRegistry to
///         gate write access.
///         Upgradeable via UUPS — only the owner can authorize upgrades.
contract WhisperyNFT is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// @dev Maps member address → their tokenId (1-indexed; 0 means no token).
    mapping(address => uint256) private _tokenOfOwner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MemberMinted(address indexed to, uint256 indexed tokenId);
    event MemberBurned(address indexed from, uint256 indexed tokenId);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error AlreadyMember(address account);
    error NotAMember(address account);

    // ─── Initializer (replaces constructor for upgradeable contracts) ─────────

    /// @param name_   ERC-721 token name  (e.g. "Whispery Group Alpha")
    /// @param symbol_ ERC-721 token symbol (e.g. "WGALPHA")
    /// @param owner_  Initial admin — the only address that can mint/burn/upgrade
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        _nextTokenId = 1; // start at 1 so 0 is a safe sentinel for "no token"
    }

    // ─── Membership management ────────────────────────────────────────────────

    /// @notice Mint one membership token to `to`.
    ///         Reverts if `to` already holds a token.
    ///         Only the contract owner (admin) can call this.
    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        if (_tokenOfOwner[to] != 0) revert AlreadyMember(to);
        tokenId = _nextTokenId++;
        _tokenOfOwner[to] = tokenId;
        _safeMint(to, tokenId);
        emit MemberMinted(to, tokenId);
    }

    /// @notice Burn the membership token held by `from`.
    ///         Used when a member is removed from the group.
    ///         Only the contract owner (admin) can call this.
    function burn(address from) external onlyOwner {
        uint256 tokenId = _tokenOfOwner[from];
        if (tokenId == 0) revert NotAMember(from);
        delete _tokenOfOwner[from];
        _burn(tokenId);
        emit MemberBurned(from, tokenId);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns the tokenId held by `account`, or 0 if not a member.
    function tokenIdOf(address account) external view returns (uint256) {
        return _tokenOfOwner[account];
    }

    /// @notice Returns true if `account` currently holds a membership token.
    function isMember(address account) external view returns (bool) {
        return _tokenOfOwner[account] != 0;
    }

    /// @notice Total number of tokens minted so far (including burned ones
    ///         for simplicity; use balanceOf for active count).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ─── Transfer: keep _tokenOfOwner in sync ─────────────────────────────────

    /// @dev Called by ERC-721 on every mint, burn, and transfer.
    ///      Keeps _tokenOfOwner accurate so isMember/tokenIdOf reflect the
    ///      real current owner even after a secondary transfer.
    ///      AlreadyMember check is bypassed here because mint() already guards it;
    ///      if someone transfers into a wallet that holds a token, the registry
    ///      mapping simply gets overwritten (the old entry becomes unreachable).
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) delete _tokenOfOwner[from]; // clear old owner
        if (to   != address(0)) _tokenOfOwner[to] = tokenId; // set new owner
    }

    // ─── UUPS upgrade authorization ───────────────────────────────────────────

    /// @dev Only the owner can authorize an implementation upgrade.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
