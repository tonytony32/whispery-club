/**
 * Waku node initialisation for browser (LightNode over WebSocket).
 *
 * A LightNode uses three protocols:
 *   - LightPush  — send messages without relaying (low bandwidth)
 *   - Filter     — receive only messages matching subscribed content topics
 *   - Store      — fetch missed messages (not used in L1 yet)
 *
 * Bootstrap: `defaultBootstrap: true` connects to The Waku Network
 * (cluster 1, shards 0-7) via DNS discovery + peer exchange.
 * No manual peer list needed.
 */

import { createLightNode, Protocols } from '@waku/sdk'
import type { LightNode } from '@waku/sdk'

export type NodeStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface WakuNodeOptions {
  /** Called whenever the connection status changes. */
  onStatus?: (status: NodeStatus, detail?: string) => void
}

/**
 * Create, start and connect a Waku LightNode.
 * Resolves once the node has at least one peer capable of
 * LightPush + Filter — i.e. the node is ready to send and receive.
 *
 * @example
 * const node = await createWakuNode({ onStatus: (s) => console.log(s) })
 * const messenger = new L1Messenger(node, wallet.x25519.secretKey)
 */
export async function createWakuNode(options: WakuNodeOptions = {}): Promise<LightNode> {
  const { onStatus } = options

  onStatus?.('connecting')

  let node: LightNode
  try {
    node = await createLightNode({ defaultBootstrap: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.('error', `Failed to create node: ${msg}`)
    throw err
  }

  try {
    await node.waitForPeers([Protocols.LightPush, Protocols.Filter])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.('error', `Failed to connect to peer: ${msg}`)
    await node.stop()
    throw err
  }

  onStatus?.('connected')
  return node
}
