/**
 * mac_hint — fast routing filter for Waku neighborhood traffic.
 *
 * A node subscribes to a neighborhood topic shared by ~1/65536 of all peers.
 * Before spending CPU on ECIES decryption, it checks the 8-byte hint:
 * if it doesn't match, the message is for someone else in the same neighborhood.
 *
 * Security note: the hint is NOT a MAC — it provides no authentication.
 * Authentication is guaranteed by Poly1305 inside nacl.box (ECIES layer).
 * The hint is purely a performance optimisation.
 */

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'

const DOMAIN = /* @__PURE__ */ new TextEncoder().encode('SWARM_L1_HINT')

/**
 * Derive the 8-byte hint for a given X25519 public key.
 * Deterministic: same pubKey → same hint, always.
 */
export function macHint(pubKey: Uint8Array): Uint8Array {
  return hmac(sha256, pubKey, DOMAIN).slice(0, 8)
}
