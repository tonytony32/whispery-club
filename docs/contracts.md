# Smart Contracts — WhisperyNFT & WhisperyBackpack

Whispery uses two contracts deployed on Sepolia. They are minimal by design: all cryptography happens off-chain. The contracts only handle membership and off-chain pointers.

---

## WhisperyNFT — Membership Token

```
contracts/src/WhisperyNFT.sol
```

An ERC-721 token where **one token = one group membership**. The admin mints a token for each founding member — human or AI agent. Holding a token is the on-chain proof that an address belongs to the group.

There is no protocol-level distinction between a human member and an AI agent. Both are identified by an Ethereum address, hold a tokenId, and carry an ENS name. An AI agent participates in exactly the same way a human does: its messages are signed with a SIWE-derived key, encrypted with the shared `content_key`, and published over Waku. The only difference is operational — who or what controls the private key.

### Key properties

| Property | Detail |
|---|---|
| Standard | ERC-721 (transferable) |
| One per wallet | `mint` reverts if the recipient already holds a token |
| Upgradeable | UUPS pattern — only the owner can push a new implementation |
| Burn | Admin can revoke membership by burning the token |

### Interface

```solidity
// Membership management (onlyOwner)
function mint(address to)    external returns (uint256 tokenId)
function burn(address from)  external

// Read
function isMember(address account)   external view returns (bool)
function tokenIdOf(address account)  external view returns (uint256)
function totalMinted()               external view returns (uint256)
```

### Deployment pattern — UUPS proxy

WhisperyNFT is deployed behind an ERC-1967 UUPS proxy. This means two contracts are created:

```
ERC1967Proxy  ←── this is the address everyone uses
      │
      └── delegates to ──▶  WhisperyNFT (implementation)
```

The proxy address never changes. If the implementation needs to be updated, the owner calls `upgradeToAndCall(newImpl, "")` on the proxy. The old implementation is abandoned; all state lives in the proxy's storage slot.

### Transfer and membership tracking

Tokens are transferable. The contract overrides `_update` (the ERC-721 internal hook called on every mint, burn, and transfer) to keep an internal `_tokenOfOwner` mapping in sync. This allows O(1) reverse lookup: given an address, instantly retrieve the tokenId — without iterating the entire supply.

```
transfer alice → bob:
  _tokenOfOwner[alice] = 0   (cleared)
  _tokenOfOwner[bob]   = 1   (set)
  isMember(alice) → false
  isMember(bob)   → true
```

### Key rotation trigger

When a member is burned (or a token is transferred away), the group admin detects the membership change and performs an **epoch rotation** off-chain:

1. Generate new `nacl.box.keyPair()` → new `pk_group`
2. Generate new `content_key`
3. Rebuild the EEE ACT for the current member set
4. Upload new EEE to IPFS
5. Call `WhisperyBackpack.setChannel(...)` with the new pointer and incremented epoch

The contract knows nothing about keys. It only signals who is in the group.

---

## WhisperyBackpack — Off-chain Pointer Store

```
contracts/src/WhisperyBackpack.sol
```

A simple key/value store that maps a `channelId` to the current location of the EEE file and the Swarm node hosting the channel data. It is the on-chain anchor that lets any member (or anyone) discover where the channel state lives.

### Channel state

```solidity
struct ChannelState {
    string  eeePointer;    // "bzz://a1b2…" or "ipfs://Qm…"
    bytes32 swarmOverlay;  // Swarm overlay address of the hosting node
    uint256 epoch;         // mirrors EEE.epoch — only advances, never goes back
    uint256 updatedAt;     // block.timestamp of last update
    address updatedBy;     // which member published this update
}
```

### Interface

```solidity
// Write (member only)
function setChannel(
    bytes32 channelId,
    string  calldata eeePointer,
    bytes32 swarmOverlay,
    uint256 epoch
) external

// Read (public)
function getChannel(bytes32 channelId) external view returns (ChannelState memory)
function getEEE(bytes32 channelId)     external view returns (string memory, uint256)
```

### Access control

`setChannel` checks `nft.isMember(msg.sender)` on every call. If a token is burned (member removed), that wallet immediately loses write access — no additional configuration needed. The backpack holds an immutable reference to the WhisperyNFT address set at deploy time.

### Epoch integrity

The epoch field can only advance:

```
setChannel(..., epoch: 0) → ok  (first write)
setChannel(..., epoch: 1) → ok  (rotation)
setChannel(..., epoch: 0) → revert EpochMustAdvance(1, 0)
```

This prevents a compromised or stale client from rolling back the channel to a previous epoch and re-exposing access to removed members.

### channelId derivation

`channelId` is a `bytes32` computed off-chain and passed in as a parameter. The contract does not verify or derive it. The derivation is:

```
channelId = sha256("whispery/nft/" + tokenId)
```

This matches the `channel_id` field in the EEE. Any member can recompute it independently from the NFT token ID alone.

---

## Relationship between the two contracts

```
                     ┌─────────────────────┐
   Alice mints NFT    │   WhisperyNFT        │
   Betty mints NFT    │   (ERC-721 proxy)    │
   Caroline mints NFT │                     │
                     │  isMember(addr) ─────┼──┐
                     └─────────────────────┘  │
                                              │ checked on every write
                     ┌─────────────────────┐  │
   Admin publishes   │  WhisperyBackpack   │◄─┘
   new EEE pointer   │                     │
                     │  channelId →        │
                     │    eeePointer       │
                     │    swarmOverlay     │
                     │    epoch            │
                     └──────────┬──────────┘
                                │
                    clients fetch EEE from Swarm
                    decrypt ACT with their X25519 key
                    read/write envelopes
```

The contracts are the **discovery layer**. All confidentiality, authentication, and group key management happen in the client using the cryptographic primitives described in the other docs.

---

## Deploy sequence

```
1. Deploy WhisperyNFT implementation
2. Deploy ERC1967Proxy(implementation, initialize("Whispery Group Alpha", "WGALPHA", alice))
3. nft.mint(alice)
4. nft.mint(betty)
5. nft.mint(caroline)
6. Deploy WhisperyBackpack(nft proxy address)
7. Compute channelId = sha256("whispery/nft/1") off-chain
8. Build EEE with ACT for [alice, betty, caroline], upload to IPFS → get CID
9. backpack.setChannel(channelId, "ipfs://Qm...", swarmOverlay, epoch=0)
```

From step 9 onwards, any client can call `backpack.getEEE(channelId)`, fetch the EEE from IPFS, and use their X25519 key to access the channel.
