import { useState, useEffect, useRef } from 'react'
import { useSignMessage } from 'wagmi'
import type { LightNode } from '@waku/sdk'
import { siweMessage, keysFromSig, accessGroupChannel, type EEE } from '../core/crypto'
import type { Wallet } from '../core/crypto'
import { fetchJSON } from '../core/ipfs'
import { createWakuNode, type NodeStatus } from './node'
import { L1Messenger, channelTopic } from './messenger'
import nacl from 'tweetnacl'

export interface ChatMessage {
  text: string
  direction: 'in' | 'out'
  at: number
}

export interface UseMessengerResult {
  status: NodeStatus
  signing: boolean
  myPubKey: Uint8Array | null
  messages: ChatMessage[]
  connect: () => void
  send: (text: string) => Promise<void>
  signError: string | null
}

function ts() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':') +
    '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export function useMessenger(
  ethAddress: string | undefined,
  eeePointer: string | undefined,
  label = 'wallet',
  addLog?: (msg: string) => void,
): UseMessengerResult {
  const [status, setStatus]     = useState<NodeStatus>('idle')
  const [signing, setSigning]   = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [myPubKey, setMyPubKey] = useState<Uint8Array | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const nodeRef       = useRef<LightNode | null>(null)
  const messengerRef  = useRef<L1Messenger | null>(null)
  const walletRef     = useRef<Wallet | null>(null)
  const contentKeyRef = useRef<Uint8Array | null>(null)
  const channelIdRef  = useRef<string | null>(null)
  const epochRef      = useRef<number>(0)
  const x25519Ref     = useRef<nacl.BoxKeyPair | null>(null)

  const { signMessageAsync } = useSignMessage()

  const log = (msg: string) => addLog?.(`${ts()} [${label}] ${msg}`)

  useEffect(() => {
    return () => { nodeRef.current?.stop() }
  }, [])

  async function connect() {
    if (!ethAddress) return
    if (status === 'connecting' || status === 'connected') return

    setSigning(true)
    setSignError(null)
    log('Requesting SIWE signature from MetaMask…')

    let wallet: Wallet
    try {
      const sig = await signMessageAsync({ message: siweMessage(ethAddress) })
      wallet = keysFromSig(sig, ethAddress)
      walletRef.current = wallet
      x25519Ref.current = wallet.x25519
      setMyPubKey(wallet.x25519.publicKey)
      log(`Keys derived — x25519 pubkey: 0x${Array.from(wallet.x25519.publicKey.slice(0,4)).map(b=>b.toString(16).padStart(2,'0')).join('')}…`)
    } catch (e) {
      setSigning(false)
      const msg = e instanceof Error ? e.message : 'Signature rejected'
      setSignError(msg)
      log(`SIWE failed: ${msg}`)
      return
    }

    if (eeePointer) {
      try {
        log(`Fetching EEE from IPFS: ${eeePointer.slice(0, 20)}…`)
        const eee = await fetchJSON<EEE>(eeePointer)
        log(`EEE loaded — channel: ${eee.channel_id.slice(0, 10)}…, epoch: ${eee.epoch}`)
        const ck = accessGroupChannel(wallet, eee)
        if (!ck) {
          setSigning(false)
          setSignError('Not authorized — this wallet is not in the channel ACT')
          log('ACT lookup: no match — wallet not authorized')
          return
        }
        contentKeyRef.current = ck
        channelIdRef.current  = eee.channel_id
        epochRef.current      = eee.epoch
        log('ACT lookup: ✓ content_key derived')
      } catch (e) {
        setSigning(false)
        const msg = e instanceof Error ? e.message : String(e)
        setSignError(`Failed to load EEE: ${msg}`)
        log(`EEE fetch failed: ${msg}`)
        return
      }
    }

    setSigning(false)

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

      if (contentKeyRef.current && channelIdRef.current) {
        const topic = channelTopic(channelIdRef.current)
        log(`Subscribing to ${topic}`)
        await messenger.subscribeGroup(channelIdRef.current, contentKeyRef.current)
        log('Subscribed ✓')
      } else {
        await messenger.subscribe()
      }
    } catch (e) {
      setStatus('error')
      log(`Connection error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function send(text: string) {
    if (!messengerRef.current) throw new Error('Not connected')
    if (!contentKeyRef.current || !channelIdRef.current) {
      throw new Error('Group channel not initialized')
    }
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

  return { status, signing, myPubKey, messages, connect, send, signError }
}
