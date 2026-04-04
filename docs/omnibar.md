# Whispery · Omnibar

The universal entry point for Whispery — a single smart input bar that routes
users into the right access flow depending on what they paste.

---

## What it does

The Omnibar detects two kinds of input:

| Input | Detection | Flow |
|---|---|---|
| Luma event URL | starts with `http`, contains `lu.ma` | Verify identity → check Luma approval → mint NFT → chat |
| NFT contract address | matches `0x` + 40 hex chars | Connect wallet → check `balanceOf` → enter chat directly |

---

## UX flow

### Path 1 — Luma URL

```
User pastes https://lu.ma/3wczh9p4
  │
  └── VerificationFlow modal opens
        │
        ├── Option A: Email (Privy OTP) — stubbed, not active in demo
        │
        └── Option B: Web3 wallet  ← active for demo
              │
              ├── Connect MetaMask (window.ethereum)
              ├── ENS lookup: getResolver(address) → getText('email')
              │     → found:  auto-fill email input
              │     → not found: show "enter email manually" message
              │
              ├── User confirms / types email
              │
              └── POST /api/resolve-event
                    { eventUrl, verifiedEmail, targetWallet }
                      │
                      ├── parse URL → lumaId
                      ├── Luma API: is email approved?
                      │     → not found → 403 friendly message
                      │     → not approved → 403 friendly message
                      └── mint WhisperyNFT → { tokenId, txHash }
```

### Path 2 — NFT contract address

```
User pastes 0x51a5a1c7…
  │
  ├── Connect wallet (window.ethereum)
  ├── nft.balanceOf(userAddress)
  │     → balance > 0  → ✓ Token verified — enter chat
  │     → balance = 0  → "Your wallet doesn't hold a token from {name}"
  └── nft.name() shown in success message
```

---

## File structure

```
src/omnibar/
  Omnibar.tsx           Smart input bar — detection + NFT ownership check
  VerificationFlow.tsx  Luma verification modal (Email stub + Web3 active)
  useENSEmail.ts        ENS reverse-lookup + getText('email') hook

api/
  resolve-event.ts      POST endpoint: URL parse → Luma check → NFT mint
  package.json          Standalone ESM package — only dependency: ethers ^6
```

---

## Backend — `api/resolve-event.ts`

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

The Luma event slug is extracted from the URL path:

```
https://lu.ma/3wczh9p4   →  "3wczh9p4"
https://lu.ma/evt-abc123 →  "evt-abc123"
```

This slug is passed directly to `GET /v1/event/get-guests?event_api_id={slug}`.
If the Luma API returns no guests, the slug may need to be the internal `evt-xxx`
ID from the Luma dashboard (visible in the event settings).

### Luma guest check

Paginates through the full guest list until the email is found.
Accepted statuses: `approved`, `checked_in`.

### Error messages

| Scenario | HTTP | Message shown to user |
|---|---|---|
| Email not in guest list | 403 | "This email is not registered for the event." |
| Email found but not approved | 403 | "Your registration is pending or was not approved." |
| Wallet already has NFT | 200 | "You already hold a membership token." |
| Luma API unreachable | 502 | "Could not reach Luma API — try again shortly." |

### Environment variables

| Variable | Description |
|---|---|
| `LUMA_API_KEY` | Luma API key — get at lu.ma/settings/developer |
| `ADMIN_PRIVATE_KEY` | Owner wallet hex key — pays gas for `mint()` |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint |

---

## ENS email resolution

`useENSEmail.ts` runs a three-step lookup:

```
1. provider.lookupAddress(address)      → ENS name (e.g. alice.eth)
2. provider.getResolver(ensName)        → resolver contract
3. resolver.getText('email')            → email string or null
```

All three steps are graceful — if any returns null the hook sets a
user-friendly `status` string and lets the user enter their email manually.
No ENS name or no email record is not an error, just a fallback.

---

## Privy integration (not active)

The "Continue with Email" option in `VerificationFlow.tsx` is visually present
but marked **COMING SOON**. To activate it:

1. Create a Privy app at privy.io → copy the App ID
2. `npm install @privy-io/react-auth`
3. Set `VITE_PRIVY_APP_ID=your-app-id` in `.env`
4. Wrap `<Omnibar />` in `<PrivyProvider appId={...}>` in `main.tsx`
5. Replace the stub in `VerificationFlow.tsx` `path === 'email-privy'` section
   with `useLoginWithEmail()` from `@privy-io/react-auth`

---

## NFT contract

| Property | Value |
|---|---|
| Contract | WhisperyNFT (UUPS Proxy) |
| Address | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` |
| Network | Ethereum Sepolia (chain ID 11155111) |
| Mint | `mint(address to) onlyOwner` |
| Check | `isMember(address) → bool` |
| Check | `balanceOf(address) → uint256` |

---

## What is not implemented yet

- **Navigation to chat** — both success paths (`nftGranted` and `onSuccess`) show
  a placeholder. They should render `<MessengerView />` or push to the chat route,
  passing the derived session wallet.
- **Privy email path** — stub present in `VerificationFlow.tsx`, see above.
- **Omnibar in main app** — `<Omnibar />` is standalone. It needs to be wired
  into `App.tsx` as a landing tab or root route.
- **Waku bootstrap after mint** — after a successful claim, the user should
  automatically be guided through the SIWE signing + Waku connect flow from
  `useMessenger.ts`.
