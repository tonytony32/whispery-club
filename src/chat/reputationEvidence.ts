/**
 * reputationEvidence — builds a cryptographic evidence payload from channel
 * messages to attach to an ERC-8004 reputation feedback submission.
 *
 * Uses outer envelope fields only (version, channel_id, epoch, sender_pk,
 * mac_hint, timestamp) — ciphertext is excluded so message content stays private.
 * Each entry's keccak256 hash + secp256k1 outer signature proves a channel
 * member signed that message without revealing who said what.
 */

import { keccak_256 }  from '@noble/hashes/sha3'
import { bytesToHex }  from '@noble/hashes/utils'
import type { Envelope } from '../core/crypto'

export type EvidencePayload = {
  protocol:        'whispery-evidence-v1'
  channelId:       string
  epoch:           number
  agentAddress:    string
  humanAddress:    string
  envelopeHashes:  string[]   // keccak256 of sorted outer fields (no ciphertext)
  outerSignatures: string[]   // secp256k1 sig from each envelope
  timestampRange:  { from: number; to: number }
  generatedAt:     number
}

/**
 * Build evidence from a set of envelopes.
 *
 * Selects the last 20 envelopes. The goal is to prove that a bidirectional
 * conversation took place, without revealing any message content.
 */
export function buildEvidence(
  envelopes: Envelope[],
  agentAddress: string,
  humanAddress: string,
  channelId: string,
  epoch: number,
): EvidencePayload {
  const selected = envelopes.slice(-20)

  const envelopeHashes:  string[] = []
  const outerSignatures: string[] = []

  for (const env of selected) {
    // Only outer fields — ciphertext excluded to preserve message privacy
    const outer = {
      channel_id: env.channel_id,
      epoch:      env.epoch,
      mac_hint:   env.mac_hint,
      sender_pk:  env.sender_pk,
      timestamp:  env.timestamp,
      version:    env.version,
    }
    // Alphabetically sorted keys → deterministic canonical JSON
    const canonical = Object.fromEntries(
      Object.entries(outer).sort(([a], [b]) => a.localeCompare(b))
    )
    envelopeHashes.push(bytesToHex(keccak_256(JSON.stringify(canonical))))
    outerSignatures.push(env.signature)
  }

  const ts = selected.map(e => e.timestamp)

  return {
    protocol:       'whispery-evidence-v1',
    channelId,
    epoch,
    agentAddress,
    humanAddress,
    envelopeHashes,
    outerSignatures,
    timestampRange: {
      from: ts.length ? Math.min(...ts) : 0,
      to:   ts.length ? Math.max(...ts) : 0,
    },
    generatedAt: Date.now(),
  }
}
