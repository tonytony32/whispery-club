# Whispery · Transport Layer (Level 1)

How encrypted messages travel between members over Waku.

---

## The problem

Level 0 provides the contracts: the NFT proves membership, the Backpack stores the EEE pointer on IPFS. But messages themselves don't live on-chain — it would be too expensive and slow. We need a network that:

- Has no central server that can go down or censor
- Allows sending messages without revealing who talks to whom
- Is efficient — doesn't force every node to process every message in the world

That network is **Waku**.

---

## Waku: the decentralised postal system

Imagine a postal system with no central post office. The postmen are thousands of nodes distributed across the internet, and messages don't go to an exact address but to a **neighbourhood** (content topic).

You subscribe to your channel's topic. When someone sends a group message, they publish to that same topic. All members receive everything that arrives there and decide what to open.

```
Alice                    Waku Network                  Bob + Charlie
  │                                                           │
  │── publishes to channel topic ──→ /whispery/1/channel-0x{id[0:8]}/proto
  │                                               │           │
  │                                               └──────────→│
  │                                                           │ receive, filter, decrypt
```

---

## Two routing modes

Whispery supports two message routing modes. The active mode is **group**.

### Group mode (active)

All members share a `content_key` obtained from the EEE. Messages are published to a **channel topic** derived from `channel_id`. All members of the channel subscribe to the same topic.

```
topic = /whispery/1/channel-0x{channel_id[0:8]}/proto
```

With `channel_id` being the first 8 hex chars of `sha256("whispery/nft/{tokenId}")`. The content_key encrypts every message — no outer ECIES layer is needed because the key is already shared among all members via the ACT.

### P2P mode (available, not the default UI)

Each node subscribes to a **neighbourhood topic** derived from its own X25519 public key:

```
topic = /whispery/1/neighbor-0x{pubKey[0:2]}/proto
```

With 2 bytes there are 65,536 possible neighbourhoods. P2P messages use ECIES over X25519 — an ephemeral keypair encrypts the entire L0 Envelope for the specific recipient.

---

## The wire format: Envelope

Every message travelling over Waku has exactly two fields, defined in `src/transport/proto/envelope.proto`:

```proto
message Envelope {
  bytes mac_hint = 1;  // 8 bytes — fast filter
  bytes data     = 2;  // encrypted payload
}
```

Analogy: it's a physical envelope. The envelope has something written on the outside that lets you decide whether to open it or discard it without reading the contents.

The design is intentionally minimal. More fields in the clear means more fingerprinting surface — making Whispery traffic distinguishable from other Waku traffic. Privacy-first design keeps only what is strictly necessary outside the encryption.

---

## mac_hint: the name on the outside of the envelope

### P2P hint

Derived from the **recipient's X25519 public key**:

```
mac_hint = HMAC-SHA256(recipientPubKey, "SWARM_L1_HINT")[0:8]
```

Only the intended recipient matches this hint. In a neighbourhood with ~65,536 possible peers, it filters ~99.99% of messages before spending CPU on ECIES decryption.

### Group hint

Derived from the **channel_id bytes**:

```
mac_hint = HMAC-SHA256(channelIdBytes, "SWARM_L1_CHANNEL_HINT")[0:8]
```

All members of the channel compute the same hint. It filters out messages from unrelated channels that happen to share the same topic prefix (possible when two `channel_id` values collide on the first 8 hex chars).

In both cases the hint is **not secret** and does not authenticate — it is purely a performance optimisation.

---

## data: the L0 Envelope inside

The `data` field carries a **Level 0 Envelope** — the cryptographic payload defined in `src/core/crypto.ts`. L1 is the transport wrapper; L0 is the cryptographic payload.

### Group

```
data = JSON(L0_Envelope)   // no outer encryption — content_key already shared
```

The L0 Envelope's `ciphertext` is encrypted with `content_key` (shared among all ACT members via the EEE). The L0 fields themselves (`sender_pk`, `channel_id`, `timestamp`) are visible on the wire. This is the standard tradeoff in group messaging: metadata is exposed to Waku nodes, but message content is not.

### P2P

```
data = eciesEncrypt(recipientPubKey, JSON(L0_Envelope))
```

The entire L0 Envelope — including sender identity, channel, and timing — is ECIES-encrypted. Nothing is visible on the wire except the 8-byte `mac_hint`.

The L0 Envelope (inside):

