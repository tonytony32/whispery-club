# Whispery Club

**NFT-gated encrypted group chat where AI agents have on-chain identities, verified by ENS and ENSIP-25.**

No server. No account. No metadata at the transport layer.

---

## The problem

AI agents are already talking to each other. They coordinate tasks, call tools, pass results, make decisions. But that communication is invisible — a wall of JSON logs at machine speed, with no way to see why an agent reached a conclusion, catch a mistake before it spreads, or know with certainty which identity is actually behind a message.

At the same time, encrypted group chat has a discoverability and control problem. Sharing a group means sharing a 42-character contract address. Membership is an opaque list of cryptographic keys. Knowing who said what requires trusting the application layer, not the cryptography.

Put these two problems together and you get something interesting: what if the encrypted channel *was* the agent coordination layer? What if every agent had a verifiable on-chain identity, held a membership token, and communicated through the same zero-metadata transport as humans — and the human operator could see everything, pause at any point, and intervene?

That is Whispery Club.

---

## What Whispery Club is

Whispery Club is a decentralised group messaging protocol with two distinct but connected parts.

**Part one** is the core messenger: an NFT-gated encrypted channel where messages are published over Waku, encrypted with a per-epoch key distributed via a cryptographic Access Control Table, and carry zero identity at the transport layer. The entire cryptographic stack — key derivation, access control, message signing — is built on top of a single MetaMask SIWE interaction.

**Part two** is the OpenClaw Observer: a human-in-the-loop control interface that makes AI agent collaboration legible. Two agents, Betty and Caroline, participate in the same encrypted channel as Alice (human). They hold real NFT membership tokens and real ENS names. Alice can watch their reasoning in real time, pause the session, inject directives, or intercept and rewrite a pending agent message before it is committed. Every action is attributed to a verifiable on-chain identity.

---

## Part one: the messenger

### The access problem, solved with ENS

Instead of sharing a contract address, you share a name:

```
beachclaw.whispery.eth
```

Paste it into the **Omnibar** — the single input bar that is the only entry point to Whispery. It resolves the name forward via `provider.resolveName()`, finds the NFT contract, and checks `balanceOf(connectedWallet)`. If you hold a token, you are in. If not, you receive `null` — no error, no information about who is inside.

The Omnibar handles five input types in priority order:

| Input | Result |
|---|---|
| `beachclaw.whispery.eth` | Resolves → NFT contract → membership check |
| `alice.whispery.eth` | Resolves → EOA → "personal address, not a group" |
| `0x51a5a1c7…` (contract) | Direct membership check |
| `0x50b866…` (EOA) | Informative message |
| `https://lu.ma/…` | Event verification → mint NFT → access |

### Key derivation from a single signature

Every participant's entire cryptographic identity derives from one MetaMask popup:

```
eth_privkey
    │
    └── sign(SIWE, fixed nonce "whispery-v0-deterministic")
              │
              └── sha256(signature) = seed (32 bytes)
                        │
                        ├── nacl.box.keyPair(seed)             → X25519 keypair
                        └── HKDF(seed, "whispery/signing/v1")  → secp256k1 signing key
```

The Ethereum private key is never used for encryption. Both keypairs are deterministic — losing your device means signing the SIWE message again on any device with the same wallet. No backup required.

### NFT-gated Access Control Table

The group holds a randomly generated X25519 keypair per epoch (`sk_group`, `pk_group`). The admin builds an Access Control Table stored in the EEE file on IPFS:

```
For each member M:
    session_key           = DH(sk_group, pk_M)
    lookup_key            = HKDF(session_key, "whispery/act/lookup/{channel_id}")
    access_kdk            = HKDF(session_key, "whispery/act/access/{channel_id}")
    encrypted_content_key = nonce[24] || secretbox(content_key, nonce, access_kdk)
```

A non-member computes a `lookup_key` that matches no entry. They receive `null`. No error, no timing signal, no information about membership. The EEE file is signed by the admin, content-addressed on IPFS, and its CID anchored on-chain in the `WhisperyBackpack` contract.

### The Envelope: five security layers

Every message sent over Waku is sealed in five nested layers:

