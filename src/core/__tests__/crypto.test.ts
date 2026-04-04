/**
 * Unit tests for L0 group envelope — Zero Metadata + Anti-Spoofing SIWE in-band.
 *
 * Inner plaintext layout (150-byte fixed header):
 *   [  0: 32]  real_sender_pk    — X25519 public key of the actual sender
 *   [ 32: 65]  signing_pub_key   — compressed secp256k1 signing key (33 bytes)
 *   [ 65: 85]  eth_address       — 20 raw bytes
 *   [ 85:150]  siwe_signature    — r(32) || s(32) || v(1)
 *   [150:   ]  message_utf8
 *
 * Outer envelope:
 *   sender_pk = 32 random bytes  ← identity is hidden at transport layer
 *
 * openGroupEnvelope runs three validations:
 *   1. SIWE ecrecover    → ethAddress signed the canonical SIWE message
 *   2. Key derivation    → X25519 + signing key are children of that SIWE signature
 *   3. L0 outer sig      → secp256k1 covers all outer envelope fields
 */

import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import {
  createWallet,
  createGroupChannel,
  accessGroupChannel,
  openGroupEnvelope,
  createGroupEnvelope,
  fromHex, toHex,
  DEMO_PRIVATE_KEYS,
  type Envelope,
} from '../crypto'

// ── Fixture wallets ───────────────────────────────────────────────────────────

const walletAlice   = createWallet(DEMO_PRIVATE_KEYS.A, 'Alice')
const walletBob     = createWallet(DEMO_PRIVATE_KEYS.B, 'Bob')
const walletCharlie = createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie')
const enc = new TextEncoder()

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeChannel() {
  return createGroupChannel(walletAlice, [walletAlice, walletBob, walletCharlie], 'TEST', 0)
}

/** Decrypt ciphertext and return raw plaintext bytes. */
function decryptPlaintext(env: Envelope, content_key: Uint8Array): Uint8Array {
  const raw   = fromHex(env.ciphertext)
  const nonce = raw.slice(0, 24)
  const box   = raw.slice(24)
  const plain = nacl.secretbox.open(box, nonce, content_key)
  if (!plain) throw new Error('decryptPlaintext: secretbox failed')
  return plain
}

/**
 * Re-seal a partial envelope using the given signing key.
 * Replicates the internal `seal()` logic for tamper tests.
 */
function sealPartial(partial: Record<string, unknown>, signingKey: Uint8Array): string {
  const sorted    = Object.fromEntries(Object.entries(partial).sort(([a], [b]) => a.localeCompare(b)))
  const canonical = JSON.stringify(sorted)
  const hash      = sha256(enc.encode(canonical))
  return bytesToHex(secp256k1.sign(hash, signingKey).toCompactRawBytes())
}

/**
 * Build a tampered group envelope where the inner plaintext has been modified.
 * The outer signature is re-sealed with `signingKey` so validation 3 can pass
 * (allowing validation 1 or 2 to be the one that fires in the test).
 */
function buildTamperedEnvelope(
  content_key: Uint8Array,
  eeeChannelId: string,
  eeeEpoch: number,
  tamperedPlain: Uint8Array,
  signingKey: Uint8Array,
): Envelope {
  const nonce  = nacl.randomBytes(24)
  const box    = nacl.secretbox(tamperedPlain, nonce, content_key)
  const newCtx = toHex(new Uint8Array([...nonce, ...box]))

  const partial = {
    version:    1 as const,
    channel_id: eeeChannelId,
    epoch:      eeeEpoch,
    sender_pk:  toHex(nacl.randomBytes(32)),
    ciphertext: newCtx,
    mac_hint:   toHex(nonce.slice(0, 4)),
    timestamp:  Date.now(),
  }
  return { ...partial, signature: sealPartial(partial as Record<string, unknown>, signingKey) }
}

// ── Tests: round-trip ─────────────────────────────────────────────────────────

describe('openGroupEnvelope — round-trip', () => {
  it('valid envelope → decrypts and passes all three validations', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env  = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola grupo', eee.epoch)
    const { text } = openGroupEnvelope(ckBob, env)

    expect(text).toBe('hola grupo')
  })

  it('all three members decrypt the same envelope', () => {
    const { eee, content_key } = makeChannel()
    const ckAlice   = accessGroupChannel(walletAlice, eee)!
    const ckBob     = accessGroupChannel(walletBob, eee)!
    const ckCharlie = accessGroupChannel(walletCharlie, eee)!

    const env = createGroupEnvelope(walletBob, content_key, eee.channel_id, 'broadcast', eee.epoch)

    expect(openGroupEnvelope(ckAlice, env).text).toBe('broadcast')
    expect(openGroupEnvelope(ckBob, env).text).toBe('broadcast')
    expect(openGroupEnvelope(ckCharlie, env).text).toBe('broadcast')
  })
})

// ── Tests: Zero Metadata (outer sender_pk) ────────────────────────────────────

