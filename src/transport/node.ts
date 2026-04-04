import { createLightNode, Protocols } from '@waku/sdk'
import type { LightNode } from '@waku/sdk'

export type NodeStatus = 'idle' | 'connecting' | 'connected' | 'error'

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
    node = await createLightNode({ defaultBootstrap: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.('error', msg)
    onLog?.(`Failed to create node: ${msg}`)
    throw err
  }

  // Peer event logging
  node.libp2p.addEventListener('peer:connect', (evt: Event) => {
    const id = ((evt as CustomEvent).detail?.toString() ?? 'unknown').slice(0, 22)
    onLog?.(`peer:connect  ${id}…`)
  })
  node.libp2p.addEventListener('peer:disconnect', (evt: Event) => {
    const id = ((evt as CustomEvent).detail?.toString() ?? 'unknown').slice(0, 22)
    onLog?.(`peer:disconnect ${id}…`)
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