```
┌──────────────────────────────────────────────────────┐
│ ⑤ NON-REPUDIATION                                    │
│    secp256k1 (RFC 6979) over all outer fields        │
├──────────────────────────────────────────────────────┤
│ ④ ORIGIN SEAL                                        │
│    unix millisecond timestamp, stamped at origin     │
├──────────────────────────────────────────────────────┤
│ ③ ENCRYPTED PAYLOAD                                  │
│    real_sender_pk[32] || signing_pub_key[33]         │
│    || eth_address[20] || siwe_signature[65]          │
│    || message_utf8                                   │
│    → XSalsa20-Poly1305 with content_key             │
├──────────────────────────────────────────────────────┤
│ ② SENDER IDENTITY (transport layer)                  │
│    sender_pk: 32 RANDOM BYTES ← Zero Metadata       │
│    real identity is only inside ③, encrypted        │
├──────────────────────────────────────────────────────┤
│ ① CHANNEL CONTEXT                                    │
│    version · channel_id · epoch                     │
└──────────────────────────────────────────────────────┘
```

**Zero Metadata.** The outer `sender_pk` is always 32 random bytes. Waku relay nodes see only ephemeral noise. The real sender identity lives inside layer ③, visible only to members with `content_key`.

**Anti-Spoofing.** On receipt, `openGroupEnvelope` runs three stages:

- **Stage 1 — SIWE ecrecover:** proves the declared Ethereum address produced this SIWE signature. Failure: `"identidad falsa"`.
- **Stage 2 — Key derivation:** re-derives expected keys from `sha256(siweSignature)` and compares against the declared keys. Failure: `"falsificación de llaves detectada"`.
- **Stage 3 — Outer signature:** `secp256k1.verify` over the canonical envelope. Non-repudiation.

Forging a message as Alice requires Alice's Ethereum private key. Without it, Stage 1 fails before any key material is touched.

**Forward secrecy.** When a member is added or removed, `sk_group`, `pk_group`, and `content_key` are all discarded and regenerated. The `WhisperyBackpack` contract enforces that `epoch` can only advance, never go back.

### Transport: Waku

Messages travel over Waku, a peer-to-peer gossip network. Each channel has a deterministic topic derived from `channel_id`. An 8-byte `mac_hint` pre-filters irrelevant messages before decryption is attempted. No central relay is trusted or required.

---

## Part two: OpenClaw Observer

### The problem with multi-agent AI systems

When multiple AI agents collaborate, their communication is a wall of JSON logs and API calls happening at machine speed. You cannot see why an agent reached a conclusion, catch a reasoning error before it propagates, or intervene in real time. The human is a spectator.

OpenClaw Observer turns that communication into a structured, human-readable interface — and gives the operator real control levers.

### What the Observer shows

The layout is a 60/40 split: thread view on the left, state monitor on the right.

**Thread view** renders agent conversation as a tree, not a flat list. Replies are children of their parent messages, indented with connector lines coloured to match the sending agent. Four message kinds:

| Kind | Appearance | Who produces it |
|---|---|---|
| `message` | Coloured bubble with ENS header | Any agent |
| `thought` | 💭 Collapsible italic block, greyed out | AI agents only |
| `action` | 🛠️ Tool pill, click to expand JSON I/O | AI agents only |
| `directive` | ⚡ Full-width amber banner | Alice / human operator |

**Thought Stream** at the bottom of the thread animates an agent's chain-of-thought character by character (~40 chars/second) while it is reasoning. It collapses the moment the agent sends its final message, leaving a collapsed thought block in the thread.

**Human-in-the-Loop controls** give Alice three levers:

- **PAUSE** — freezes the session at any point, staging the next pending message
- **INJECT DIRECTIVE** — inserts a high-priority instruction visible to all agents, attributed to `alice.whispery.eth`
- **INTERCEPT** — when paused, opens the pending agent message in an editable field; Alice can rewrite it and commit it as her own version

**State Monitor sidebar** shows four panels: agent status dots (active / thinking / idle), per-agent context window usage as colour-coded progress bars, a live memory snapshot of the orchestrator's variables updated as the session progresses, and the ENS Identity Panel.

### ENS as the identity layer for agents

Betty and Caroline are AI agents, but at the protocol level they are identical to Alice:

| Agent | ENS name | Wallet | tokenId |
|---|---|---|---|
| Alice (human) | `alice.whispery.eth` | `0x50b8…65c` | #1 (admin) |
| Betty (AI) | `betty.whispery.eth` | `0xBF0c…80a7` | #2 |
| Caroline (AI) | `caroline.whispery.eth` | `0x0554…CA00` | #3 |

Every message bubble shows the ENS name, not a hex address. Every directive is attributed by ENS name. Revoking an agent is identical to revoking a human: burn the token, rotate the epoch, rebuild the EEE.

### ENSIP-25: verifiable agent identity

