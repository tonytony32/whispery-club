# Deployed Contracts — Sepolia Testnet

Network: Ethereum Sepolia (chain ID 11155111)
Deployed: 2026-04-03

---

## WhisperyNFT — Membership Token

ERC-721 upgradeable membership token. One token per wallet. Transferable.
Admin: Alice (`DEPLOYER_ADDRESS`)

| Role | Address |
|---|---|
| **Proxy** (use this) | `0x59804B5A7b61E469F148Dbd86eE95EEC3F6dc06a` |
| Implementation | `0x36d9CEf1cCde5A7A1BE4D0973B1fBd60420a1665` |

- Proxy on Etherscan: https://sepolia.etherscan.io/address/0x59804b5a7b61e469f148dbd86ee95eec3f6dc06a
- Implementation on Etherscan: https://sepolia.etherscan.io/address/0x36d9cef1ccde5a7a1be4d0973b1fbd60420a1665

### Founding members

| Member | Address | tokenId |
|---|---|---|
| Alice | `0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c` | 1 |
| Bob | `0xBF0c2136430053e6839113Abac2E55DBeB0E80a7` | 2 |
| Charlie | `0x055476B69029367CF0E26eC784FB456Ed8ebcA00` | 3 |

---

## WhisperyBackpack — Off-chain Pointer Store

Maps `channelId → eeePointer + swarmOverlay + epoch`. Write access gated by WhisperyNFT membership.

| Role | Address |
|---|---|
| **Contract** | `0x227A6991c3702C227A1ea4beB867DF522183f5CC` |
| NFT reference | `0x59804B5A7b61E469F148Dbd86eE95EEC3F6dc06a` (proxy above) |

- Contract on Etherscan: https://sepolia.etherscan.io/address/0x227a6991c3702c227a1ea4beb867df522183f5cc

---

## Why three contracts

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
NFT_PROXY=0x59804B5A7b61E469F148Dbd86eE95EEC3F6dc06a
BACKPACK=0x227A6991c3702C227A1ea4beB867DF522183f5CC
```