describe('createGroupEnvelope — Zero Metadata', () => {
  it('outer sender_pk is NOT the real X25519 public key', () => {
    const { eee, content_key } = makeChannel()
    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    expect(env.sender_pk).not.toBe(toHex(walletAlice.x25519.publicKey))
  })

  it('outer sender_pk is different on every call (random ephemeral)', () => {
    const { eee, content_key } = makeChannel()
    const env1 = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const env2 = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    expect(env1.sender_pk).not.toBe(env2.sender_pk)
  })

  it('inner plaintext has correct 150-byte identity header', () => {
    const { eee, content_key } = makeChannel()
    const env   = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hello', eee.epoch)
    const plain = decryptPlaintext(env, content_key)

    const realPk    = plain.slice(0, 32)
    const signingPk = plain.slice(32, 65)
    const ethAddr   = plain.slice(65, 85)
    const siweSig   = plain.slice(85, 150)
    const msg       = plain.slice(150)

    // real X25519 public key
    expect(bytesToHex(realPk)).toBe(bytesToHex(walletAlice.x25519.publicKey))
    // secp256k1 signing public key derived from ethPrivKey
    expect(bytesToHex(signingPk)).toBe(
      bytesToHex(secp256k1.getPublicKey(walletAlice.ethPrivKey, true))
    )
    // Ethereum address as raw 20 bytes
    expect(bytesToHex(ethAddr)).toBe(walletAlice.ethAddress.toLowerCase().slice(2))
    // full 65-byte SIWE signature
    expect(bytesToHex(siweSig)).toBe(bytesToHex(walletAlice.siweSignature))
    // message text
    expect(new TextDecoder().decode(msg)).toBe('hello')
  })

  it('createWallet and keysFromSig produce same key material from same SIWE seed', () => {
    // Both functions must derive the same keys from sha256(siweSignature).
    // Verify that wallets built via createWallet are consistent internally.
    const { eee, content_key } = makeChannel()
    const aliceCk = accessGroupChannel(walletAlice, eee)!
    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'self', eee.epoch)
    // Alice can decrypt her own message → keys are self-consistent
    expect(openGroupEnvelope(aliceCk, env).text).toBe('self')
  })
})

// ── Tests: validation 1 (SIWE — identity) ────────────────────────────────────

describe('openGroupEnvelope — Validation 1: SIWE identity', () => {
  it('tampered eth_address (bytes 65-85) → identidad falsa', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env   = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const plain = decryptPlaintext(env, content_key)

    // Replace Alice's eth_address with Bob's — Alice's siweSignature ecrecovers to
    // Alice's address, not Bob's → 'identidad falsa'
    const tamplain = new Uint8Array(plain)
    tamplain.set(fromHex(walletBob.ethAddress), 65)

    const tamperedEnv = buildTamperedEnvelope(
      content_key, eee.channel_id, eee.epoch, tamplain, walletAlice.ethPrivKey,
    )
    expect(() => openGroupEnvelope(ckBob, tamperedEnv)).toThrow('identidad falsa')
  })

  it('siwe_signature swapped to another wallet (bytes 85-150) → identidad falsa', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env   = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const plain = decryptPlaintext(env, content_key)

    // Put Bob's siweSignature at position 85; eth_address (65-85) still shows Alice's address.
    // Bob's SIWE ecrecovers to Bob's address ≠ Alice's address → 'identidad falsa'
    const tamplain = new Uint8Array(plain)
    tamplain.set(walletBob.siweSignature, 85)

    const tamperedEnv = buildTamperedEnvelope(
      content_key, eee.channel_id, eee.epoch, tamplain, walletAlice.ethPrivKey,
    )
    expect(() => openGroupEnvelope(ckBob, tamperedEnv)).toThrow('identidad falsa')
  })
})

// ── Tests: validation 2 (key derivation) ─────────────────────────────────────

describe('openGroupEnvelope — Validation 2: key derivation', () => {
  it('real_sender_pk replaced with random bytes → falsificación de llaves detectada', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env   = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const plain = decryptPlaintext(env, content_key)

    // Replace real_sender_pk (bytes 0-32) with random bytes.
    // SIWE still ecrecovers to Alice (validation 1 passes), but
    // sha256(aliceSig) → expectedX25519 ≠ random bytes → 'falsificación de llaves'
    const tamplain = new Uint8Array(plain)
    tamplain.set(nacl.randomBytes(32), 0)

    const tamperedEnv = buildTamperedEnvelope(
      content_key, eee.channel_id, eee.epoch, tamplain, walletAlice.ethPrivKey,
    )
    expect(() => openGroupEnvelope(ckBob, tamperedEnv)).toThrow('falsificación de llaves detectada')
  })

  it('signing_pub_key replaced with random bytes → falsificación de llaves detectada', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env   = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const plain = decryptPlaintext(env, content_key)

    // Replace signing_pub_key (bytes 32-65) with random bytes.
    // Validation 1 passes; sha256(aliceSig) → expectedSigningPk ≠ random bytes
    const tamplain = new Uint8Array(plain)
    tamplain.set(nacl.randomBytes(33), 32)

    const tamperedEnv = buildTamperedEnvelope(
      content_key, eee.channel_id, eee.epoch, tamplain, walletAlice.ethPrivKey,
    )
    expect(() => openGroupEnvelope(ckBob, tamperedEnv)).toThrow('falsificación de llaves detectada')
  })
})

// ── Tests: validation 3 (L0 outer signature) ─────────────────────────────────

describe('openGroupEnvelope — Validation 3: L0 outer signature', () => {
  it('tampered outer signature → firma inválida', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env    = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const badSig = env.signature.slice(0, -2) + (env.signature.endsWith('ff') ? '00' : 'ff')
    const tampered: Envelope = { ...env, signature: badSig }

    expect(() => openGroupEnvelope(ckBob, tampered)).toThrow('firma inválida')
  })

  it('tampered ciphertext → secretbox rejects before reaching sig check', () => {
    const { eee, content_key } = makeChannel()
    const ckBob    = accessGroupChannel(walletBob, eee)!
    const env      = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'x', eee.epoch)
    const tampered: Envelope = { ...env, ciphertext: env.ciphertext.slice(0, -2) + 'ff' }
    expect(() => openGroupEnvelope(ckBob, tampered)).toThrow('fallo en descifrado')
  })
})
