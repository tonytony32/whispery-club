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

function StatusBadge({ status, signing }: { status: NodeStatus; signing: boolean }) {
  const s = signing ? 'signing' : status
  const [color, label] =
    s === 'connected'    ? [C.green,  '● connected']    :
    s === 'signing'      ? [C.yellow, '◌ signing…']     :
    s === 'connecting'   ? [C.yellow, '◌ connecting…']  :
    s === 'disconnected' ? [C.orange, '⚡ disconnected'] :
    s === 'error'        ? [C.red,    '✗ error']        :
                           [C.muted,  '○ idle']
  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

function LogPanel({ logs, accent }: { logs: string[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight) }, [logs])

  return (
    <div ref={ref} style={{
      background: C.logBg, border: `1px solid ${C.logBorder}`,
      borderRadius: 8, padding: '8px 12px',
      height: 140, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color: accent + '40', marginBottom: 4 }}>
        log
      </div>
      {logs.length === 0
        ? <span style={{ ...mono, fontSize: 11, color: '#222' }}>— waiting —</span>
        : logs.map((e, i) => {
            const c =
              e.includes('✓')                                         ? '#3d7a4d' :
              e.includes('failed') || e.includes('error') ||
              e.includes('Error')  || e.includes('lost')              ? '#7a3a3a' :
              e.includes('peer:connect ')                             ? '#3a5a7a' :
              e.includes('peer:disconnect')                           ? '#5a4a2a' :
                                                                        '#2d4a3a'
            return (
              <div key={i} style={{
                ...mono, fontSize: 11, color: c, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{e}</div>
            )
          })
      }
    </div>
  )
}

function ParticipantPanel({
  label, accent, isDemo, pointer, eeeEpoch, result, logs,
}: {
  label: string
  accent: string
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
    setSending(true); setSendError(null)
    try { await send(draft.trim()); setDraft('') }
    catch (e) { setSendError(e instanceof Error ? e.message : String(e)) }
    finally { setSending(false) }
  }

  const connected = status === 'connected'
  const canSend   = connected && !!draft.trim() && !sending

  const card: React.CSSProperties = {
    background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

      {/* Header */}
      <div style={{
        ...card, padding: '12px 16px',
        borderColor: status === 'connected'    ? accent + '55'      :
                     status === 'disconnected' ? C.orange + '55'    : C.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: accent }}>
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

        {connected &&
          <div style={{ ...mono, fontSize: 10, color: C.muted }}>
            epoch {String(eeeEpoch)} · group channel
          </div>
        }
        {status === 'disconnected' &&
          <div style={{ ...mono, fontSize: 11, color: C.orange }}>
            All Waku peers dropped — messages paused.
          </div>
        }
        {!pointer &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>
            EEE not published — go to Live tab first.
          </div>
        }
        {signing &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>
            Check MetaMask — sign the SIWE message…
          </div>
        }
        {status === 'connecting' && !signing &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>Joining Waku…</div>
        }
        {status === 'error' &&
          <div style={{ ...mono, fontSize: 11, color: C.red }}>
            Failed — see log below.
          </div>
        }
        {signError &&
          <div style={{ ...mono, fontSize: 11, color: C.red, marginTop: 4 }}>{signError}</div>
        }
        {!isDemo && !signing && status === 'idle' && pointer && (
          <button onClick={connect} style={{
            marginTop: 8, background: accent, color: '#fff',
            border: 'none', borderRadius: 6, padding: '8px 18px',
            ...mono, fontWeight: 700, cursor: 'pointer',
          }}>
            Connect to Waku
          </button>
        )}
      </div>

      {/* Thread */}
      <div ref={threadRef} style={{
        ...card, flex: 1, height: 300, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      }}>
        {messages.length === 0
          ? <span style={{ ...mono, color: C.dim, fontSize: 11, margin: 'auto' }}>No messages yet</span>
          : messages.map((msg: ChatMessage, i: number) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                background: msg.direction === 'out' ? accent : C.surface,
                color: C.text,
                border: `1px solid ${msg.direction === 'out' ? accent : C.border}`,
                borderRadius: 8, padding: '6px 10px',
                maxWidth: '85%', wordBreak: 'break-word', ...mono,
              }}>
                <div style={{ fontSize: 10, marginBottom: 2,
                  color: msg.direction === 'out' ? 'rgba(255,255,255,0.5)' : C.muted }}>
                  {msg.direction === 'out' ? label.toLowerCase() : 'group'} · {new Date(msg.at).toLocaleTimeString()}
                </div>
                {msg.text}
              </div>
            </div>
          ))
        }
      </div>

      {/* Compose */}
      <div style={{ ...card, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={connected ? 'Type a message…' : 'Not connected…'}
            disabled={!connected}
            style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '7px 11px', color: C.text,
              ...mono, outline: 'none', opacity: connected ? 1 : 0.35,
            }}
          />
          <button onClick={handleSend} disabled={!canSend} style={{
            background: canSend ? accent : C.dim,
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '7px 14px', ...mono, fontWeight: 700,
            cursor: canSend ? 'pointer' : 'default',
          }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
        {sendError && (
          <div style={{ ...mono, color: C.red, fontSize: 11, marginTop: 5 }}>{sendError}</div>
        )}
      </div>

      {/* Log */}
      <LogPanel logs={logs} accent={accent} />
    </div>
  )
}

// ── Main split view ───────────────────────────────────────────────────────────

export default function MessengerView() {
  const { address } = useAccount()

  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS, abi: BACK_ABI, functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`], query: { enabled: true },
  })
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]
  const pointer = eeePointer || undefined

  const [aliceLogs, setAliceLogs] = useState<string[]>([])
  const [bettyLogs, setBettyLogs] = useState<string[]>([])
  const addAliceLog = useCallback((msg: string) => setAliceLogs(p => [...p, msg]), [])
  const addBettyLog = useCallback((msg: string) => setBettyLogs(p => [...p, msg]), [])

  const aliceResult = useMessenger(address, pointer, 'Alice', addAliceLog)
  const bettyResult = useDemoMessenger(DEMO_PRIVATE_KEYS.B, 'Betty', pointer, addBettyLog)

  if (!address) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 32 }}>
        <span style={{ ...mono, color: C.muted }}>Connect your wallet in the Live tab first.</span>
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px 24px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 20,
      height: 'calc(100vh - 57px)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <ParticipantPanel
        label="Alice" accent={C.accent} isDemo={false}
        pointer={pointer} eeeEpoch={eeeEpoch}
        result={aliceResult} logs={aliceLogs}
      />
      <ParticipantPanel
        label="Betty" accent={C.orange} isDemo={true}
        pointer={pointer} eeeEpoch={eeeEpoch}
        result={bettyResult} logs={bettyLogs}
      />
    </div>
  )
}