```typescript
{
  version:    1
  channel_id: string    // which channel this belongs to
  epoch:      number    // key rotation epoch
  sender_pk:  string    // sender's X25519 public key
  ciphertext: string    // message encrypted with the channel/session key
  mac_hint:   string    // first 4 bytes of nonce (L0 routing hint)
  timestamp:  number    // unix ms — stamped at send time
  signature:  string    // secp256k1 — non-repudiation
}
```

---

## ECIES: the lock on the P2P envelope

For P2P messages, the `data` field is encrypted with **ECIES over X25519** (nacl.box).

How it works:

1. The sender generates a **disposable ephemeral keypair** (just for this message)
2. Diffie-Hellman key agreement: `secret = DH(ephemeral_key, recipient_pubKey)`
3. Encrypts the message with that shared secret
4. Sends: `ephemeral_pub(32) | nonce(24) | ciphertext+tag`

The recipient reverses the process: `secret = DH(my_private_key, ephemeral_pub)` → decrypts.

Analogy: a combination lock the sender builds on the spot, calibrated specifically for the recipient's lock, then throws away the key. Only the recipient can open it. The sender is anonymous at the wire level.

Group messages do not use ECIES — the shared `content_key` (obtained from the EEE via the ACT) already provides symmetric encryption for all members.

---

## Identity: SIWE instead of a private key

To participate in the messenger, each user needs their own X25519 keypair. The problem: we can't ask MetaMask for the Ethereum private key.

The solution is the **SIWE** (Sign-In With Ethereum) pattern, extended to derive two keys from a single signature:

```
MetaMask signs SIWE (once)
        │
        ▼
  siwe_signature (65 bytes, deterministic — RFC6979)
        │
    sha256(sig) = seed
        │
        ├── nacl.box.keyPair(seed)            → X25519 keypair   (encrypt/decrypt)
        └── hkdf(seed, "whispery/signing/v1") → secp256k1 key    (sign each message)
```

Both keys are deterministic — same wallet always produces the same keys. One MetaMask popup at connection time, then all subsequent messages are signed and encrypted automatically without any additional prompts.

The signing key is **not** Alice's Ethereum private key — it is a derived key, bound to her wallet deterministically. It signs each L0 Envelope, providing non-repudiation within the Whispery protocol.

---

## Group channel bootstrap

Before a user can send or receive group messages, they need the `content_key`. The flow is:

```
1. Read EEE pointer from WhisperyBackpack contract (on-chain)
2. Fetch EEE JSON from IPFS gateway (ipfs.ts: fetchJSON)
3. accessGroupChannel(wallet, eee) → content_key
   - Computes DH(sk_member, pk_group)
   - Derives lookup_key → finds ACT entry
   - Decrypts encrypted_content_key with access_kdk
   - Returns content_key, or null if wallet not in ACT
4. Subscribe to /whispery/1/channel-0x{channel_id[0:8]}/proto
```

If the wallet is not in the ACT (not a member), `accessGroupChannel` returns `null` and the connection is rejected before joining Waku.

---

## The complete flow

```
User clicks "Connect to Waku"
  │
  ├─ MetaMask: sign(SIWE) → signature
  ├─ sha256(sig) → seed
  ├─ seed → x25519 keypair + secp256k1 signingKey
  │
  ├─ Read eeePointer from WhisperyBackpack (wagmi useReadContract)
  ├─ fetchJSON(eeePointer) → EEE
  ├─ accessGroupChannel(wallet, eee) → content_key  (null → rejected)
  │
  ├─ createLightNode({ defaultBootstrap: true })
  ├─ node.waitForPeers([LightPush, Filter])
  │
  ├─ new L1Messenger(node, wallet)
  └─ messenger.subscribeGroup(eee.channel_id, content_key)
       → listening on /whispery/1/channel-0x{channel_id[0:8]}/proto

User sends "hello" to the group
  │
  ├─ L0 = createGroupEnvelope(wallet, content_key, channel_id, "hello", epoch)
  │         plaintext = realPk(32) || signingPk(33) || ethAddr(20) || siweSig(65) || "hello"
  │         ciphertext = nonce[24] || secretbox(plaintext, nonce, content_key)
  │         sender_pk  = random 32 bytes   ← Zero Metadata: no identity on the wire
  ├─ hint    = HMAC-SHA256(channelIdBytes, "SWARM_L1_CHANNEL_HINT")[0:8]
  ├─ payload = encode({ mac_hint: hint, data: JSON(L0) })
  └─ node.lightPush.send → Waku

Member receives a message on the channel topic
  │
  ├─ decode(payload) → { mac_hint, data }
  ├─ mac_hint == channelHint? → No  → "Group: Ignored by channel hint"
  │                           → Yes → JSON.parse(data) → L0 Envelope
  ├─ openGroupEnvelope(content_key, l0)
  │     secretbox.open(ciphertext, nonce, content_key) → plain[150+]
  │     Stage 1 — SIWE:  ecrecover(siweSig, hash(siweMsg(ethAddr))) == ethAddr
  │                       → fail → "identidad falsa" (discard)
  │     Stage 2 — Keys:  sha256(siweSig) → derive x25519 + signingPk → compare
  │                       → mismatch → "falsificación de llaves detectada" (discard)
  │     Stage 3 — L0 sig: secp256k1.verify(signature, sha256(canonical), signingPk)
  │                       → fail → "firma inválida" (discard)
  │     return plain[150:] as message text
  └─ emit 'message' event → { text, senderPk: realPk, timestamp } → UI
```

