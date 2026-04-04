# Whispery · Luma Oracle

How guest approvals from a Luma event get recorded as on-chain attestations via EAS.

---

## The problem

Whispery Club membership is gated by an NFT. But the question of *who gets that NFT* — who was invited, who showed up, who was approved — happens off-chain, in an event management platform like Luma.

Without a bridge, that approval exists only in Luma's database. We want it on-chain: verifiable, permanent, not dependent on any single platform.

---

## The solution: a serverless oracle

A serverless function sits between Luma and the blockchain. Luma fires a webhook when a guest's status changes. The oracle intercepts it, verifies the status is `approved`, and emits an **EAS attestation** on Sepolia.

```
Luma event
  │
  │  POST webhook (on guest approved)
  ▼
api/luma-oracle.js  (Vercel serverless function)
  │
  ├── extract email + eventId from payload
  ├── normalise email → keccak256 → bytes32 hashedEmail
  └── call EAS contract on Sepolia → emit attestation
              │
              ▼
        on-chain record:
        { hashedEmail, eventId, isApproved: true }
```

The email is never stored in the clear — only its hash. Anyone who knows the email can verify the attestation; no one can reverse the hash to learn the email from the chain.

---

## EAS schema

Registered on Sepolia at `sepolia.easscan.org`.

```
bytes32 hashedEmail, string eventId, bool isApproved
```

| Field | Type | Description |
|---|---|---|
| `hashedEmail` | `bytes32` | `keccak256(normalise(email))` — lowercase, trimmed |
| `eventId` | `string` | Luma event `api_id` |
| `isApproved` | `bool` | Always `true` — only approved guests trigger attestation |

**Schema UID:** `0x70ed7828d0738141d63b1b421f0a456bbd5d52de70e7b0b94d384a5bbb3aac2e`

---

## EAS contract

| Property | Value |
|---|---|
| Network | Ethereum Sepolia (chain ID 11155111) |
| EAS contract | `0xC2679fBD37d54388Ce493F1DB75320D236e1815e` |
| Explorer | `sepolia.easscan.org` |

> Note: EAS is not deployed on Gnosis Chain. Sepolia is the appropriate testnet.

---

## Webhook payload (Luma)

The oracle reads three fields from the Luma webhook body:

```json
{
  "payload": {
    "guest": {
      "email": "alice@example.com",
      "status": "approved"
    },
    "event": {
      "api_id": "evt-whispery-001"
    }
  }
}
```

If `status` is anything other than `approved`, the function returns `200` with `{ skipped: true }` and emits nothing.

---

## File structure

```
api/
  luma-oracle.js       HTTP handler — parse webhook, validate, respond
  lib/
    config.js          EAS contract address + env validation (loadEnv)
    email.js           hashEmail(): normalise + keccak256
    attest.js          emitAttestation(): ethers contract call, returns UID
  package.json         standalone CJS package — only dependency: ethers ^6
  .env.example         required env vars with comments
```

The `api/` directory is intentionally isolated from `src/core` and `src/transport`. It has its own `package.json` and `node_modules` — no shared dependencies with the Vite frontend.

---

## Environment variables

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Hex private key of the signing wallet (no `0x` prefix). Pays gas. |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint (Alchemy, Infura, etc.) |
| `EAS_SCHEMA_UID` | `bytes32` UID of the registered schema above |

---

## Implementation note: no EAS SDK

The function calls the EAS contract directly via `ethers.Contract` — the `@ethereum-attestation-service/eas-sdk` package was removed. The SDK pulled in `hardhat` as a runtime dependency, which introduced 24 audit vulnerabilities (mocha, solc, undici, elliptic...) none of which were in any executed code path.

The replacement is two things from `ethers` v6:

```javascript
// Schema data encoding (replaces SchemaEncoder)
const abiCoder    = ethers.AbiCoder.defaultAbiCoder()
const encodedData = abiCoder.encode(
  ['bytes32', 'string', 'bool'],
  [hashedEmail, eventId, true],
)

// Attestation UID (replaces tx.wait() from EAS SDK)
const attested = receipt.logs
  .map(log => { try { return eas.interface.parseLog(log) } catch { return null } })
  .find(e => e?.name === 'Attested')
const uid = attested.args.uid
```

Result: 0 audit vulnerabilities, ~350 fewer packages.

---

## Test results — 2026-04-04

Local test using `vercel dev` + `curl`, simulating Luma webhooks for the three founding members.

### Alice

```
email    : alice@example.com
hashedEmail : 0x75a90bbc4dd359da9253ea49138b05a4e37a5a4b4c8e4d66e7d39623523073fa
attestation : 0xe13399d6fdfdb800cd9a18d6e1d705f0458916bc3ef30df731612d4aa46245b0
```

### Betty

```
email    : betty@example.com
hashedEmail : 0x3f8eca8d5dd3e9c687a071ece95e5e4af200d0e066e6fbfb047acf569e4fcf08
attestation : 0x69184394c43b57c734f3e0046303f6b7365343f0c4e65b6888fee32db533479a
```

### Caroline

```
email    : caroline@example.com
hashedEmail : 0x11b00b1f2aa4d44dc97b287a86e491cf3406807eb10096dbe84fc61ad7e899c1
attestation : 0x9b434aefec4d7081677f7c60b38a4404cfe5e65da3231c42064fd1c3f931b34a
```

All three attestations are verifiable on `sepolia.easscan.org/attestation/view/<uid>`.

---

## What is not implemented yet

- **Webhook signature verification** — Luma signs its webhooks with an HMAC secret. The oracle should verify the `X-Luma-Signature` header before processing any payload.
- **Idempotency** — if Luma retries a webhook, the oracle will emit a duplicate attestation. A simple store (Redis, Vercel KV, or a mapping on-chain) keyed on `hash(email + eventId)` would prevent duplicates.
- **Revocation** — if a guest is later rejected or removed, the existing attestation is not revoked. EAS supports revocation; the oracle would need a separate endpoint or a status-change handler.
- **Production deploy** — the function runs locally via `vercel dev`. It has not been deployed to a public URL and the Luma webhook has not been configured to point to it.
