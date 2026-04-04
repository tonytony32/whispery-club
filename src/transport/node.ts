import { createLightNode, Protocols } from '@waku/sdk'
import type { LightNode } from '@waku/sdk'

export type NodeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

const PEER_TIMEOUT_MS = 45_000

export interface WakuNodeOptions {
  onStatus?: (status: NodeStatus, detail?: string) => void
  onLog?:    (msg: string) => void
}

export async function createWakuNode(options: WakuNodeOptions = {}): Promise<LightNode> {
  const { onStatus, onLog } = options

  onStatus?.('connecting')
  onLog?.('Creating Waku LightNode (defaultBootstrap)…')

  let node: LightNode
  try {
    node = await createLightNode({
      defaultBootstrap: true,
      // Use 3 peers per protocol so losing one doesn't immediately cause
      // NO_PEER_AVAILABLE — the other two remain as fallback.
      numPeersToUse: 3,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.('error', msg)
    onLog?.(`Failed to create node: ${msg}`)
    throw err
  }

  // Peer event logging + disconnected status
  let peerCount = 0
  node.libp2p.addEventListener('peer:connect', (evt: Event) => {
    peerCount++
    const id = ((evt as CustomEvent).detail?.toString() ?? '?').slice(0, 22)
    onLog?.(`peer:connect  ${id}… (${peerCount} total)`)
  })
  node.libp2p.addEventListener('peer:disconnect', (evt: Event) => {
    peerCount = Math.max(0, peerCount - 1)
    const id = ((evt as CustomEvent).detail?.toString() ?? '?').slice(0, 22)
    onLog?.(`peer:disconnect ${id}… (${peerCount} remaining)`)
    if (peerCount === 0) {
      onStatus?.('disconnected')
      onLog?.('All peers lost — node disconnected')
    }
  })

  onLog?.(`Waiting for peers with LightPush + Filter (timeout ${PEER_TIMEOUT_MS / 1000}s)…`)

  try {
    await Promise.race([
      node.waitForPeers([Protocols.LightPush, Protocols.Filter]),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Peer discovery timed out after ${PEER_TIMEOUT_MS / 1000}s`)),
          PEER_TIMEOUT_MS,
        )
      ),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.('error', msg)
    onLog?.(`waitForPeers failed: ${msg}`)
    await node.stop()
    throw err
  }

  onLog?.('Peers found — node ready')
  onStatus?.('connected')
  return node
}
