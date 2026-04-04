# Envelope & EEE — Structure and Topology

## The Two Core Data Structures

Whispery has two fundamental objects that carry all state and communication:

- **EEE** — the channel state file. Created once per epoch. Holds group identity, access control, and membership.
- **Envelope** — a sealed message. Created by a member for every message sent. Carries the encrypted payload and proof of authorship.

---

## EEE — Channel State File

```
{
  version:       1,
  channel_id:    "780a35cc…",     ← sha256("whispery/nft/{tokenId}")
  epoch:         0,               ← increments on every key rotation
  pk_group:      "8fbe54d2…",     ← X25519 public key, random per epoch
  act:           [ … ],           ← one entry per authorized member
  chunks_hint:   1,               ← conceptual fragment count for transport
  created_at:    1775239095747,   ← unix ms, stamped at origin
  admin_address: "0xf39Fd6…",     ← Ethereum address of the creator
  signature:     "13b6a965…"      ← secp256k1 over sha256(canonical EEE)
}
```

### Where each field comes from

#### `channel_id`

```
channel_id = sha256("whispery/nft/" + tokenId)
```

Deterministic and fixed for the lifetime of the channel. Any member can
recompute it independently from the NFT token ID alone, with no coordination
needed. It never changes across epochs.

#### `pk_group`

```
groupKP    = nacl.box.keyPair()   ← random X25519 keypair
pk_group   = groupKP.publicKey    ← published in EEE
sk_group   = groupKP.secretKey    ← kept secret by the admin
```

`pk_group` is **randomly generated** each time a channel epoch is created.
It cannot be derived from the token ID, the admin address, or any other
public input. This is intentional:

- If it were deterministic, anyone knowing the derivation path could
  precompute it before the channel existed and mount attacks on the ACT.
- The entire security of the Access Control Table rests on `sk_group`
  being unknowable. Every ACT entry is built with `DH(sk_group, pk_member)`,
  and that DH is only secure if `sk_group` was never predictable.

`pk_group` is **stable for the duration of an epoch**. It is published in
the EEE and all members use the same value to derive their session keys.
It only changes on key rotation — a new epoch generates a completely fresh
`nacl.box.keyPair()`, making all previous access permanently invalid.
The old `sk_group` is discarded; the new one has never been seen by anyone.

#### `admin_address`

Derived from the admin's Ethereum private key using the standard Ethereum
address derivation:

```
pubkey_uncompressed = secp256k1.getPublicKey(privKey, false)   // 65 bytes
xy_bytes            = pubkey_uncompressed.slice(1)             // drop 0x04 prefix → 64 bytes
address             = keccak256(xy_bytes).slice(-20)           // last 20 bytes
checksummed         = EIP-55 checksum via viem getAddress()
```

Fixed for the lifetime of the admin wallet. Identifies who signed and
authorized this EEE.

#### `signature`

```
hash      = sha256(canonical_JSON_without_signature_field)
signature = secp256k1.sign(hash, admin_eth_privkey)
```

Canonical JSON means: all keys sorted alphabetically, the `signature` field
stripped. This guarantees determinism across implementations. Anyone can
verify the EEE was built by the holder of `admin_address` and has not been
tampered with.

---

### ACT — Access Control Table

Each entry in `act` corresponds to one authorized member:

```
{
  lookup_key:            "298c51…",   ← used to find this entry in the table
  encrypted_content_key: "1100b0…"    ← the group content key, sealed for this member only
}
```

Built per member as follows:

```
session_key           = DH(sk_group, pk_member)
lookup_key            = HKDF(session_key, "whispery/act/lookup/{channel_id}")
access_kdk            = HKDF(session_key, "whispery/act/access/{channel_id}")
encrypted_content_key = nonce[24] || secretbox(content_key, nonce, access_kdk)
```

- `session_key` is symmetric: `DH(sk_group, pk_M) = DH(sk_M, pk_group)`.
  The member recomputes it on their side using only their own secret key and
  the public `pk_group`.
- `lookup_key` is a blind index — a node can route messages by matching
  lookup keys without learning anything about membership.
- `encrypted_content_key` is unique per member. The same `content_key` is
  wrapped inside, but sealed with a different `access_kdk` for each person.
  Nobody can use another member's entry.

A wallet not in the ACT (e.g. Wallet D) recomputes a `lookup_key` that
matches no entry. It receives `null`. No error is exposed, no information
about membership is leaked.

---

## Envelope — Sealed Message

