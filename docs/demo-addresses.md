# Whispery — Demo Reference

All addresses, ENS names and event identifiers for the hackathon demo.

---

## Members

| Name     | Wallet address                               | WhisperyNFT tokenId | ENS name                  |
|----------|----------------------------------------------|---------------------|---------------------------|
| Alice    | `0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c` | 1                   | `alice.whispery.eth`      |
| Betty    | `0xBF0c2136430053e6839113Abac2E55DBeB0E80a7` | 2                   | `betty.whispery.eth`      |
| Caroline | `0x055476B69029367CF0E26eC784FB456Ed8ebcA00` | 3                   | `caroline.whispery.eth`   |

> Alice is also the contract deployer / admin (`DEPLOYER_ADDRESS` / `ADMIN_PRIVATE_KEY`).

---

## Contracts — Ethereum Sepolia (chain ID 11155111)

### WhisperyNFT — ERC-721 membership token (UUPS proxy)

| Role            | Address                                      |
|-----------------|----------------------------------------------|
| **Proxy** (use) | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` |
| Implementation  | `0xBa8e267C1E21DC25bB0B5623Bc8B0eFb3209EFaa` |

- [Proxy on Etherscan](https://sepolia.etherscan.io/address/0x51a5a1c73280b7a15dfbd3b173cd178c8a824c16)
- Key methods: `mint(address to) onlyOwner` · `isMember(address) → bool` · `balanceOf(address) → uint256`

### WhisperyBackpack — off-chain pointer store

| Address | `0x532434E21Cd2cE47e6e54bFd02070984d84f05d1` |
|---------|----------------------------------------------|

- [Contract on Etherscan](https://sepolia.etherscan.io/address/0x532434e21cd2ce47e6e54bfd02070984d84f05d1)
- Maps `channelId → eeePointer + swarmOverlay + epoch`
- Write access gated by WhisperyNFT membership

---

## ENS names — Ethereum Mainnet

All subdomains of `whispery.eth`.

| ENS name                   | Resolves to                                  | Purpose                          |
|----------------------------|----------------------------------------------|----------------------------------|
| `whispery.eth`             | owner wallet                                 | Root domain / admin              |
| `alice.whispery.eth`       | `0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c` | Alice's personal identity        |
| `betty.whispery.eth`       | `0xBF0c2136430053e6839113Abac2E55DBeB0E80a7` | Betty's personal identity        |
| `caroline.whispery.eth`    | `0x055476B69029367CF0E26eC784FB456Ed8ebcA00` | Caroline's personal identity     |
| `beachclaw.whispery.eth`   | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` | Group chat — gates via NFT contract |

> `beachclaw.whispery.eth` is the **group ENS name** for the demo.
> It resolves to the NFT contract — pasting it in the Omnibar triggers the group access flow.

---

## Omnibar demo flows

### Flow A — ENS group name (main demo)
```
Paste: beachclaw.whispery.eth
Wallet: Alice / Betty / Caroline (any wallet holding tokenId 1–3)
Result: ✓ alice.whispery.eth — acceso a beachclaw.whispery.eth confirmado
```

### Flow B — NFT contract address
```
Paste: 0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16
Wallet: any member wallet
Result: ✓ Token verificado — [ENS name or 0xABCD…] es miembro de WhisperyNFT
```

### Flow C — Personal ENS name
```
Paste: alice.whispery.eth
Wallet: must be Alice's wallet (0x50b8…)
Result: ✓ alice.whispery.eth — membership confirmed
Fails with: any other wallet
```

### Flow D — Luma event URL
```
Paste: https://lu.ma/<event-slug>
Requires: LUMA_API_KEY + ADMIN_PRIVATE_KEY in api/.env
          vercel dev running locally
Result: VerificationFlow modal → email verify → mint NFT → chat
```

---

## Environment variables

### Frontend (`/.env`)

| Variable          | Description                          |
|-------------------|--------------------------------------|
| `VITE_ENS_RPC_URL` | Alchemy mainnet RPC for ENS lookups |

### API (`/api/.env`)

| Variable            | Description                                     |
|---------------------|-------------------------------------------------|
| `LUMA_API_KEY`      | Luma API key — lu.ma/settings/developer         |
| `ADMIN_PRIVATE_KEY` | Alice's private key — pays gas for `mint()`     |
| `SEPOLIA_RPC_URL`   | Sepolia RPC for minting                         |
