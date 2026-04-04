# Whispery · Circles Mini-app

How approved Luma guests claim their group membership and derive Waku identity keys inside a Circles wallet.

---

## The problem

Whispery's core crypto and transport layers assume an EOA wallet (MetaMask) that can sign messages on demand. Circles users have a **Gnosis Safe** as their primary identity — a Smart Account that can't sign every Waku envelope cheaply or quickly.

Additionally, membership provisioning (minting the NFT) must be gated on a real-world approval: the guest was approved at a Luma event. Without a bridge, that approval lives only in Luma's database.

---

## The solution

Two modules close both gaps:

```
Guest approved on Luma
  │
  │  opens Circles wallet → WhisperyMiniApp
  │
  ├─ 1. email + Privy OTP  →  proves email ownership
  ├─ 2. /api/claim-membership  →  checks Luma + mints WhisperyNFT to Safe
  ├─ 3. ethers.Wallet.createRandom()  →  ephemeral session EOA (localStorage)
  └─ 4. Safe signs SIWE (once)  →  seed for Waku X25519 + secp256k1 keys
```

---

## Backend — `api/claim-membership.ts`

Vercel serverless function. **Stateless — no database.**

### Endpoint

```
POST /api/claim-membership
Content-Type: application/json

{
  "userEmail":      "alice@example.com",
  "circlesAddress": "0xSafeAddress…",
  "lumaEventId":    "evt-whispery-001"
}
```

### Logic

```
1. Validate inputs (email format, ethers.isAddress, eventId present)
2. Walk Luma paginated guest list (GET /v1/event/get-guests)
   → find userEmail → check approval_status in { approved, checked_in }
   → not found → 403
   → found but not approved → 403
3. nft.isMember(circlesAddress)
   → already member → 200 { alreadyMember: true }  (idempotent, no gas wasted)
4. nft.mint(circlesAddress)  — admin wallet signs, pays gas
5. Extract tokenId from Transfer(0x0 → Safe) event log
6. Return 200 { success, tokenId, txHash }
```

### NFT contract

| Property | Value |
|---|---|
| Contract | WhisperyNFT (UUPS Proxy) |
| Address | `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` |
| Network | Ethereum Sepolia (chain ID 11155111) |
| Mint function | `mint(address to) onlyOwner → tokenId` |

### Environment variables

| Variable | Description |
|---|---|
| `LUMA_API_KEY` | Luma API key — get at lu.ma/settings/developer |
| `ADMIN_PRIVATE_KEY` | Owner wallet hex private key — pays gas for mint |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint |

---

## Frontend — `src/circles/WhisperyMiniApp.tsx`

React component designed to run inside the Circles wallet interface. Six sequential steps, each with loading and error states.

### Step flow

```
Step 1 — Connect
  window.ethereum (injected by Circles) → Safe address

Step 2 — Email
  User enters Luma-registered email.
  If VITE_LUMA_EVENT_ID not set, also asks for event ID (demo mode).

Step 3 — Verify (Privy OTP)
  privyEmail.sendCode({ email })  →  user receives code
  privyEmail.loginWithCode({ code })  →  email ownership confirmed
  ↳ Skipped if VITE_PRIVY_APP_ID not set (demo mode)

Step 4 — Claim
  POST /api/claim-membership → { tokenId, txHash }

Step 5 — Sign
  generateSessionKey() → ethers.Wallet.createRandom() → localStorage
  Safe signs siweMessage(safeAddress)  (one MetaMask/Safe popup, free)
  activateWithSig(sig, safeAddress) → keysFromSig() → Waku keypair

Step 6 — Ready
  Session key active. Open Whispery Chat.
```

### Session key design

The Safe cannot sign every Waku envelope in real time. The solution:

1. Generate a random **ephemeral EOA** (`ethers.Wallet.createRandom()`) and store it in `localStorage`.
2. Ask the Safe to sign **one SIWE message** (no gas, off-chain). This is the same deterministic SIWE format used by the MetaMask flow in `useMessenger.ts`.
3. `keysFromSig(safeSignature, safeAddress)` → identical derivation path as the rest of Whispery:

```
sha256(siweSignature) = seed
  ├── nacl.box.keyPair(seed)            → X25519 keypair   (Waku encrypt/decrypt)
  └── HKDF(seed, "whispery/signing/v1") → secp256k1 key    (L0 envelope signing)
```

The ephemeral EOA address appears in the SIWE authorisation message so it is bound to the Safe's identity. The Safe's EIP-1271 signature is deterministic for the same message — same wallet, same keys, every session.

### Privy email verification

Privy (https://privy.io) provides passwordless email OTP. It proves the user controls the email address they claim to have registered on Luma — preventing anyone from impersonating another guest's email.

**Setup:**
1. Create a Privy app at privy.io → copy the App ID
2. `npm install @privy-io/react-auth`
3. Set `VITE_PRIVY_APP_ID=your-app-id` in `.env`
4. Wrap the app entry point:

```tsx
import { PrivyProvider } from '@privy-io/react-auth'

<PrivyProvider appId={import.meta.env.VITE_PRIVY_APP_ID}>
  <WhisperyMiniApp />
</PrivyProvider>
```

If `VITE_PRIVY_APP_ID` is not set the verify step is skipped — useful for local demos where you control the event guest list.

---

## File structure

```
api/
  claim-membership.ts    Vercel serverless endpoint — Luma check + NFT mint
  package.json           Standalone ESM package — only dependency: ethers ^6

src/circles/
  WhisperyMiniApp.tsx    6-step guided UI component
  useCirclesAddress.ts   Resolves Safe address from window.ethereum (EIP-1193)
  useSessionKey.ts       Ephemeral EOA lifecycle — generate, activate, clear
```

The `src/circles/` module is isolated from `src/transport/` and `src/core/`. It imports only `siweMessage` and `keysFromSig` from `src/core/crypto.ts` — the same primitives the MetaMask flow uses — so the derived keys are fully compatible with the existing L0/L1 stack.

---

## Environment variables (frontend)

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | Privy app ID — enables email OTP verification |
| `VITE_LUMA_EVENT_ID` | Pre-fill the Luma event ID (optional) |

---

## What is not implemented yet

- **Circles SDK integration** — `useCirclesAddress` uses the standard `window.ethereum` EIP-1193 injection. If Circles exposes a dedicated SDK or context provider, swap it there.
- **Navigation to chat** — the Ready step shows a placeholder button. It should render `<MessengerView />` or navigate to it, reusing the session key's derived `Wallet`.
- **Session key expiry** — the ephemeral key persists in `localStorage` indefinitely. A TTL check (e.g. 30 days) and re-sign flow would improve security.
- **Privy provider placement** — `<PrivyProvider>` must wrap `<WhisperyMiniApp>` at the app entry point. This wiring is not included in `main.tsx` yet.
- **LUMA_API_KEY on Vercel** — the `claim-membership` function requires `LUMA_API_KEY`, `ADMIN_PRIVATE_KEY`, and `SEPOLIA_RPC_URL` set in the Vercel dashboard (Settings → Environment Variables).
