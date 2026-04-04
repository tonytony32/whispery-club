# Deployed Contracts — Sepolia Testnet

Network: Ethereum Sepolia (chain ID 11155111)
Deployed: 2026-04-03

---

## WhisperyNFT — Membership Token

ERC-721 upgradeable membership token. One token per wallet. Transferable.
Admin: Alice (`DEPLOYER_ADDRESS`)

| Role | Address |
|---|---|
| **Proxy** (use this) | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` |
| Implementation | `0xBa8e267C1E21DC25bB0B5623Bc8B0eFb3209EFaa` |

- Proxy on Etherscan: https://sepolia.etherscan.io/address/0x51a5a1c73280b7a15dfbd3b173cd178c8a824c16
- Implementation on Etherscan: https://sepolia.etherscan.io/address/0xba8e267c1e21dc25bb0b5623bc8b0efb3209efaa

### Founding members

| Member | Address | tokenId |
|---|---|---|
| Alice | `0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c` | 1 |
| Betty | `0xBF0c2136430053e6839113Abac2E55DBeB0E80a7` | 2 |
| Caroline | `0x055476B69029367CF0E26eC784FB456Ed8ebcA00` | 3 |

---

## WhisperyBackpack — Off-chain Pointer Store

Maps `channelId → eeePointer + swarmOverlay + epoch`. Write access gated by WhisperyNFT membership.

| Role | Address |
|---|---|
| **Contract** | `0x532434E21Cd2cE47e6e54bFd02070984d84f05d1` |
| NFT reference | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` (proxy above) |

- Contract on Etherscan: https://sepolia.etherscan.io/address/0x532434e21cd2ce47e6e54bfd02070984d84f05d1

---

## Why two contracts (plus the proxy)

The UUPS proxy pattern splits the NFT into two deployments:

```
User → ERC1967Proxy  (fixed address, holds all state)
              │
              └── delegatecall → WhisperyNFT impl  (pure code, no state)
```

The proxy address never changes. If the implementation needs to be upgraded,
the owner calls `upgradeToAndCall(newImpl, "")` on the proxy — state is preserved,
address stays the same. The implementation address is an internal detail.

**Always use the proxy address** for any interaction with WhisperyNFT.

---

## .env reference

```
NFT_PROXY=0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16
BACKPACK=0x532434E21Cd2cE47e6e54bFd02070984d84f05d1
```