```
{
  version:    1,
  channel_id: "780a35cc…",
  epoch:      0,
  sender_pk:  "7a94cc…",
  ciphertext: "73da6d…",
  mac_hint:   "73da6d",
  timestamp:  1775239095747,
  signature:  "c92bb4…"
}
```

### Topology — five layers

The envelope is built incrementally. Each layer adds a specific security or
routing property:

```
┌─────────────────────────────────────────────────────┐
│  ⑤ NON-REPUDIATION                                  │
│     signature: secp256k1(sha256(all fields above))  │
├─────────────────────────────────────────────────────┤
│  ④ ORIGIN SEAL                                      │
│     timestamp: unix ms, stamped by sender           │
├─────────────────────────────────────────────────────┤
│  ③ ENCRYPTED PAYLOAD                                │
│     ciphertext: nonce[24] || XSalsa20-Poly1305(msg) │
│     mac_hint:   nonce[0..3] — routing hint only     │
├─────────────────────────────────────────────────────┤
│  ② SENDER IDENTITY                                  │
│     sender_pk: X25519 public key of the sender      │
├─────────────────────────────────────────────────────┤
│  ① CHANNEL CONTEXT                                  │
│     version · channel_id · epoch                    │
└─────────────────────────────────────────────────────┘
```

#### ① Channel context — `version`, `channel_id`, `epoch`

Routes the envelope to the correct channel and epoch. A node can filter
messages without decrypting anything. An envelope with `epoch: 0` cannot
be decrypted by a member who only has keys for `epoch: 1`.

#### ② Sender identity — `sender_pk`

The X25519 public key of the sender. In a P2P channel the recipient needs
it to recompute the DH shared secret. In a group channel it identifies who
sent the message without revealing the content.

In both cases, `sender_pk` travels inside the L1 `data` field. For P2P,
the entire L0 Envelope (including `sender_pk`) is ECIES-encrypted, so it
is invisible on the wire. For group, `sender_pk` is visible to transport nodes —
this is the standard group messaging tradeoff: member identity is exposed
at the transport layer, but message content is not.

#### ③ Encrypted payload — `ciphertext`, `mac_hint`

```
nonce      = random 24 bytes
ciphertext = nonce || XSalsa20-Poly1305(message, nonce, content_key)
mac_hint   = nonce[0..3]
```

The Poly1305 authentication tag is embedded inside `ciphertext` by NaCl's
`secretbox`. If a single bit is altered, decryption fails with an explicit
error — there is no way to tamper silently.

`mac_hint` is **not** a MAC. It is a routing hint derived from the nonce:
an intermediate node can use it to match messages to channels without
decrypting anything. Authentication is fully handled by Poly1305 inside the
ciphertext.

#### ④ Origin seal — `timestamp`

Unix milliseconds stamped by the sender at the exact moment of emission.
Responsibility for timekeeping sits at the origin, not at any relay or
server. This enables:

- Sequential ordering of messages across epochs
- Collision prevention when the network processes concurrent state transitions
- Epoch validity checks (a message timestamped before `eee.created_at` is stale)

#### ⑤ Non-repudiation — `signature`

```
canonical = JSON({ all fields except signature }, keys sorted alphabetically)
hash      = sha256(canonical)
signature = secp256k1.sign(hash, sender_eth_privkey)
```

Proves that the holder of the Ethereum identity corresponding to `sender_pk`
built this exact envelope with this exact content and this exact timestamp.
Any modification to any field invalidates the signature.

**Verification** (`openGroupEnvelope` with a `KeyRegistry`):

```
signingPubKey = keyRegistry.get(envelope.sender_pk)  // registered secp256k1 pubkey
valid         = secp256k1.verify(signature, sha256(canonical), signingPubKey)
```

If the signature is invalid or the sender is not in the registry, the message is
rejected before decryption. Without a registry, decryption proceeds but the
signature is not checked — this is the current default until the on-chain
Key Registry is deployed.

---

## Key Rotation — Effect on Both Structures

When a member is added or removed, both structures are rebuilt from scratch:

| | Before rotation | After rotation |
|---|---|---|
| `epoch` | N | N + 1 |
| `pk_group` | old random keypair | new random keypair |
| `content_key` | old | new (random) |
| `act` | old member set | new member set |
| Old envelopes | decryptable | still decryptable by old members |
| New envelopes | — | only decryptable by new member set |

The old `sk_group` and `content_key` are discarded. Messages from epoch N
cannot be decrypted with epoch N+1 keys. This provides forward secrecy
between epochs.
