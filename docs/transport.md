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

You subscribe to your public key's neighbourhood. When someone wants to send you a message, they drop it in your neighbourhood. You receive everything that arrives there — including messages for other neighbours — and decide what to open.

```
Alice                    Waku Network                    Bob
  │                                                       │
  │── publishes to Bob's neighbourhood ──→ /whispery/1/0xab/proto
  │                                               │       │
  │                                               └──────→│
  │                                                       │ receives, filters, decrypts
```

### Content topics and neighbourhoods

The neighbourhood is derived from the **first 2 bytes** of the recipient's X25519 public key:

```
/whispery/1/neighbor-0x{pubKey[0:2]}/proto
```

With 2 bytes there are 65,536 possible neighbourhoods. Two nodes end up in the same neighbourhood when their keys share the same prefix — probability ~1/65,536. Enough to keep traffic per neighbourhood manageable without revealing the recipient's exact identity.

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

When you receive post in an apartment building, before going up to floor 7 you check whether the name on the envelope matches. If it doesn't, you return it unopened.

The `mac_hint` does the same:

```
mac_hint = HMAC-SHA256(pubKey, "SWARM_L1_HINT")[0:8]
```

It's an 8-byte value derived from your public key. When a message arrives in your neighbourhood:

1. Compare the message's `mac_hint` with yours
2. If they don't match → discard (log "Ignored by hint") — without opening the envelope
3. If they match → attempt decryption

In a neighbourhood with 65,536 possible neighbours, the hint filters ~99.99% of messages before spending CPU on cryptography. The hint is **not secret** and does not authenticate — it is purely a performance optimisation.

---

## data: the L0 Envelope inside

The `data` field contains an ECIES-encrypted **Level 0 Envelope** — the same structure defined in `src/core/crypto.ts`. This is the key architectural decision: L1 is the transport wrapper, L0 is the cryptographic payload.

```
data = eciesEncrypt(recipientPubKey, JSON(L0_Envelope))
```

The L0 Envelope (inside the encryption) contains:

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

Everything that could identify the sender, the channel, or the timing is inside the encryption — invisible to the network.

---

## ECIES: the lock on the envelope

The `data` field is encrypted with **ECIES over X25519** — the same primitive used by the rest of the Whispery stack (nacl.box).

How it works:

1. The sender generates a **disposable ephemeral keypair** (just for this message)
2. Diffie-Hellman key agreement: `secret = DH(ephemeral_key, recipient_pubKey)`
3. Encrypts the message with that shared secret
4. Sends: `ephemeral_pub(32) | nonce(24) | ciphertext+tag`

The recipient reverses the process: `secret = DH(my_private_key, ephemeral_pub)` → decrypts.

Analogy: a combination lock the sender builds on the spot, calibrated specifically for the recipient's lock, then throws away the key. Only the recipient can open it. The sender is anonymous at the wire level — no sender identity appears outside the encryption.

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

The signing key is **not** Alice's Ethereum private key — it is a derived key, bound to her wallet deterministically. It signs each L0 Envelope, providing non-repudiation within the Whispery protocol. In the future, a key registry mapping `ethAddress → signingPubKey` will allow recipients to verify sender identity against the NFT membership list.

---

## The complete flow

```
User clicks "Connect to Waku"
  │
  ├─ MetaMask: sign(SIWE) → signature
  ├─ sha256(sig) → seed
  ├─ seed → x25519 keypair + secp256k1 signingKey
  │
  ├─ createLightNode({ defaultBootstrap: true })
  ├─ node.waitForPeers([LightPush, Filter])
  │
  ├─ new L1Messenger(node, wallet)
  └─ messenger.subscribe() → listening on /whispery/1/neighbor-0x{myPrefix}/proto

User sends "hello" to Bob
  │
  ├─ L0 = createP2PEnvelope(wallet, bobX25519PubKey, "hello")
  │         → { ciphertext, sender_pk, timestamp, signature }
  ├─ data    = eciesEncrypt(bobPubKey, JSON(L0))
  ├─ hint    = HMAC-SHA256(bobPubKey, "SWARM_L1_HINT")[0:8]
  ├─ payload = encode({ mac_hint: hint, data })
  └─ node.lightPush.send → Waku

Bob receives a message in his neighbourhood
  │
  ├─ decode(payload) → { mac_hint, data }
  ├─ mac_hint == myHint? → No  → "Ignored by hint"
  │                      → Yes → eciesDecrypt(mySecretKey, data)
  ├─ JSON.parse → L0 Envelope
  ├─ openP2PEnvelope(myWallet, senderPk, l0) → "hello"
  └─ emit 'message' event → { text, senderPk, timestamp } → UI
```

---

## File structure

```
src/transport/
  proto/
    envelope.proto      canonical protobuf schema
    envelope.ts         hand-rolled codec (no build step)
  crypto/
    hints.ts            mac_hint: HMAC-SHA256(pubKey, domain)[0:8]
    ecies.ts            encrypt/decrypt: X25519 + XSalsa20-Poly1305
  messenger.ts          L1Messenger: publish (L0 inside) + subscribe + hint filter
  node.ts               createWakuNode: lifecycle, defaultBootstrap, onStatus
  useMessenger.ts       React hook: SIWE → two keys → Waku → L1Messenger
  __tests__/
    hints.test.ts
    ecies.test.ts
    envelope.test.ts
    messenger.test.ts   includes sender_pk verification from L0 envelope
```

---

## What is not implemented yet

- **Key registry**: for Alice to know Bob's X25519 public key, Bob needs to publish it somewhere (on-chain, IPFS, or manual exchange). Currently the demo uses hardcoded Anvil keys as a substitute. A natural fit: add `registerKey(bytes32 x25519PubKey)` to the NFT or Backpack contract.
- **Store protocol**: messages sent while a peer is offline are lost. Waku has a Store protocol for retrieving message history.
- **Key rotation**: if a user reinstalls MetaMask with the same seed phrase, they recover the same Ethereum keys → same SIWE signature → same Whispery keypair. Key rotation would require a versioned SIWE nonce or an explicit rotation mechanism.
- **Group envelope integration**: currently using P2P envelopes. Full group messaging requires fetching the EEE from IPFS to obtain the `content_key`, then using `createGroupEnvelope`.
