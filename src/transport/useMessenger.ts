/**
 * useMessenger — React hook that wires together the Waku node,
 * L1Messenger, and the connected Ethereum wallet.
 *
 * Identity: derives the X25519 keypair from the connected address
 * by matching it against the known DEMO wallets (Alice/Bob/Charlie).
 * Returns null if the connected address is not a recognised member.
 *
 * Lifecycle:
 *   idle       → user clicks "Connect to Waku"
 *   connecting → createWakuNode() in progress (may take 5-30 s)
 *   connected  → ready to send and receive
 *   error      → connection failed
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import type { LightNode } from '@waku/sdk'
import { createWallet, DEMO_PRIVATE_KEYS } from '../core/crypto'
import type { Wallet } from '../core/crypto'
import { createWakuNode, type NodeStatus } from './node'
import { L1Messenger } from './messenger'

export interface ChatMessage {
  text: string
  direction: 'in' | 'out'
  at: number
}

export interface UseMessengerResult {
  /** Wallet identity derived from the connected address, or null if unknown. */
  wallet: Wallet | null
  status: NodeStatus
  messages: ChatMessage[]
  /** Start connecting to Waku. No-op if already connecting or connected. */
  connect: () => void
  /** Send a plaintext message to a recipient identified by their X25519 pubkey. */
  send: (targetPubKey: Uint8Array, text: string) => Promise<void>
}

// Pre-build the demo wallet list once
const DEMO_WALLETS: Wallet[] = [
  createWallet(DEMO_PRIVATE_KEYS.A, 'Alice'),
  createWallet(DEMO_PRIVATE_KEYS.B, 'Bob'),
  createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie'),
]

export function useMessenger(ethAddress: string | undefined): UseMessengerResult {
  const [status, setStatus]   = useState<NodeStatus>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [trigger, setTrigger] = useState(0) // incremented by connect()

  const nodeRef      = useRef<LightNode | null>(null)
  const messengerRef = useRef<L1Messenger | null>(null)

  // Match connected address to a demo wallet
  const wallet = useMemo<Wallet | null>(() => {
    if (!ethAddress) return null
    return DEMO_WALLETS.find(
      w => w.ethAddress.toLowerCase() === ethAddress.toLowerCase()
    ) ?? null
  }, [ethAddress])

  // Connect to Waku when triggered
  useEffect(() => {
    if (trigger === 0 || !wallet || status === 'connecting' || status === 'connected') return

    const w = wallet // capture for async closure
    let cancelled = false

    async function init() {
      try {
        const node = await createWakuNode({
          onStatus: (s, detail) => {
            if (!cancelled) {
              setStatus(s)
              if (detail) console.warn('[Waku]', detail)
            }
          },
        })
        if (cancelled) { await node.stop(); return }

        nodeRef.current = node
        const messenger = new L1Messenger(node, w.x25519.secretKey)
        messengerRef.current = messenger

        await messenger.subscribe()
        messenger.addEventListener('message', (e) => {
          if (cancelled) return
          const { text } = (e as CustomEvent<{ text: string }>).detail
          setMessages(prev => [...prev, { text, direction: 'in', at: Date.now() }])
        })
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    init()
    return () => {
      cancelled = true
      nodeRef.current?.stop()
      nodeRef.current = null
      messengerRef.current = null
    }
  }, [trigger, wallet]) // eslint-disable-line react-hooks/exhaustive-deps

  function connect() {
    if (status === 'connecting' || status === 'connected') return
    setStatus('idle')
    setTrigger(t => t + 1)
  }

  async function send(targetPubKey: Uint8Array, text: string) {
    if (!messengerRef.current) throw new Error('Not connected')
    await messengerRef.current.publish(targetPubKey, text)
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return { wallet, status, messages, connect, send }
}
