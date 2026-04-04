# Whispery — Security Properties & Resilience

A precise account of what the protocol protects, how, and where the current boundaries are.

---

## Threat Model

### Who can be an adversary

| Actor | Capabilities |
|---|---|
| **Network observer** | Sees all Waku traffic (topics, payloads, timing) |
| **Waku relay node** | Stores and forwards messages; can drop, delay, or replay them |
| **Non-member** | Has no channel key material; can observe the network |
| **Malicious member** | Has `content_key`; can read all messages in the epoch |
| **Compromised device** | Full access to local key material (`ethPrivKey`, `content_key`) |

### What the adversary cannot do

- Compromise an Ethereum wallet without physical or software access to that device
- Reverse a SHA-256 hash or break X25519/secp256k1 with classical computing
- Forge a Poly1305 authentication tag without the encryption key

---

## Security Properties

### Confidentiality

Group messages are encrypted with a 256-bit `content_key` using **XSalsa20-Poly1305**. Only members whose X25519 public key appears in the ACT can derive `content_key`. Non-members receive a `null` from `accessGroupChannel` — no error is exposed, no membership information is leaked.

The `content_key` itself never travels in plaintext: it is wrapped per-member inside the ACT using a separate `access_kdk` derived via HKDF from a unique `DH(sk_group, pk_member)` session key. Obtaining one member's wrapped key reveals nothing about another member's.

P2P messages use **ECIES**: the sender generates an ephemeral X25519 keypair for each message and discards it immediately after sending. The entire L0 Envelope — including sender identity, channel, and timestamp — is encrypted. Nothing is visible on the wire except the 8-byte routing hint.

### Integrity

Every ciphertext carries an embedded **Poly1305 authentication tag** (inside NaCl `secretbox`). A single altered bit in the ciphertext — anywhere — causes decryption to fail with an explicit error before any plaintext is produced. There is no way to tamper with a message silently.

### Zero Metadata (sender privacy at transport layer)

In group mode, the outer `sender_pk` field of every envelope is **32 random bytes** — an ephemeral key with no relationship to the sender's identity. Transport nodes, relay operators, and observers see only random bytes and cannot determine who sent each message.

The real sender identity travels inside the ciphertext, encrypted with `content_key`, and is only visible to members who can decrypt.

### Sender authenticity (Anti-Spoofing SIWE in-band)

Every group message embeds a full **Anti-Spoofing identity header** (150 bytes) inside the ciphertext:

```
plaintext = real_sender_pk[32] || signing_pub_key[33] || eth_address[20] || siwe_signature[65] || message_utf8
ciphertext = nonce[24] || secretbox(plaintext, nonce, content_key)
```

On receipt, `openGroupEnvelope` runs three cryptographic stages in sequence:

**Stage 1 — SIWE ecrecover:** `ecrecover(siweSignature, hash(siweMessage(ethAddress))) == ethAddress`
Proves the declared Ethereum address actually signed the SIWE message. Throws `"identidad falsa"` on failure.

**Stage 2 — Key derivation:** re-derives `seed = sha256(siweSignature)`, then checks that `nacl.box.keyPair(seed).publicKey == real_sender_pk` and `secp256k1.getPublicKey(HKDF(seed, "whispery/signing/v1"), true) == signing_pub_key`.
Proves the declared keys are legitimate children of that SIWE signature. Throws `"falsificación de llaves detectada"` on failure.

**Stage 3 — L0 outer signature:** `secp256k1.verify(envelope.signature, sha256(canonical_outer_fields), signing_pub_key)`.
Non-repudiation over all outer envelope fields. Throws `"firma inválida"` on failure.

To forge a message claiming to be from Alice, an attacker would need Alice's Ethereum private key to produce a valid `siweSignature` for her `ethAddress`. Without it, Stage 1 fails before any key material is even checked.

### Non-repudiation

The `signature` field uses **secp256k1** with **RFC 6979** deterministic nonces — the same input always produces the same signature. It covers the canonical JSON of all envelope fields (keys alphabetically sorted, `signature` field stripped).

The signing key is derived deterministically from the SIWE signature:

```
seed       = sha256(siwe_signature)
signingKey = HKDF(seed, "whispery/signing/v1")
```

As long as the same Ethereum wallet produced the SIWE signature, the same signing key is recovered. A sender cannot plausibly deny that a valid signature was produced by their wallet.

### Forward secrecy (epoch-level)

When a member is added or removed, `rotateGroupChannel` generates a completely fresh `sk_group`, `pk_group`, and `content_key`. The old values are discarded immediately — no key derivation can recover them. A party evicted at epoch N+1 retains their epoch N keys and can still read epoch N messages (this is intentional — already-sent messages are not retroactively protected), but cannot decrypt any message from epoch N+1 onward.

This provides **forward secrecy between epochs**, not between individual messages within an epoch. Per-message forward secrecy would require a ratchet mechanism (out of current scope).

### Access control

