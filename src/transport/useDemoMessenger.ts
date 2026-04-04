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
  const contentKeyRef = useRef<Uint8Array | null>(null)
  const channelIdRef  = useRef<string | null>(null)
  const epochRef      = useRef<number>(0)
  const didConnect    = useRef(false)

  const log = (msg: string) => addLog?.(`${ts()} [${label}] ${msg}`)

  useEffect(() => {
    return () => { nodeRef.current?.stop() }
  }, [])

  useEffect(() => {
    if (!eeePointer || didConnect.current) return
    didConnect.current = true
    void connectInternal(eeePointer)
  }, [eeePointer]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connectInternal(pointer: string) {
    log('Auto-connecting with demo key…')
    const wallet = createWallet(privKeyHex, label)
    setMyPubKey(wallet.x25519.publicKey)
    log(`Keys derived — x25519 pubkey: 0x${Array.from(wallet.x25519.publicKey.slice(0,4)).map(b=>b.toString(16).padStart(2,'0')).join('')}…`)

    try {
      log(`Fetching EEE from IPFS: ${pointer.slice(0, 20)}…`)
      const eee = await fetchJSON<EEE>(pointer)
      log(`EEE loaded — channel: ${eee.channel_id.slice(0, 10)}…, epoch: ${eee.epoch}`)
      const ck = accessGroupChannel(wallet, eee)
      if (!ck) {
        setStatus('error')
        log('ACT lookup: no match — demo key not in ACT')
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

    try {
      const node = await createWakuNode({
        onStatus: (s, detail) => {
          setStatus(s)
          if (detail) log(`Waku status → ${s}: ${detail}`)
          else log(`Waku status → ${s}`)
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
    } catch (e) {
      setStatus('error')
      log(`Connection error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function send(text: string) {
    if (!messengerRef.current || !contentKeyRef.current || !channelIdRef.current)
      throw new Error('Not connected')
    log(`Sending: "${text.slice(0, 30)}${text.length > 30 ? '…' : ''}"`)
    try {
      await messengerRef.current.publishGroup(
        contentKeyRef.current,
        channelIdRef.current,
        epochRef.current,
        text,
      )
      log('Message sent ✓')
    } catch (e) {
      log(`Send failed: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
    setMessages(prev => [...prev, { text, direction: 'out', at: Date.now() }])
  }

  return {
    status,
    signing: false,
    myPubKey,
    messages,
    connect: () => {},
    send,
    signError: null,
  }
}
