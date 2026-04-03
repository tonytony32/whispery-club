/**
 * useMessenger — React hook que conecta wagmi + SIWE + Waku + L1Messenger.
 *
 * Identidad:
 *   No necesitamos la clave privada del usuario. Le pedimos a MetaMask que
 *   firme un mensaje SIWE determinista. La firma → sha256 → seed X25519.
 *   Siempre que el usuario use la misma wallet, obtendrá el mismo keypair.
 *
 * Flujo:
 *   1. connect()  → solicita firma SIWE a MetaMask
 *   2. Firma recibida → derivar X25519 → createWakuNode → subscribe
 *   3. Listo para enviar y recibir
 */

import { useState, useEffect, useRef } from 'react'
import { useSignMessage } from 'wagmi'
import type { LightNode } from '@waku/sdk'
import { siweMessage, keysFromSig } from '../core/crypto'
import type { Wallet } from '../core/crypto'
import { createWakuNode, type NodeStatus } from './node'
import { L1Messenger } from './messenger'
import nacl from 'tweetnacl'

export interface ChatMessage {
  text: string
  direction: 'in' | 'out'
  at: number
}

export interface UseMessengerResult {
  status: NodeStatus
  /** 'signing' while waiting for MetaMask signature. */
  signing: boolean
  /** Own X25519 pubkey once derived, null before signing. */
  myPubKey: Uint8Array | null
  messages: ChatMessage[]
  /** Trigger SIWE sign → Waku connect. No-op if already active. */
  connect: () => void
  send: (targetPubKey: Uint8Array, text: string) => Promise<void>
  signError: string | null
}

export function useMessenger(ethAddress: string | undefined): UseMessengerResult {
  const [status, setStatus]     = useState<NodeStatus>('idle')
  const [signing, setSigning]   = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [myPubKey, setMyPubKey] = useState<Uint8Array | null>(null)
  const walletRef = useRef<Wallet | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const nodeRef      = useRef<LightNode | null>(null)
  const messengerRef = useRef<L1Messenger | null>(null)
  const x25519Ref    = useRef<nacl.BoxKeyPair | null>(null)

  const { signMessageAsync } = useSignMessage()

  // Cleanup on unmount
  useEffect(() => {
    return () => { nodeRef.current?.stop() }
  }, [])

  async function connect() {
    if (!ethAddress) return
    if (status === 'connecting' || status === 'connected') return

    setSigning(true)
    setSignError(null)

    let wallet: Wallet
    try {
      // Ask MetaMask to sign the deterministic SIWE message
      const sig = await signMessageAsync({ message: siweMessage(ethAddress) })
      wallet = keysFromSig(sig, ethAddress)
      walletRef.current = wallet
      x25519Ref.current = wallet.x25519
      setMyPubKey(wallet.x25519.publicKey)
    } catch (e) {
      setSigning(false)
      setSignError(e instanceof Error ? e.message : 'Signature rejected')
      return
    }

    setSigning(false)

    // Connect to Waku
    try {
      const node = await createWakuNode({
        onStatus: (s, detail) => {
          setStatus(s)
          if (detail) console.warn('[Waku]', detail)
        },
      })

      nodeRef.current = node
      const messenger = new L1Messenger(node, wallet)
      messengerRef.current = messenger

      await messenger.subscribe()
      messenger.addEventListener('message', (e) => {
        const { text } = (e as CustomEvent<{ text: string }>).detail
        setMessages(prev => [...prev, { text, direction: 'in', at: Date.now() }])
      })
    } catch {
      setStatus('error')
    }
  }

  async function send(targetPubKey: Uint8Array, text: string) {
    if (!messengerRef.current) throw new Error('Not connected')
    await messengerRef.current.publish(targetPubKey, text)
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return { status, signing, myPubKey, messages, connect, send, signError }
}
