/**
 * L1Messenger — Whispery Level 1 transport layer over Waku.
 *
 * Routing strategy: neighborhood topics
 *   Each node subscribes to one content topic derived from its own pubkey:
 *     /whispery/1/neighbor-0x{first2bytes}/proto
 *   This partitions the network into 65536 neighborhoods. A sender publishes
 *   to the recipient's neighborhood topic, not their own.
 *
 * Message flow (publish):
 *   1. Compute recipient's neighborhood topic from targetPubKey[0:2]
 *   2. Derive mac_hint = HMAC-SHA256(targetPubKey, "SWARM_L1_HINT")[0:8]
 *   3. ECIES-encrypt plaintext for targetPubKey
 *   4. Encode Envelope { mac_hint, data } as protobuf
 *   5. lightPush to Waku
 *
 * Message flow (subscribe):
 *   1. Subscribe to own neighborhood topic
 *   2. On each message: decode Envelope
 *   3. CRITICAL FILTER: compare mac_hint with own hint — discard if no match
 *      (log "Ignored by hint"). Avoids ECIES decryption for ~99.99 % of msgs.
 *   4. eciesDecrypt(ownSecretKey, data)
 *   5. Emit 'message' event with decrypted text
 *
 * Dependencies: @waku/sdk (install separately — not bundled by default)
 */

import { createEncoder, createDecoder } from '@waku/sdk'
import type { LightNode } from '@waku/sdk'
import { StaticShardingRoutingInfo } from '@waku/utils'
import nacl from 'tweetnacl'
import { bytesToHex } from '@noble/hashes/utils'
import { encode as encodeEnvelope, decode as decodeEnvelope } from './proto/envelope'
import { macHint as computeHint } from './crypto/hints'
import { eciesEncrypt, eciesDecrypt } from './crypto/ecies'

// Waku Network: cluster 1, all 8 shards (matches defaultBootstrap: true).
// We pin to shard 0 for all Whispery content — the mac_hint + content topic
// routing handles application-level delivery within the shard.
const NETWORK_CONFIG = { clusterId: 1, shards: [0, 1, 2, 3, 4, 5, 6, 7] } as const
const ROUTING_INFO   = StaticShardingRoutingInfo.fromShard(0, NETWORK_CONFIG)

// ── Content topic helpers ─────────────────────────────────────────────────────

const APP = '/whispery/1'

/**
 * Returns the Waku content topic for the neighborhood of a given pubKey.
 * Two nodes end up in the same neighborhood when their pubKey shares the
 * same first 2 bytes — probability ~1/65536 for random keys.
 */
export function neighborhoodTopic(pubKey: Uint8Array): string {
  return `${APP}/neighbor-0x${bytesToHex(pubKey.slice(0, 2))}/proto`
}

// ── L1Messenger ───────────────────────────────────────────────────────────────

export interface MessageEvent extends Event {
  text: string
}

export class L1Messenger extends EventTarget {
  /** Own X25519 public key (33 bytes, derived from secretKey). */
  readonly pubKey: Uint8Array

  private readonly myHint: Uint8Array
  private readonly myTopic: string

  /**
   * @param node       A connected Waku LightNode (createLightNode + waitForRemotePeer).
   * @param secretKey  Own X25519 secret key (32 bytes) — same as Wallet.x25519.secretKey.
   */
  constructor(
    private readonly node: LightNode,
    private readonly secretKey: Uint8Array,
  ) {
    super()
    this.pubKey   = nacl.box.keyPair.fromSecretKey(secretKey).publicKey
    this.myHint   = computeHint(this.pubKey)
    this.myTopic  = neighborhoodTopic(this.pubKey)
  }

  /**
   * Encrypt and publish a message to a recipient identified by their X25519 pubKey.
   * Publishes to the recipient's neighborhood topic (not the sender's).
   */
  async publish(targetPubKey: Uint8Array, message: string): Promise<void> {
    const topic   = neighborhoodTopic(targetPubKey)
    const encoder = createEncoder({ contentTopic: topic, routingInfo: ROUTING_INFO })
    const hint    = computeHint(targetPubKey)
    const data    = eciesEncrypt(targetPubKey, new TextEncoder().encode(message))
    const payload = encodeEnvelope({ macHint: hint, data })

    const result = await this.node.lightPush.send(encoder, { payload })
    if (result.failures?.length) {
      throw new Error(`Waku push failed: ${result.failures.map(f => f.error).join(', ')}`)
    }
  }

  /**
   * Subscribe to own neighborhood topic.
   * Emits a 'message' CustomEvent with a `text` property for each decryptable message.
   *
   * Usage:
   *   messenger.addEventListener('message', (e) => console.log((e as MessageEvent).text))
   *   await messenger.subscribe()
   */
  async subscribe(): Promise<void> {
    const decoder = createDecoder(this.myTopic, ROUTING_INFO)

    await this.node.filter.subscribe([decoder], (msg) => {
      if (!msg.payload) return

      // Decode protobuf
      let env
      try {
        env = decodeEnvelope(msg.payload)
      } catch {
        return // malformed — ignore
      }

      // ── CRITICAL FILTER ───────────────────────────────────────────────────
      // Check hint before attempting decryption. This is the key performance
      // optimisation: most messages in the neighborhood are for other peers.
      if (!constantTimeEqual(env.macHint, this.myHint)) {
        console.debug('[L1] Ignored by hint')
        return
      }

      // Attempt decryption
      try {
        const plain = eciesDecrypt(this.secretKey, env.data)
        const text  = new TextDecoder().decode(plain)
        const event = new CustomEvent('message', { detail: { text } })
        this.dispatchEvent(event)
      } catch {
        console.debug('[L1] Decryption failed — hint collision or tampered payload')
      }
    })
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Constant-time equality check — prevents timing attacks on hint comparison.
 * The hint is not a secret, but this is good practice for any security-adjacent comparison.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
