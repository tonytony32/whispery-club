/**
 * Unit tests for L0 sender verification in openGroupEnvelope.
 *
 * The signature field in the Envelope covers all fields except itself (canonical JSON,
 * keys sorted alphabetically). It is signed with the sender's secp256k1 derived signing key.
 *
 * These tests confirm:
 *   - Valid signature + registered sender → message decrypts fine
 *   - Invalid signature (tampered payload) → throws
 *   - Unknown sender (not in registry) → throws
 *   - No registry provided → decrypts without signature check (backward compat)
 */

import { describe, it, expect } from 'vitest'
import { bytesToHex } from '@noble/hashes/utils'
import {
  createWallet,
  createGroupChannel,
  accessGroupChannel,
  openGroupEnvelope,
  createGroupEnvelope,
  buildKeyRegistry,
  DEMO_PRIVATE_KEYS,
  type Envelope,
} from '../crypto'

// ── Fixture wallets ───────────────────────────────────────────────────────────

const walletAlice   = createWallet(DEMO_PRIVATE_KEYS.A, 'Alice')
const walletBob     = createWallet(DEMO_PRIVATE_KEYS.B, 'Bob')
const walletCharlie = createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie')
const walletEve     = createWallet(DEMO_PRIVATE_KEYS.D, 'Eve')  // not a member

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChannel() {
  return createGroupChannel(walletAlice, [walletAlice, walletBob, walletCharlie], 'TEST', 0)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openGroupEnvelope — sender verification', () => {
  it('valid signature + known sender → decrypts correctly', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola grupo', eee.epoch)

    const registry = buildKeyRegistry([walletAlice, walletBob, walletCharlie])
    const text = openGroupEnvelope(ckBob, env, registry)

    expect(text).toBe('hola grupo')
  })

  it('tampered ciphertext → decryption fails regardless of registry', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola grupo', eee.epoch)
    const tampered: Envelope = { ...env, ciphertext: env.ciphertext.replace(/.$/, 'f') }

    // Without registry — secretbox rejects
    expect(() => openGroupEnvelope(ckBob, tampered)).toThrow('fallo en descifrado')
  })

  it('tampered signature → throws before decryption', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'hola grupo', eee.epoch)
    // Flip one byte in the signature
    const badSig = env.signature.slice(0, -2) + (env.signature.endsWith('ff') ? '00' : 'ff')
    const tampered: Envelope = { ...env, signature: badSig }

    const registry = buildKeyRegistry([walletAlice, walletBob, walletCharlie])
    expect(() => openGroupEnvelope(ckBob, tampered, registry)).toThrow('firma inválida')
  })

  it('unknown sender (not in registry) → throws', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    // Eve crafts an envelope with her own wallet
    const env = createGroupEnvelope(walletEve, content_key, eee.channel_id, 'impersonate', eee.epoch)

    // Registry does not include Eve
    const registry = buildKeyRegistry([walletAlice, walletBob, walletCharlie])
    expect(() => openGroupEnvelope(ckBob, env, registry)).toThrow('no está en el key registry')
  })

  it('no registry → decrypts without signature check (backward compat)', () => {
    const { eee, content_key } = makeChannel()
    const ckBob = accessGroupChannel(walletBob, eee)!

    const env = createGroupEnvelope(walletAlice, content_key, eee.channel_id, 'sin verificar', eee.epoch)
    const text = openGroupEnvelope(ckBob, env)

    expect(text).toBe('sin verificar')
  })

  it('buildKeyRegistry maps each wallet x25519 pubKey to its signing pubKey', () => {
    const registry = buildKeyRegistry([walletAlice, walletBob])

    expect(registry.has(bytesToHex(walletAlice.x25519.publicKey))).toBe(true)
    expect(registry.has(bytesToHex(walletBob.x25519.publicKey))).toBe(true)
    expect(registry.size).toBe(2)
  })
})
