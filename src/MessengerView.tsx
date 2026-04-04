import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { bytesToHex } from '@noble/hashes/utils'
import { useMessenger, type UseMessengerResult, type ChatMessage } from './transport/useMessenger'
import { useDemoMessenger } from './transport/useDemoMessenger'
import { BACK_ADDRESS, BACK_ABI, CHANNEL_ID } from './contracts'
import { DEMO_PRIVATE_KEYS } from './core/crypto'
import type { NodeStatus } from './transport/node'

const C = {
  bg:        '#0b0b0e',
  surface:   '#13131a',
  raised:    '#1a1a24',
  border:    '#25253a',
  text:      '#ddddf0',
  muted:     '#5a5a7a',
  dim:       '#3a3a55',
  accent:    '#7c6aff',
  green:     '#3ddc97',
  red:       '#ff5a5a',
  yellow:    '#ffc83d',
  orange:    '#ff9a3d',
  logBg:     '#080c08',
  logBorder: '#1a2a1a',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, signing }: { status: NodeStatus; signing: boolean }) {
  const s = signing ? 'signing' : status
  const [color, label] =
    s === 'connected'     ? [C.green,  '● connected']      :
    s === 'signing'       ? [C.yellow, '◌ signing…']       :
    s === 'connecting'    ? [C.yellow, '◌ connecting…']    :
    s === 'disconnected'  ? [C.orange, '⚡ disconnected']   :
    s === 'error'         ? [C.red,    '✗ error']          :
                            [C.muted,  '○ idle']
  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs, accentColor }: { logs: string[]; accentColor: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight) }, [logs])

  return (
    <div
      ref={ref}
      style={{
        background: C.logBg,
        border: `1px solid ${C.logBorder}`,
        borderRadius: 8,
        padding: '10px 14px',
        height: 160,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color: accentColor + '50', marginBottom: 5 }}>
        log
      </div>
      {logs.length === 0 ? (
        <span style={{ ...mono, fontSize: 11, color: '#2a3a2a' }}>— waiting —</span>
      ) : (
        logs.map((entry, i) => {
          const color =
            entry.includes('✓')                           ? '#3d7a4d' :
            entry.includes('failed') || entry.includes('error') ||
            entry.includes('Error')  || entry.includes('lost')  ? '#7a3a3a' :
            entry.includes('peer:connect ')               ? '#3a5a7a' :
            entry.includes('peer:disconnect')             ? '#5a4a2a' :
                                                            '#2d4a3a'
          return (
            <div key={i} style={{
              ...mono, fontSize: 11, color, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {entry}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Shared participant view ───────────────────────────────────────────────────

function ParticipantView({
  label,
  accentColor,
  isDemo,
  pointer,
  eeeEpoch,
  result,
  logs,
}: {
  label: string
  accentColor: string
  isDemo: boolean
  pointer: string | undefined
  eeeEpoch: bigint
  result: UseMessengerResult
  logs: string[]
}) {
  const { status, signing, myPubKey, messages, connect, send, signError } = result
  const [draft, setDraft]         = useState('')
  const [sending, setSending]     = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight)
  }, [messages])

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true)
    setSendError(null)
    try { await send(draft.trim()); setDraft('') }
    catch (e) { setSendError(e instanceof Error ? e.message : String(e)) }
    finally { setSending(false) }
  }

  const connected = status === 'connected'
  const canSend   = connected && !!draft.trim() && !sending

  const card: React.CSSProperties = {
    background: C.raised,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '16px 20px',
  }

  return (
    <div style={{
      maxWidth: 680, margin: '0 auto', padding: '24px 32px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* Header */}
      <div style={{
        ...card,
        borderColor: status === 'connected'     ? accentColor + '60' :
                     status === 'disconnected'  ? C.orange + '60'    : C.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: accentColor }}>
              {label}
            </span>
            {connected && myPubKey && (
              <span style={{ ...mono, fontSize: 10, color: C.muted }}>
                0x{bytesToHex(myPubKey.slice(0, 4))}…
              </span>
            )}
          </div>
          <StatusBadge status={status} signing={signing} />
        </div>

        {connected && (
          <span style={{ ...mono, fontSize: 11, color: C.muted }}>
            epoch {String(eeeEpoch)} · group channel
          </span>
        )}

        {status === 'disconnected' && (
          <span style={{ ...mono, fontSize: 11, color: C.orange }}>
            All Waku peers dropped. Messages cannot be sent until reconnected.
          </span>
        )}

        {!pointer && (
          <span style={{ ...mono, fontSize: 11, color: C.yellow }}>
            EEE not published — go to Live tab first.
          </span>
        )}

        {signing && (
          <span style={{ ...mono, fontSize: 11, color: C.yellow }}>
            Check MetaMask — sign the SIWE message…
          </span>
        )}
        {status === 'connecting' && !signing && (
          <span style={{ ...mono, fontSize: 11, color: C.yellow }}>Joining Waku…</span>
        )}
        {status === 'error' && (
          <span style={{ ...mono, fontSize: 11, color: C.red }}>
            Connection failed — see log below.
          </span>
        )}
        {signError && (
          <span style={{ ...mono, fontSize: 11, color: C.red }}>{signError}</span>
        )}

        {!isDemo && !signing && status === 'idle' && pointer && (
          <button
            onClick={connect}
            style={{
              marginTop: 10, background: accentColor, color: '#fff',
              border: 'none', borderRadius: 6, padding: '9px 20px',
              ...mono, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Connect to Waku
          </button>
        )}
      </div>

      {/* Thread */}
      <div
        ref={threadRef}
        style={{
          ...card,
          flex: 1,
          height: 360,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '14px 18px',
        }}
      >
        {messages.length === 0 ? (
          <span style={{ ...mono, color: C.dim, fontSize: 11, margin: 'auto' }}>
            No messages yet
          </span>
        ) : (
          messages.map((msg: ChatMessage, i: number) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                background: msg.direction === 'out' ? accentColor : C.surface,
                color: C.text,
                border: `1px solid ${msg.direction === 'out' ? accentColor : C.border}`,
                borderRadius: 8, padding: '7px 12px',
                maxWidth: '80%', wordBreak: 'break-word', ...mono,
              }}>
                <div style={{ fontSize: 10, marginBottom: 3,
                  color: msg.direction === 'out' ? 'rgba(255,255,255,0.5)' : C.muted }}>
                  {msg.direction === 'out' ? label.toLowerCase() : 'group'} · {new Date(msg.at).toLocaleTimeString()}
                </div>
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose */}
      <div style={{ ...card, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={connected ? 'Type a message…' : 'Not connected…'}
            disabled={!connected}
            style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 12px', color: C.text,
              ...mono, outline: 'none', opacity: connected ? 1 : 0.35,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              background: canSend ? accentColor : C.dim,
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 16px', ...mono, fontWeight: 700,
              cursor: canSend ? 'pointer' : 'default',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        {sendError && (
          <span style={{ ...mono, color: C.red, fontSize: 11, marginTop: 6, display: 'block' }}>
            {sendError}
          </span>
        )}
      </div>

      {/* Log */}
      <LogPanel logs={logs} accentColor={accentColor} />
    </div>
  )
}

// ── Alice (MetaMask) ──────────────────────────────────────────────────────────

export function AliceView() {
  const { address } = useAccount()
  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS, abi: BACK_ABI, functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`], query: { enabled: true },
  })
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]
  const pointer = eeePointer || undefined

  const [logs, setLogs] = useState<string[]>([])
  const addLog = useCallback((msg: string) => setLogs(p => [...p, msg]), [])

  const result = useMessenger(address, pointer, 'Alice', addLog)

  if (!address) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 32 }}>
        <span style={{ ...mono, color: C.muted }}>Connect your wallet in the Live tab first.</span>
      </div>
    )
  }

  return (
    <ParticipantView
      label="Alice" accentColor={C.accent}
      isDemo={false} pointer={pointer} eeeEpoch={eeeEpoch}
      result={result} logs={logs}
    />
  )
}

// ── Betty (demo key, auto-connect) ────────────────────────────────────────────

export function BettyView() {
  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS, abi: BACK_ABI, functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`], query: { enabled: true },
  })
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]
  const pointer = eeePointer || undefined

  const [logs, setLogs] = useState<string[]>([])
  const addLog = useCallback((msg: string) => setLogs(p => [...p, msg]), [])

  const result = useDemoMessenger(DEMO_PRIVATE_KEYS.B, 'Betty', pointer, addLog)

  return (
    <ParticipantView
      label="Betty" accentColor={C.orange}
      isDemo={true} pointer={pointer} eeeEpoch={eeeEpoch}
      result={result} logs={logs}
    />
  )
}
