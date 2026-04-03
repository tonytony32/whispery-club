/**
 * ECIES over X25519 — sealed-box encryption for L1 point-to-point messages.
 *
 * Uses the same primitives as the rest of the Whispery stack (tweetnacl):
 *   - X25519 for key agreement
 *   - XSalsa20-Poly1305 for authenticated encryption
 *
 * Wire layout of the `data` field:
 *   ephemeralPub  32 bytes   X25519 ephemeral public key
 *   nonce         24 bytes   random, used once
 *   box           n+16 bytes XSalsa20-Poly1305 output (ciphertext + auth tag)
 *
 * The recipient only needs their X25519 secret key to open the box.
 * The sender is intentionally anonymous at this layer (no sender pubkey in wire).
 */

import nacl from 'tweetnacl'

const EPH_PUB_LEN = 32
const NONCE_LEN = nacl.box.nonceLength // 24

export function eciesEncrypt(recipientPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(NONCE_LEN)
  const box = nacl.box(plaintext, nonce, recipientPub, ephemeral.secretKey)

  const out = new Uint8Array(EPH_PUB_LEN + NONCE_LEN + box.length)
  out.set(ephemeral.publicKey, 0)
  out.set(nonce, EPH_PUB_LEN)
  out.set(box, EPH_PUB_LEN + NONCE_LEN)
  return out
}

export function eciesDecrypt(recipientSk: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < EPH_PUB_LEN + NONCE_LEN + nacl.box.overheadLength) {
    throw new Error('ECIES: data too short')
  }
  const ephPub = data.slice(0, EPH_PUB_LEN)
  const nonce = data.slice(EPH_PUB_LEN, EPH_PUB_LEN + NONCE_LEN)
  const box = data.slice(EPH_PUB_LEN + NONCE_LEN)

  const plain = nacl.box.open(box, nonce, ephPub, recipientSk)
  if (!plain) throw new Error('ECIES: decryption failed — wrong key or tampered ciphertext')
  return plain
}