The ACT lookup uses a blind index: each member's `lookup_key` is `HKDF(DH(sk_group, pk_M), "whispery/act/lookup/{channel_id}")`. An observer with access to the EEE can see that entries exist, but cannot determine which wallet corresponds to which entry without knowing either `sk_group` or the member's `sk_M`. The act of searching produces no timing signal — a non-member's failed lookup is indistinguishable from a member's successful one at the API level (`null` vs `Uint8Array`).

### EEE integrity

The EEE file is signed by the admin at creation time:

```
hash      = sha256(canonical_JSON_without_signature)
signature = secp256k1.sign(hash, admin_eth_privkey)
```

The IPFS CID (content-addressed hash) of the EEE is stored on-chain in the `WhisperyBackpack` contract. Anyone can verify that the EEE fetched from IPFS matches the on-chain pointer and that the admin signature is valid. A tampered EEE would not match the on-chain CID.

---

## Attack Surface

| Attack | Layer | Mitigation | Status |
|---|---|---|---|
| Eavesdrop on Waku traffic | L1 | Group: `content_key` encrypts payload; P2P: full ECIES | Mitigated |
| Replay a captured message | L0 | `epoch` + `timestamp` allow stale-message detection | Partial — no enforced window yet |
| Tamper with ciphertext | L0 | Poly1305 tag rejects any modification | Mitigated |
| Forge sender identity | L0 | SIWE ecrecover → key derivation → L0 sig (three-stage chain) | Mitigated |
| Member impersonates another | L0 | Requires target's Ethereum private key to pass SIWE ecrecover | Mitigated |
| Non-member accesses channel | L0 | ACT lookup returns `null`; no error exposed | Mitigated |
| Malicious relay drops messages | L1 | Waku multi-relay; no single relay is trusted | Mitigated by network |
| Malicious relay censors topics | L1 | No mitigation — relay can silently drop a topic | Open |
| Compromised `content_key` | L0 | All epoch N messages readable; signature still proves authorship | Partial — key rotation mitigates future |
| Compromised `ethPrivKey` | L0 | Full identity compromise: attacker can sign, derive all keys | No mitigation — device security |
| IPFS gateway unavailability | L1→L0 | EEE fetch fails; member cannot bootstrap | Open — no fallback gateway yet |
| EEE pointer substitution on-chain | L2 | On-chain CID is authoritative; IPFS is content-addressed | Mitigated |
| In-band `signingPubKey` not bound on-chain | L0 | Key is self-reported; anyone with `content_key` can claim any signing key | Open — requires Key Registry |

---

## Resilience

### No central server

Whispery has no servers that can be taken offline or compromised. The stack is:
- **Ethereum / Sepolia** — contract state (membership, EEE pointer)
- **IPFS** — EEE content (content-addressed, replicated across nodes)
- **Waku** — message transport (peer-to-peer, multi-relay)

Each layer is independently decentralized. Failure of any single relay, gateway, or RPC node degrades but does not stop the system.

### IPFS content addressing

The `eeePointer` stored on-chain is an IPFS CID — a cryptographic hash of the content. Any IPFS gateway that serves the correct content will return the same bytes. A gateway cannot serve a modified EEE while preserving the CID. If one gateway is down, any other can serve the content.

### Epoch invalidation is irreversible

Key rotation does not modify the previous EEE — it creates a new one with `epoch + 1`. The old EEE remains on IPFS and on-chain history is preserved. A member who was evicted cannot claim to still hold valid keys; the on-chain pointer makes the current epoch authoritative.

### Deterministic identity recovery

The SIWE signature is deterministic (same wallet → same signature → same X25519 + secp256k1 keys). A member can lose their device and recover full messaging identity by signing the SIWE message again on any device with the same Ethereum wallet. No additional backup is required.

---

## What is Not Yet Protected

### Per-message forward secrecy

Within an epoch, all messages share `content_key`. Compromise of `content_key` exposes all messages for that epoch. A Signal-style double ratchet would provide per-message forward secrecy, but adds significant complexity and state management.

### Replay window enforcement

The `timestamp` and `epoch` fields allow detecting stale or replayed messages, but no enforcement window is implemented. A relay could re-inject a past message and it would pass decryption and signature checks.

### Traffic analysis

Waku transport exposes metadata: channel topics, message timing, and payload sizes. An observer cannot read message content but can infer communication patterns. Padding, timing jitter, and decoy traffic are not implemented.

### Group metadata

The outer `sender_pk` is now random (see Zero Metadata above). However, message **size** and **timing** are still observable at the transport layer. Payload length reveals message length (minus the fixed 150-byte header). Timing analysis may reveal communication patterns between members.

### In-band SIWE binding to on-chain identity

The SIWE proof chain (Stage 1 + 2) cryptographically binds `ethAddress → siweSignature → keys`. However, the `ethAddress` is self-declared inside the encrypted header — there is no on-chain verification that the Ethereum address corresponds to an NFT member. A Key Registry contract storing `(x25519PubKey, ethAddress)` would close this gap by cross-referencing the declared identity against on-chain membership data.

### Message persistence

Messages sent while a peer is offline are lost when the Waku relay's message cache expires. The Waku Store protocol would provide history retrieval for offline peers.
