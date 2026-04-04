/**
 * useDemoMessenger — like useMessenger but for a hardcoded demo wallet.
 *
 * No MetaMask needed. Keys are derived directly from a private key hex.
 * Auto-connects as soon as eeePointer is available.
 * Used for the split-screen demo (Bob's panel).
 */

import { useState, useEffect, useRef } from 'react'
import type { LightNode } from '@waku/sdk'
import { createWallet, accessGroupChannel, type EEE } from '../core/crypto'
import { fetchJSON } from '../core/ipfs'
import { createWakuNode, type NodeStatus } from './node'
import { L1Messenger } from './messenger'
import type { ChatMessage, UseMessengerResult } from './useMessenger'

export function useDemoMessenger(
  privKeyHex: string,
  label: string,
  eeePointer: string | undefined,
): UseMessengerResult {
  const [status, setStatus]   = useState<NodeStatus>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [myPubKey, setMyPubKey] = useState<Uint8Array | null>(null)

  const nodeRef       = useRef<LightNode | null>(null)
  const messengerRef  = useRef<L1Messenger | null>(null)
  const contentKeyRef = useRef<Uint8Array | null>(null)
  const channelIdRef  = useRef<string | null>(null)
  const epochRef      = useRef<number>(0)
  const didConnect    = useRef(false)

  useEffect(() => {
    return () => { nodeRef.current?.stop() }
  }, [])

  useEffect(() => {
    if (!eeePointer || didConnect.current) return
    didConnect.current = true
    void connectInternal(eeePointer)
  }, [eeePointer]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connectInternal(pointer: string) {
    const wallet = createWallet(privKeyHex, label)
    setMyPubKey(wallet.x25519.publicKey)

    try {
      const eee = await fetchJSON<EEE>(pointer)
      const ck  = accessGroupChannel(wallet, eee)
      if (!ck) {
        setStatus('error')
        return
      }
      contentKeyRef.current = ck
      channelIdRef.current  = eee.channel_id
      epochRef.current      = eee.epoch
    } catch {
      setStatus('error')
      return
    }

    try {
      const node = await createWakuNode({
        onStatus: (s, detail) => {
          setStatus(s)
          if (detail) console.warn(`[Waku/${label}]`, detail)
        },
      })
      nodeRef.current = node

      const messenger = new L1Messenger(node, wallet)
      messengerRef.current = messenger

      messenger.addEventListener('message', (e) => {
        const { text } = (e as CustomEvent<{ text: string }>).detail
        setMessages(prev => [...prev, { text, direction: 'in', at: Date.now() }])
      })

      await messenger.subscribeGroup(channelIdRef.current!, contentKeyRef.current!)
    } catch {
      setStatus('error')
    }
  }

  async function send(text: string) {
    if (!messengerRef.current || !contentKeyRef.current || !channelIdRef.current)
      throw new Error('Not connected')
    await messengerRef.current.publishGroup(
      contentKeyRef.current,
      channelIdRef.current,
      epochRef.current,
      text,
    )
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return {
    status,
    signing: false,
    myPubKey,
    messages,
    connect: () => { /* auto-connects via useEffect */ },
    send,
    signError: null,
  }
}
