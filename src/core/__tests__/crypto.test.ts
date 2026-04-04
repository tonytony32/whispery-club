/**
 * Unit tests for L0 in-band sender verification in openGroupEnvelope.
 *
 * In-band design: createGroupEnvelope embeds the sender's secp256k1 signing
 * public key (33 bytes, compressed) as a prefix inside the ciphertext:
 *
 *   plaintext = signingPubKey[33] || message_utf8
 *
 * openGroupEnvelope:
 *   1. Decrypts with content_key (secretbox — Poly1305 rejects any tampering)
 *   2. Extracts signingPubKey from the first 33 bytes
 *   3. Verifies the outer signature (layer 5) against sha256(canonical_envelope)
 *   4. Throws "firma inválida" on any failure — no silent degradation
 */

import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'
import {
  createWallet,
  createGroupChannel,
  accessGroupChannel,
  openGroupEnvelope,
  createGroupEnvelope,
  fromHex,
  DEMO_PRIVATE_KEYS,
  type Envelope,
} from '../crypto'

// ── Fixture wallets ───────────────────────────────────────────────────────────

const walletAlice   = createWallet(DEMO_PRIVATE_KEYS.A, 'Alice')
const walletBob     = createWallet(DEMO_PRIVATE_KEYS.B, 'Bob')
const walletCharlie = createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChannel() {
  return createGroupChannel(walletAlice, [walletAlice, walletBob, walletCharlie], 'TEST', 0)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openGroupEnvelope — in-band sender verification', () => {
  it('valid envelope → decrypts and verifies signature', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env  = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola grupo', eee.epoch)
    const text = openGroupEnvelope(ckBob, env)

    expect(text).toBe('hola grupo')
  })

  it('all three members decrypt the same envelope', () => {
    const { eee, content_key } = makeChannel()
    const ckAlice   = accessGroupChannel(walletAlice, eee)!
    const ckBob     = accessGroupChannel(walletBob, eee)!
    const ckCharlie = accessGroupChannel(walletCharlie, eee)!

    const env = createGroupEnvelope(walletBob, content_key, eee.channel_id, 'broadcast', eee.epoch)

    expect(openGroupEnvelope(ckAlice, env)).toBe('broadcast')
    expect(openGroupEnvelope(ckBob, env)).toBe('broadcast')
    expect(openGroupEnvelope(ckCharlie, env)).toBe('broadcast')
  })

  it('tampered ciphertext → secretbox rejects before signature check', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env      = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola', eee.epoch)
    const tampered: Envelope = { ...env, ciphertext: env.ciphertext.slice(0, -2) + 'ff' }

    expect(() => openGroupEnvelope(ckBob, tampered)).toThrow('fallo en descifrado')
  })

  it('tampered outer signature → throws firma inválida', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env    = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola', eee.epoch)
    const badSig = env.signature.slice(0, -2) + (env.signature.endsWith('ff') ? '00' : 'ff')
    const tampered: Envelope = { ...env, signature: badSig }

    expect(() => openGroupEnvelope(ckBob, tampered)).toThrow('firma inválida')
  })

  it('envelope with wrong content_key → secretbox rejects', () => {
    const { eee, content_key } = makeChannel()
    // Create a second channel with a different content_key
    const { content_key: otherKey } = makeChannel()

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola', eee.epoch)
    expect(() => openGroupEnvelope(otherKey, env)).toThrow('fallo en descifrado')
  })

  it('signing key inside ciphertext matches sender ethPrivKey', () => {
    const { eee, content_key } = makeChannel()
    const expectedSigningPk = bytesToHex(secp256k1.getPublicKey(walletAlice.ethPrivKey, true))

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'verify', eee.epoch)

    // Decrypt manually and inspect the 33-byte prefix
    const raw   = fromHex(env.ciphertext)
    const nonce = raw.slice(0, 24)
    const box   = raw.slice(24)
    const plain = nacl.secretbox.open(box, nonce, content_key)!
    const extractedSpk = bytesToHex(plain.slice(0, 33))

    expect(extractedSpk).toBe(expectedSigningPk)
  })
})
