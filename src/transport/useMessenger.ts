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
 *   2. Firma recibida → derivar X25519 → fetch EEE de IPFS → accessGroupChannel
 *   3. createWakuNode → subscribeGroup(channelId, contentKey)
 *   4. Listo para enviar y recibir en el canal de grupo
 */

import { useState, useEffect, useRef } from 'react'
import { useSignMessage } from 'wagmi'
import type { LightNode } from '@waku/sdk'
import { siweMessage, keysFromSig, accessGroupChannel, type EEE } from '../core/crypto'
import type { Wallet } from '../core/crypto'
import { fetchJSON } from '../core/ipfs'
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
  /** Send a message to the group channel. */
  send: (text: string) => Promise<void>
  signError: string | null
}

export function useMessenger(
  ethAddress: string | undefined,
  eeePointer: string | undefined,
): UseMessengerResult {
  const [status, setStatus]       = useState<NodeStatus>('idle')
  const [signing, setSigning]     = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [myPubKey, setMyPubKey]   = useState<Uint8Array | null>(null)
  const [messages, setMessages]   = useState<ChatMessage[]>([])

  const nodeRef        = useRef<LightNode | null>(null)
  const messengerRef   = useRef<L1Messenger | null>(null)
  const walletRef      = useRef<Wallet | null>(null)
  const contentKeyRef  = useRef<Uint8Array | null>(null)
  const channelIdRef   = useRef<string | null>(null)
  const epochRef       = useRef<number>(0)
  const x25519Ref      = useRef<nacl.BoxKeyPair | null>(null)

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
      walletRef.current  = wallet
      x25519Ref.current  = wallet.x25519
      setMyPubKey(wallet.x25519.publicKey)
    } catch (e) {
      setSigning(false)
      setSignError(e instanceof Error ? e.message : 'Signature rejected')
      return
    }

    // Fetch EEE from IPFS and derive content_key
    if (eeePointer) {
      try {
        const eee = await fetchJSON<EEE>(eeePointer)
        const ck  = accessGroupChannel(wallet, eee)
        if (!ck) {
          setSigning(false)
          setSignError('Not authorized — this wallet is not in the channel ACT')
          return
        }
        contentKeyRef.current = ck
        channelIdRef.current  = eee.channel_id
        epochRef.current      = eee.epoch
      } catch (e) {
        setSigning(false)
        setSignError(`Failed to load EEE: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
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

      messenger.addEventListener('message', (e) => {
        const { text } = (e as CustomEvent<{ text: string }>).detail
        setMessages(prev => [...prev, { text, direction: 'in', at: Date.now() }])
      })

      if (contentKeyRef.current && channelIdRef.current) {
        await messenger.subscribeGroup(channelIdRef.current, contentKeyRef.current)
      } else {
        // Fallback to P2P subscription if no EEE
        await messenger.subscribe()
      }
    } catch {
      setStatus('error')
    }
  }

  async function send(text: string) {
    if (!messengerRef.current) throw new Error('Not connected')
    if (!contentKeyRef.current || !channelIdRef.current) {
      throw new Error('Group channel not initialized — EEE not loaded')
    }
    await messengerRef.current.publishGroup(
      contentKeyRef.current,
      channelIdRef.current,
      epochRef.current,
      text,
    )
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return { status, signing, myPubKey, messages, connect, send, signError }
}