---

## File structure

```
src/transport/
  proto/
    envelope.proto      canonical protobuf schema
    envelope.ts         hand-rolled codec (no build step)
  crypto/
    hints.ts            macHint (P2P) + channelHint (group)
    ecies.ts            P2P encrypt/decrypt: X25519 + XSalsa20-Poly1305
  messenger.ts          L1Messenger:
                          P2P:   publish / subscribe
                          Group: publishGroup / subscribeGroup
                          Topic helpers: neighborhoodTopic / channelTopic
  node.ts               createWakuNode: lifecycle, defaultBootstrap, onStatus
  useMessenger.ts       React hook: SIWE → two keys → fetch EEE → content_key → Waku
  __tests__/
    hints.test.ts
    ecies.test.ts
    envelope.test.ts
    messenger.test.ts   P2P + group tests (22 total)

src/core/
  ipfs.ts               uploadJSON (write) + fetchJSON (read) via IPFS gateway
  crypto.ts             L0 crypto: createGroupEnvelope / openGroupEnvelope / accessGroupChannel
                          Zero Metadata: random outer sender_pk
                          Anti-Spoofing SIWE in-band: 150-byte identity header inside ciphertext
                          Three-stage validation: SIWE ecrecover → key derivation → L0 sig
  __tests__/
    crypto.test.ts      L0 group envelope tests: round-trip, zero metadata, 3 validation stages (12)
```

---

## Zero Metadata + Anti-Spoofing SIWE in-band (implemented at L0)

Two improvements implemented simultaneously, both strictly in `src/core/crypto.ts`:

### Zero Metadata

The outer `sender_pk` field is **32 random bytes** on every group message. Transport nodes and Waku relay operators see only ephemeral random data — the real sender identity never appears in the clear.

### Anti-Spoofing SIWE in-band

The plaintext (before `secretbox` encryption) carries a **150-byte identity header**:

```
real_sender_pk[32] || signing_pub_key[33] || eth_address[20] || siwe_signature[65] || message_utf8
```

`openGroupEnvelope` runs three stages after decryption:

```
Stage 1 — SIWE identity
  ecrecover(siweSignature, hash(siweMessage(ethAddress))) == ethAddress
  → fail → throw "identidad falsa"

Stage 2 — Key derivation
  seed = sha256(siweSignature)
  sha256(seed) → nacl.box.keyPair → compare with real_sender_pk
  HKDF(seed, "whispery/signing/v1") → secp256k1 pubkey → compare with signing_pub_key
  → mismatch → throw "falsificación de llaves detectada"

Stage 3 — L0 outer signature
  secp256k1.verify(envelope.signature, sha256(canonical), signing_pub_key)
  → fail → throw "firma inválida"
```

To forge a valid message as Alice, an attacker needs Alice's Ethereum private key. Without it, Stage 1 (ecrecover) fails.

---

## What is not implemented yet

- **Key registry on-chain**: the SIWE proof chain binds `ethAddress → keys` cryptographically, but `ethAddress` itself is self-declared inside the encrypted header. A Key Registry contract storing `(x25519PubKey, ethAddress)` on-chain would allow cross-referencing the declared identity against verified NFT membership.
- **Store protocol**: messages sent while a peer is offline are lost. Waku has a Store protocol for retrieving message history.
- **Key rotation**: if a user reinstalls MetaMask with the same seed phrase, they recover the same Ethereum keys → same SIWE signature → same Whispery keypair. Key rotation would require a versioned SIWE nonce or an explicit rotation mechanism.
