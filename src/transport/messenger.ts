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
import { AutoShardingRoutingInfo } from '@waku/utils'
import nacl from 'tweetnacl'
import { bytesToHex } from '@noble/hashes/utils'
import { encode as encodeEnvelope, decode as decodeEnvelope } from './proto/envelope'
import { macHint as computeHint, channelHint as computeChannelHint } from './crypto/hints'
import { eciesEncrypt, eciesDecrypt } from './crypto/ecies'
import {
  createP2PEnvelope, openP2PEnvelope,
  createGroupEnvelope, openGroupEnvelope,
  fromHex,
  type Wallet, type Envelope as L0Envelope,
} from '../core/crypto'

// Waku Network: cluster 1, 8 shards — matches DefaultNetworkConfig (AutoSharding).
// createLightNode({ defaultBootstrap: true }) uses AutoSharding; encoders must match
// or peerManager.getPeers filters to 0 peers → NO_PEER_AVAILABLE.
const NETWORK_CONFIG = { clusterId: 1, numShardsInCluster: 8 } as const

function routingFor(contentTopic: string) {
  return AutoShardingRoutingInfo.fromContentTopic(contentTopic, NETWORK_CONFIG)
}

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

/**
 * Returns the Waku content topic for a group channel.
 * Derived from the first 4 bytes (8 hex chars) of the channel_id.
 * All members of the same channel subscribe to the same topic.
 */
export function channelTopic(channelId: string): string {
  const clean = channelId.replace(/^0x/, '')
  return `${APP}/channel-0x${clean.slice(0, 8)}/proto`
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
    private readonly wallet: Wallet,
  ) {
    super()
    this.pubKey   = wallet.x25519.publicKey
    this.myHint   = computeHint(this.pubKey)
    this.myTopic  = neighborhoodTopic(this.pubKey)
  }

  /**
   * Encrypt and publish a message to a recipient identified by their X25519 pubKey.
   * Publishes to the recipient's neighborhood topic (not the sender's).
   */
  async publish(targetPubKey: Uint8Array, message: string): Promise<void> {
    const topic   = neighborhoodTopic(targetPubKey)
    const encoder = createEncoder({ contentTopic: topic, routingInfo: routingFor(topic) })
    const hint    = computeHint(targetPubKey)

    // Build a signed L0 Envelope — sender identity + timestamp + secp256k1 signature
    const l0 = createP2PEnvelope(this.wallet, targetPubKey, message)

    // ECIES-encrypt the serialized L0 Envelope for the recipient
    const data    = eciesEncrypt(targetPubKey, new TextEncoder().encode(JSON.stringify(l0)))
    const payload = encodeEnvelope({ macHint: hint, data })

    await this.sendWithRetry(encoder, payload)
  }

  /**
   * Encrypt and publish a group message to all members sharing the same channel.
   * Uses the shared content_key (from EEE) — no outer ECIES wrapping.
   * The mac_hint is derived from channel_id bytes so all members can filter efficiently.
   */
  async publishGroup(
    contentKey: Uint8Array,
    channelId: string,
    epoch: number,
    message: string,
  ): Promise<void> {
    const topic    = channelTopic(channelId)
    const encoder  = createEncoder({ contentTopic: topic, routingInfo: routingFor(topic) })
    const hint     = computeChannelHint(fromHex(channelId))
    const l0       = createGroupEnvelope(this.wallet, contentKey, channelId, message, epoch)
    const data     = new TextEncoder().encode(JSON.stringify(l0))
    const payload  = encodeEnvelope({ macHint: hint, data })

    await this.sendWithRetry(encoder, payload)
  }

  /**
   * Subscribe to a group channel topic.
   * Emits 'message' CustomEvents for each message decryptable with content_key.
   * The hint filter discards messages from other channels that share the same topic prefix.
   */
  async subscribeGroup(channelId: string, contentKey: Uint8Array): Promise<void> {
    const topic    = channelTopic(channelId)
    const decoder  = createDecoder(topic, routingFor(topic))
    const myHint   = computeChannelHint(fromHex(channelId))

    // Dedup: the first 48 hex chars of ciphertext = 24-byte random nonce,
    // cryptographically unique per message. Each relay peer may deliver the
    // same message, so we discard any ciphertext we've already processed.
    const seen = new Set<string>()
    const MAX_SEEN = 500

    await this.node.filter.subscribe([decoder], (msg) => {
      if (!msg.payload) return

      let env
      try {
        env = decodeEnvelope(msg.payload)
      } catch {
        return
      }

      if (!constantTimeEqual(env.macHint, myHint)) {
        console.debug('[L1] Group: Ignored by channel hint')
        return
      }

      try {
        const l0: L0Envelope = JSON.parse(new TextDecoder().decode(env.data))

        // Deduplicate by nonce (first 24 bytes of ciphertext = 48 hex chars)
        const msgId = l0.ciphertext.slice(0, 48)
        if (seen.has(msgId)) {
          console.debug('[L1] Group: Duplicate — discarded')
          return
        }
        seen.add(msgId)
        if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value!)

        const { text, realSenderPk } = openGroupEnvelope(contentKey, l0)

        // Filter out own messages — already shown as 'out' when sent
        if (bytesToHex(realSenderPk) === bytesToHex(this.pubKey)) return

        const event = new CustomEvent('message', {
          detail: { text, senderPk: l0.sender_pk, timestamp: l0.timestamp },
        })
        this.dispatchEvent(event)
      } catch {
        console.debug('[L1] Group: Decryption failed — wrong content_key or tampered payload')
      }
    })
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
    const decoder = createDecoder(this.myTopic, routingFor(this.myTopic))

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

      // Attempt decryption + L0 deserialization
      try {
        const plain = eciesDecrypt(this.wallet.x25519.secretKey, env.data)
        const l0: L0Envelope = JSON.parse(new TextDecoder().decode(plain))

        // Verify and open the L0 envelope — recovers plaintext using our X25519 key
        const senderPk = Uint8Array.from(Buffer.from(l0.sender_pk, 'hex'))
        const text = openP2PEnvelope(this.wallet, senderPk, l0)

        const event = new CustomEvent('message', {
          detail: { text, senderPk: l0.sender_pk, timestamp: l0.timestamp },
        })
        this.dispatchEvent(event)
      } catch {
        console.debug('[L1] Decryption failed — hint collision or tampered payload')
      }
    })
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * lightPush with exponential-backoff retry.
   * Waku peers occasionally disconnect right after waitForPeers resolves.
   * Three attempts (500 ms → 1 s → 2 s) cover transient peer churn.
   */
  private async sendWithRetry(
    encoder: ReturnType<typeof createEncoder>,
    payload: Uint8Array,
  ): Promise<void> {
    const delays = [500, 1000, 2000]
    let lastError = 'unknown'
    for (let i = 0; i <= delays.length; i++) {
      const result = await this.node.lightPush.send(encoder, { payload })
      if (!result.failures?.length) return
      lastError = result.failures.map(f => f.error).join(', ')
      if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]))
    }
    throw new Error(`Waku push failed: ${lastError}`)
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