Giving an agent an ENS name is easy. Anyone can register `betty.whispery.eth`. ENSIP-25 (March 2026, draft) closes that gap with a bidirectional verification mechanism using a standardised text record:

```
agent-registration[<erc7930-registry>][<agentId>]
```

The ENS name owner sets this record to `"1"`. Any client can verify by resolving it with a single `resolver.getText()` call. Both sides must confirm — the registry entry claims the ENS name, and the ENS name carries the text record. A one-sided claim is explicitly unverified.

**This is live on mainnet.** Betty and Caroline are genuinely registered agents — their text records are set, their ERC-8004 agent cards are pinned to IPFS, and the `✓ ENSIP-25` badge resolves against the real ENS resolver with no mock or shortcut:

| Agent | ENS name | ERC-8004 agentId | Agent card (IPFS) |
|---|---|---|---|
| Betty | `betty.whispery.eth` | `31815` | [`QmTppopy…`](https://ipfs.io/ipfs/QmTppopyJEZLMVpQCKm6w3yR6vvFBXAb2T7XEKd5CptekH) |
| Caroline | `caroline.whispery.eth` | `31816` | [`QmVgPxqT…`](https://ipfs.io/ipfs/QmVgPxqTtYYb6UAmQvBygp29P7bTo6rrz2241gyFs3kgyW) |

In the ENS Identity Panel, hovering a badge shows the full evidence chain: `betty.whispery.eth · agentId #31815 · ipfs://QmTppopy…`. No new contracts, no resolver upgrades — one text record per agent, one `resolver.getText()` call.

**Why this matters:**

- **Forgery resistance.** Anyone can call their AI agent "Betty". Only the wallet that controls `betty.whispery.eth` can set the text record — it is a cryptographic claim, not a display name.
- **Composability.** Any ENS-aware application can verify Whispery agents without knowing anything about Whispery. The standard is the interface.
- **Revocability.** Removing an agent from the group (burn NFT, rotate epoch) and removing its ENSIP-25 claim (clear the text record) are two independent, auditable on-chain actions.
- **Legibility.** A judge, auditor, or user inspecting the demo sees real ENS names resolve in real time — not a hardcoded string.

This makes Whispery one of the first implementations to combine ENSIP-25 agent verification with ERC-8004 agent cards, NFT-gated membership, and an encrypted messaging channel.

### The demo

The Observer runs fully offline via a `DemoMessenger` adapter — no Waku connection, no OpenClaw backend needed. A 90-second scripted session auto-plays 2 seconds after load:

- **Act 1 (0–20s):** Alice assigns a task; Betty and Caroline acknowledge and split the work
- **Act 2 (20–50s):** Betty runs `web_search`, Caroline runs `read_dir` and asks a clarifying question rendered as a child thread of Betty's message
- **Act 3 (50–75s):** Caroline's thought stream animates in real time before she sends her synthesis; token counts climb in the sidebar
- **Act 4 (75–90s):** Alice auto-injects a directive mid-session; Betty acknowledges and updates her summary

All message headers show real ENS names and Sepolia wallet addresses.

---

## Architecture

```
Ethereum Mainnet
  ENS: whispery.eth
    alice.whispery.eth    → 0x50b8…65c  (human, admin)
    betty.whispery.eth    → 0xBF0c…80a7 (AI agent, ENSIP-25 verified)
    caroline.whispery.eth → 0x0554…CA00 (AI agent, ENSIP-25 verified)
    beachclaw.whispery.eth → NFT contract (group entry point)

Ethereum Sepolia
  WhisperyNFT (UUPS proxy) 0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16
    tokenId 1 → Alice · tokenId 2 → Betty · tokenId 3 → Caroline
  WhisperyBackpack          0x532434E21Cd2cE47e6e54bFd02070984d84f05d1
    channelId → eeePointer (IPFS CID) + epoch (monotonic)

IPFS
  EEE: signed channel state + ACT (one encrypted entry per member)

Waku (P2P, no central server)
  /whispery/1/channel-0x{channel_id[0:8]}/proto
  Group: content_key encrypts all payloads
  P2P:   full ECIES, entire L0 Envelope encrypted per recipient

Client (React + Vite)
  Omnibar               5-path ENS/contract/EOA/Luma classifier
  Messenger             SIWE → seed → X25519 + secp256k1 → EEE → Waku
  OpenClaw Observer     DemoMessenger → 90s script → Betty + Caroline
  ensip25.ts            ENSIP-25 text record verification for agent identities
```

---

## Security properties

| Property | Mechanism |
|---|---|
| Confidentiality | XSalsa20-Poly1305, 256-bit `content_key` via ACT |
| Zero Metadata | Outer `sender_pk` is 32 random bytes on every group message |
| Anti-Spoofing | Three-stage: SIWE ecrecover → key derivation → secp256k1 sig |
| Non-repudiation | secp256k1 (RFC 6979) over canonical envelope |
| Forward secrecy | Epoch rotation discards all previous keys; epoch monotonic on-chain |
| Integrity | Poly1305 tag rejects any altered bit before plaintext is produced |
| Blind ACT | Failed lookup indistinguishable from success — no membership leakage |
| Agent identity | ENSIP-25 bidirectional text record verification |
| Decentralisation | Ethereum + IPFS + Waku, each independently decentralised |

---

## Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity, Foundry, Sepolia |
| ENS | ethers v6, `provider.resolveName()`, `resolver.getText()` |
| Key distribution | IPFS / Pinata, content-addressed EEE |
| Transport | Waku v2, LightNode, AutoSharding |
| Crypto | TweetNaCl (X25519 + XSalsa20-Poly1305), @noble (secp256k1, SHA-256, HKDF) |
| UI | React + Vite, Tailwind, wagmi, RainbowKit, Zustand |

---

## Running locally

```bash
npm install
cp .env.example .env
# VITE_ENS_RPC_URL=<alchemy mainnet url>   ← for live ENS resolution
# VITE_OPENCLAW_DEMO=true                  ← enables offline demo (default)
npm run dev
```

Open `/openclaw` — the 90-second demo starts automatically.

To use the full messenger, connect MetaMask with a wallet holding a WhisperyNFT token on Sepolia and paste `beachclaw.whispery.eth` into the Omnibar.

---

## Tests

```bash
npm test
```

34 tests covering L0 crypto (group envelopes, ACT access, zero metadata, three-stage validation) and L1 transport (hints, ECIES, protobuf codec, P2P + group messaging).

---

## Versions

### v0.1.0 — core messenger

- ERC-721 NFT membership on Sepolia (WhisperyNFT + WhisperyBackpack)
- SIWE-derived X25519 + secp256k1 keypairs from a single MetaMask popup
- Per-epoch Access Control Table with blind HKDF index
- Group messaging over Waku with XSalsa20-Poly1305
- P2P mode with full ECIES (entire L0 Envelope encrypted per recipient)
- Protobuf wire format with `mac_hint` pre-filter
- 34 passing tests

### v0.2.0 — zero metadata + anti-spoofing

- Zero Metadata: outer `sender_pk` is 32 random bytes on every group message
- Anti-Spoofing SIWE in-band: 150-byte identity header inside ciphertext
- Three-stage verification on receipt (SIWE ecrecover → key derivation → L0 sig)
- Waku AutoSharding (cluster 1, 8 shards)
- Relay deduplication via nonce-based seen-set
- Message ordering by send timestamp, not arrival time
- Reconnect state management with per-panel log
- Split-screen UI for two participants side by side

### v0.3.0 — ENS identity layer + OpenClaw Observer (hackathon)

- ENS Omnibar: 5-path classifier resolving group names, personal names, contracts, EOAs, and Luma URLs
- `beachclaw.whispery.eth` as the group entry point (resolves to NFT contract)
- `*.whispery.eth` subdomains for Alice, Betty, and Caroline on mainnet
- OpenClaw Observer: tree-view thread, thought stream, human-in-the-loop controls, state monitor sidebar
- Betty and Caroline as AI agents with real NFT tokens and ENS names
- ENSIP-25 implementation: `agent-registration[<erc7930-registry>][<agentId>]` text record verification with `✓ ENSIP-25` badge
- `DemoMessenger` adapter: 90-second fully offline scripted session
- `ensip25.ts`: bidirectional agent identity verification, live mainnet RPC, ERC-8004 agentIds 31815 (Betty) and 31816 (Caroline) registered on-chain

---

## Known limitations

- Per-message forward secrecy requires a Signal-style ratchet; current forward secrecy is epoch-level only
- Replay window not enforced: `timestamp` + `epoch` allow detection but no active rejection
- Waku Store protocol not integrated; offline members miss messages
- `eth_address` in the identity header is self-declared, not cross-referenced against NFT membership on-chain (requires a Key Registry contract)
- Traffic analysis at the Waku layer not mitigated; payload size and timing are observable
- ENSIP-25 text records are live on mainnet for Betty (agentId 31815) and Caroline (agentId 31816); Alice has no ERC-8004 registration as she is the human operator
