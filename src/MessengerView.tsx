import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { bytesToHex } from '@noble/hashes/utils'
import { useMessenger, type UseMessengerResult, type ChatMessage } from './transport/useMessenger'
import { useDemoMessenger } from './transport/useDemoMessenger'
import { BACK_ADDRESS, BACK_ABI, CHANNEL_ID } from './contracts'
import { DEMO_PRIVATE_KEYS } from './core/crypto'
import type { NodeStatus } from './transport/node'

const C = {
  bg:      '#0b0b0e',
  surface: '#13131a',
  raised:  '#1a1a24',
  border:  '#25253a',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
  green:   '#3ddc97',
  red:     '#ff5a5a',
  yellow:  '#ffc83d',
  blue:    '#5ab4ff',
  orange:  '#ff9a3d',
  logBg:   '#080c08',
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
    s === 'connected'  ? [C.green,  '● connected']   :
    s === 'signing'    ? [C.yellow, '◌ signing…']    :
    s === 'connecting' ? [C.yellow, '◌ connecting…'] :
    s === 'error'      ? [C.red,    '✗ error']       :
                         [C.muted,  '○ idle']
  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

// ── Participant panel ─────────────────────────────────────────────────────────

function MessengerPanel({
  label,
  accentColor,
  isDemo,
  pointer,
  eeeEpoch,
  result,
}: {
  label: string
  accentColor: string
  isDemo: boolean
  pointer: string | undefined
  eeeEpoch: bigint
  result: UseMessengerResult
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
    try {
      await send(draft.trim())
      setDraft('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const card: React.CSSProperties = {
    background: C.raised,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '16px 20px',
  }

  const canSend = status === 'connected' && draft.trim() && !sending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>

      {/* Header */}
      <div style={{
        ...card,
        borderColor: status === 'connected' ? accentColor + '60' : C.border,
        padding: '14px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: status === 'idle' && pointer ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              ...mono, fontSize: 13, fontWeight: 700, color: accentColor,
            }}>
              {label}
            </span>
            {status === 'connected' && myPubKey && (
              <span style={{ ...mono, fontSize: 10, color: C.muted }}>
                0x{bytesToHex(myPubKey.slice(0, 4))}…
              </span>
            )}
          </div>
          <StatusBadge status={status} signing={signing} />
        </div>

        {status === 'connected' && (
          <span style={{ ...mono, color: C.muted, fontSize: 10 }}>
            epoch {String(eeeEpoch)} · group channel
          </span>
        )}

        {!pointer && (
          <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
            EEE not published — go to Live tab first.
          </span>
        )}

        {signing && (
          <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
            Check MetaMask — sign the SIWE message…
          </span>
        )}
        {status === 'connecting' && !signing && (
          <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
            Joining Waku…
          </span>
        )}
        {status === 'error' && (
          <span style={{ ...mono, color: C.red, fontSize: 11 }}>
            Connection failed — see log below.
          </span>
        )}
        {signError && (
          <span style={{ ...mono, color: C.red, fontSize: 11 }}>{signError}</span>
        )}

        {!isDemo && !signing && status === 'idle' && pointer && (
          <button
            onClick={connect}
            style={{
              background: accentColor, color: '#fff', border: 'none',
              borderRadius: 6, padding: '8px 16px',
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
          minHeight: 260,
          maxHeight: 360,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 16px',
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
                borderRadius: 8,
                padding: '6px 10px',
                maxWidth: '85%',
                wordBreak: 'break-word',
                ...mono,
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
            placeholder={status === 'connected' ? 'Type a message…' : 'Not connected…'}
            disabled={status !== 'connected'}
            style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 12px', color: C.text,
              ...mono, outline: 'none', opacity: status !== 'connected' ? 0.35 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              background: canSend ? accentColor : C.dim,
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 14px', ...mono, fontWeight: 700,
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
    </div>
  )
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight)
  }, [logs])

  return (
    <div style={{
      background: C.logBg,
      border: `1px solid ${C.logBorder}`,
      borderRadius: 8,
      padding: '10px 14px',
      height: 180,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}
      ref={ref}
    >
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color: '#2a4a2a', marginBottom: 6 }}>
        log
      </div>
      {logs.length === 0 ? (
        <span style={{ ...mono, fontSize: 11, color: '#2a3a2a' }}>
          — waiting for activity —
        </span>
      ) : (
        logs.map((entry, i) => {
          const color =
            entry.includes('✓')         ? '#3a7a4a' :
            entry.includes('failed') ||
            entry.includes('error') ||
            entry.includes('Error')     ? '#7a3a3a' :
            entry.includes('peer:conn') ? '#3a5a7a' :
            entry.includes('[Alice]')   ? '#5a4a8a' :
            entry.includes('[Betty]')   ? '#7a4a3a' :
                                          '#2a4a3a'
          return (
            <div key={i} style={{ ...mono, fontSize: 11, color, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {entry}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MessengerView() {
  const { address } = useAccount()

  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS,
    abi: BACK_ABI,
    functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`],
    query: { enabled: true },
  })
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]
  const pointer = eeePointer || undefined

  const [logs, setLogs] = useState<string[]>([])
  const addLog = useCallback((msg: string) => setLogs(prev => [...prev, msg]), [])

  const aliceResult = useMessenger(address, pointer, 'Alice', addLog)
  const bettyResult = useDemoMessenger(DEMO_PRIVATE_KEYS.B, 'Betty', pointer, addLog)

  if (!address) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 32 }}>
        <span style={{ ...mono, color: C.muted }}>
          Connect your wallet in the Live tab first.
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <MessengerPanel
          label="Alice"
          accentColor={C.accent}
          isDemo={false}
          pointer={pointer}
          eeeEpoch={eeeEpoch}
          result={aliceResult}
        />
        <MessengerPanel
          label="Betty"
          accentColor={C.orange}
          isDemo={true}
          pointer={pointer}
          eeeEpoch={eeeEpoch}
          result={bettyResult}
        />
      </div>
      <LogPanel logs={logs} />
    </div>
  )
}
