import { useState, useEffect, useRef } from 'react'
import type { LightNode } from '@waku/sdk'
import { createWallet, accessGroupChannel, type EEE } from '../core/crypto'
import { fetchJSON } from '../core/ipfs'
import { createWakuNode, type NodeStatus } from './node'
import { L1Messenger, channelTopic } from './messenger'
import type { ChatMessage, UseMessengerResult } from './useMessenger'

function ts() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':') +
    '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export function useDemoMessenger(
  privKeyHex: string,
  label: string,
  eeePointer: string | undefined,
  addLog?: (msg: string) => void,
): UseMessengerResult {
  const [status, setStatus]   = useState<NodeStatus>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [myPubKey, setMyPubKey] = useState<Uint8Array | null>(null)

  const nodeRef       = useRef<LightNode | null>(null)
  const messengerRef  = useRef<L1Messenger | null>(null)
  const walletRef     = useRef<ReturnType<typeof createWallet> | null>(null)
  const contentKeyRef = useRef<Uint8Array | null>(null)
  const channelIdRef  = useRef<string | null>(null)
  const epochRef      = useRef<number>(0)
  const connectingRef = useRef(false)

  const log = (msg: string) => addLog?.(`${ts()} [${label}] ${msg}`)

  useEffect(() => {
    return () => { nodeRef.current?.stop() }
  }, [])

  // ── Waku-only reconnect (reuses existing wallet + content_key) ──────────────

  async function connectWaku() {
    if (nodeRef.current) {
      await nodeRef.current.stop()
      nodeRef.current = null
      messengerRef.current = null
    }

    const wallet = walletRef.current!

    const node = await createWakuNode({
      onStatus: (s, detail) => {
        setStatus(s)
        log(`Waku → ${s}${detail ? ': ' + detail : ''}`)
      },
      onLog: log,
    })
    nodeRef.current = node

    const messenger = new L1Messenger(node, wallet)
    messengerRef.current = messenger

    messenger.addEventListener('message', (e) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail
      setMessages(prev => [...prev, { text, direction: 'in', at: Date.now() }])
    })

    const topic = channelTopic(channelIdRef.current!)
    log(`Subscribing to ${topic}`)
    await messenger.subscribeGroup(channelIdRef.current!, contentKeyRef.current!)
    log('Subscribed ✓')
  }

  // ── Public connect (manual — no auto-connect) ───────────────────────────────

  async function connect() {
    if (connectingRef.current) return
    if (status === 'connected') return
    if (!eeePointer) return

    connectingRef.current = true

    try {
      // Reconnect — wallet and content_key already known
      if (walletRef.current && contentKeyRef.current) {
        log('Reconnecting to Waku…')
        await connectWaku()
        return
      }

      // First connect — derive keys and fetch EEE
      log('Connecting with demo key…')
      const wallet = createWallet(privKeyHex, label)
      walletRef.current = wallet
      setMyPubKey(wallet.x25519.publicKey)
      log(`Keys derived — x25519: 0x${Array.from(wallet.x25519.publicKey.slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0')).join('')}…`)

      try {
        log(`Fetching EEE: ${eeePointer.slice(0, 20)}…`)
        const eee = await fetchJSON<EEE>(eeePointer)
        log(`EEE loaded — channel: ${eee.channel_id.slice(0, 10)}…, epoch: ${eee.epoch}`)
        const ck = accessGroupChannel(wallet, eee)
        if (!ck) {
          setStatus('error')
          log('ACT lookup: no match — key not in ACT')
          return
        }
        contentKeyRef.current = ck
        channelIdRef.current  = eee.channel_id
        epochRef.current      = eee.epoch
        log('ACT lookup: ✓ content_key derived')
      } catch (e) {
        setStatus('error')
        log(`EEE fetch failed: ${e instanceof Error ? e.message : String(e)}`)
        return
      }

      await connectWaku()
    } catch (e) {
      setStatus('error')
      log(`Connection error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      connectingRef.current = false
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async function send(text: string) {
    if (!messengerRef.current || !contentKeyRef.current || !channelIdRef.current)
      throw new Error('Not connected')
    log(`Sending: "${text.slice(0, 30)}${text.length > 30 ? '…' : ''}"`)
    try {
      await messengerRef.current.publishGroup(
        contentKeyRef.current, channelIdRef.current, epochRef.current, text,
      )
      log('Message sent ✓')
    } catch (e) {
      log(`Send failed: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return { status, signing: false, myPubKey, messages, connect, send, signError: null }
}
