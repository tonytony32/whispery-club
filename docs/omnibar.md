# Whispery · Omnibar

The universal entry point for Whispery — a single smart input bar that classifies
what the user pastes and routes them into the correct access flow.

---

## Classification — 5 paths (priority order)

| Priority | Input | Detection | Flow |
|---|---|---|---|
| 1 | Luma event URL | contains `lu.ma/` | VerificationFlow modal → email check → mint NFT → chat |
| 2 | NFT contract address | `0x` + 40 hex, `eth_getCode != "0x"` | Connect wallet → `balanceOf(connected)` → chat |
| 3 | ENS group name | `*.eth`, resolves to a contract | Connect wallet → `balanceOf(connected)` on resolved contract → chat |
| 3b | ENS personal name | `*.eth`, resolves to an EOA | Informative message — not a group, no chat |
| 4 | EOA address | `0x` + 40 hex, `eth_getCode == "0x"` | Informative message — not a group, no chat |
| 5 | Unrecognised | anything else | Format hint |

**Important:** paths 2/3/3b/4 share the same `0x` detection. The sync check
sets kind to `classifying` and fires an async `eth_getCode` call to Sepolia
to distinguish contract from EOA. A short "Analysing…" state is shown while
this resolves.

---

## UX flows

### Path 1 — Luma URL

```
User pastes https://lu.ma/3wczh9p4
  │
  └── VerificationFlow modal opens
        │
        ├── Option A: Email (Privy OTP) — stubbed, COMING SOON
        │
        └── Option B: Web3 wallet  ← active for demo
              │
              ├── Connect wallet (window.ethereum)
              ├── ENS lookup: lookupAddress → getResolver → getText('email')
              │     → found:  auto-fill email input
              │     → not found: "No email found in ENS registry — enter manually"
              │
              ├── User types / confirms email
              │
              └── POST /api/resolve-event
                    { eventUrl, verifiedEmail, targetWallet }
                      ├── parse URL slug → lumaId
                      ├── Luma API: is email approved?
                      │     → not found → 403
                      │     → not approved → 403
                      └── mint WhisperyNFT → { tokenId, txHash }
```

### Path 2 — NFT contract address

```
User pastes 0x51a5a1c7…
  │
  ├── eth_getCode → "!= 0x" → classified as contract
  ├── Connect wallet (window.ethereum)
  ├── nft.balanceOf(connectedWallet)
  │     → > 0  → ✓ [ENS name or 0xABCD…] is a member of [nft.name()]
  │     → = 0  → "Your wallet doesn't hold a membership token for this group."
  └── Reverse ENS lookup on connected wallet → show name if found
```

### Path 3 — ENS group name (→ contract)

```
User pastes beachclaw.whispery.eth
  │
  ├── provider.resolveName() → 0x51a5a1c7… (NFT contract)
  ├── eth_getCode → contract confirmed
  ├── Connect wallet (window.ethereum)
  ├── nft.balanceOf(connectedWallet)
  │     → > 0  → ✓ [alice.whispery.eth] — access to beachclaw.whispery.eth confirmed
  │     → = 0  → "Your wallet doesn't hold a membership token for WhisperyNFT."
  └── Reverse ENS lookup on connected wallet → show ENS name in success msg
```

### Path 3b — ENS personal name (→ EOA)

```
User pastes alice.whispery.eth
  │
  ├── provider.resolveName() → 0x50b8… (EOA)
  ├── eth_getCode → "0x" → EOA
  └── Informative neutral message:
      "alice.whispery.eth is a personal address, not a group.
       To access a chat, use a group ENS name (e.g. beachclaw.whispery.eth)."
```

### Path 4 — EOA address

```
User pastes 0xSomeEOA…
  │
  ├── eth_getCode → "0x" → EOA
  └── Informative neutral message:
      "This app is designed for group conversations.
       To access a channel, paste a Luma event URL, an NFT contract address,
       or a group ENS name."
```

---

## File structure

```
src/omnibar/
  Omnibar.tsx           5-path classifier + NFT/ENS ownership checks
  VerificationFlow.tsx  Luma verification modal (Email stub + Web3 active)
  useENSEmail.ts        ENS email lookup for VerificationFlow (getText('email'))
  ensDisplay.ts         resolveDisplayName() + resolveENSName() with RPC fallback chain

api/
  resolve-event.ts      POST: URL parse → Luma guest check → NFT mint
  package.json          commonjs, ethers ^6, @vercel/node
```

---

## `ensDisplay.ts`

Central ENS utility — used by both the ENS path and the NFT success message.

```typescript
// RPC fallback chain (mainnet, for ENS)
VITE_ENS_RPC_URL → rpc.ankr.com/eth → ethereum.publicnode.com → 1rpc.io/eth

resolveENSName(name)          // forward: alice.whispery.eth → 0x50b8…
resolveDisplayName(address)   // reverse: 0x50b8… → alice.whispery.eth (cached)
truncateAddress(address)      // 0x50b8…5c65 fallback
```

`resolveDisplayName` uses an in-memory `Map<string, string>` cache — addresses
with no ENS name are also cached (as truncated) to avoid repeat RPC calls.

---

## `api/resolve-event.ts`

### Endpoint

```
POST /api/resolve-event
Content-Type: application/json

{
  "eventUrl":      "https://lu.ma/3wczh9p4",
  "verifiedEmail": "alice@example.com",
  "targetWallet":  "0xYourWalletAddress"
}
```

### URL parsing

```
https://lu.ma/3wczh9p4   →  slug "3wczh9p4"
https://lu.ma/evt-abc123 →  slug "evt-abc123"
```

Slug passed to `GET /v1/event/get-guests?event_api_id={slug}`.
If Luma returns no guests, use the internal `evt-xxx` ID from the dashboard.

### Error messages

| Scenario | HTTP | Message |
|---|---|---|
| Email not in guest list | 403 | "This email is not registered for the event." |
| Email found but not approved | 403 | "Your registration is pending or was not approved." |
| Wallet already has NFT | 200 | "You already hold a membership token." |
| Luma API unreachable | 502 | "Could not reach Luma API — try again shortly." |

---

## Environment variables

### Frontend (`/.env`)

| Variable | Description |
|---|---|
| `VITE_ENS_RPC_URL` | Alchemy mainnet HTTPS URL — used first for ENS resolution |

### API (`/api/.env`)

| Variable | Description |
|---|---|
| `LUMA_API_KEY` | Luma API key — lu.ma/settings/developer |
| `ADMIN_PRIVATE_KEY` | Alice's wallet key — pays gas for `mint()` |
| `SEPOLIA_RPC_URL` | Sepolia RPC for minting |

---

## What is not implemented yet

- **Navigation to chat** — all success paths show "Opening chat…" placeholder.
  Should render `<MessengerView />` passing the group ENS name and session wallet.
- **Privy email path** — visual stub in `VerificationFlow.tsx`, marked COMING SOON.
  See Privy setup instructions in the stub comments.
- **Waku bootstrap after mint** — after Luma claim, user should be guided through
  SIWE signing + Waku connect from `useMessenger.ts`.
