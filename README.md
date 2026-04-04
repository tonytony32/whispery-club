# Whispery Club

NFT-gated encrypted group messenger. Messages travel over Waku — no servers, no central relay, no metadata at the transport layer.

---

## What it does

- **Membership** — an ERC-721 NFT on Sepolia proves you belong to the group. One token per wallet.
- **Key distribution** — the admin publishes an EEE (Envelope/Epoch/Entry) file to IPFS and anchors the CID on-chain. Members fetch it and use their X25519 key to decrypt the shared `content_key`.
- **Messaging** — messages are encrypted with `content_key` (XSalsa20-Poly1305), wrapped in a Waku envelope, and published to a channel topic. Every member subscribed to that topic receives and decrypts them.
- **Identity** — no separate private key to manage. MetaMask signs a SIWE message once; two deterministic keypairs are derived from the signature (X25519 for encryption, secp256k1 for signing).
- **Anti-spoofing** — every message embeds a 150-byte identity header inside the ciphertext: real sender key + Ethereum address + SIWE signature. Three-stage verification on receipt (SIWE ecrecover → key derivation → L0 signature).
- **Zero metadata** — the outer `sender_pk` field is 32 random bytes. Transport nodes see no sender identity.

---

## Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity, Foundry, Sepolia |
| Key distribution | IPFS (Pinata), content-addressed |
| Transport | Waku v2, AutoSharding, LightNode |
| Crypto | TweetNaCl (X25519 + XSalsa20), @noble (secp256k1, SHA-256, HKDF) |
| UI | React + Vite, wagmi, RainbowKit |

---

## Running locally

```bash
npm install
cp .env.example .env   # fill in VITE_PINATA_JWT and VITE_SEPOLIA_RPC_URL
npm run dev
```

Requires a wallet (MetaMask) with a WhisperyNFT token on Sepolia. See `docs/contracts_deployed.md` for addresses.

---

## Docs

| File | Contents |
|---|---|
| `docs/x25519.md` | Key agreement primitives and SIWE derivation |
| `docs/envelope-and-eee.md` | L0 Envelope structure, EEE/ACT topology |
| `docs/transport.md` | L1 transport over Waku — topics, routing, message flow |
| `docs/security.md` | Security properties, threat model, attack surface |
| `docs/contracts.md` | WhisperyNFT + WhisperyBackpack contract reference |
| `docs/contracts_deployed.md` | Deployed addresses on Sepolia |

---

## Tests

```bash
npm test
```

34 tests covering L0 crypto (group envelopes, ACT access, zero metadata, three-stage validation), L1 transport (hints, ECIES, protobuf codec, P2P + group messaging).

---

## v0.2.0 — what's in this release

- Full end-to-end encrypted group messaging in the browser (Alice via MetaMask + Betty via demo key)
- Zero Metadata: outer `sender_pk` is random on every group message
- Anti-Spoofing SIWE in-band: 150-byte identity header inside ciphertext, three-stage verification
- Waku AutoSharding (cluster 1, 8 shards) — matches the default bootstrap network
- Relay deduplication: nonce-based seen-set discards duplicate deliveries from multiple relay peers
- Message ordering by send timestamp (not arrival time)
- Disconnected/reconnect state management with per-panel log and reconnect button
- Split-screen UI — two participants side by side in a single window
- 34 passing tests
