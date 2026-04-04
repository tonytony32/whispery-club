import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { bytesToHex } from '@noble/hashes/utils'
import { useMessenger, type UseMessengerResult, type ChatMessage } from './transport/useMessenger'
import { useDemoMessenger } from './transport/useDemoMessenger'
import { BACK_ADDRESS, BACK_ABI, CHANNEL_ID } from './contracts'
import { DEMO_PRIVATE_KEYS } from './core/crypto'
import type { NodeStatus } from './transport/node'

// ── Palette ───────────────────────────────────────────────────────────────────
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
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, signing }: { status: NodeStatus; signing: boolean }) {
  const s = signing ? 'signing' : status
  const [color, label] =
    s === 'connected' ? [C.green,  '● connected']   :
    s === 'signing'   ? [C.yellow, '◌ signing…']    :
    s === 'connecting'? [C.yellow, '◌ connecting…'] :
    s === 'error'     ? [C.red,    '✗ error']       :
                        [C.muted,  '○ idle']
  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

// ── Single participant panel ──────────────────────────────────────────────────

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
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>

      {/* Header card */}
      <div style={{ ...card, borderColor: accentColor + '55' }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: accentColor }}>
            {label}
            {isDemo && (
              <span style={{ ...mono, fontSize: 10, color: C.muted,
                fontWeight: 400, marginLeft: 8 }}>
                demo key
              </span>
            )}
          </span>
          <StatusBadge status={status} signing={signing} />
        </div>

        {!pointer ? (
          <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
            EEE not published — go to Live tab first.
          </span>
        ) : status === 'connected' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...mono, color: C.green, fontSize: 11 }}>
              Ready · epoch {String(eeeEpoch)}
            </span>
            {myPubKey && (
              <span style={{ ...mono, color: C.muted, fontSize: 10, wordBreak: 'break-all' }}>
                x25519 · 0x{bytesToHex(myPubKey)}
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signing && (
              <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
                Check MetaMask — sign the SIWE message…
              </span>
            )}
            {status === 'connecting' && !signing && (
              <span style={{ ...mono, color: C.yellow, fontSize: 11 }}>
                Joining Waku… (up to 30 s)
              </span>
            )}
            {status === 'error' && (
              <span style={{ ...mono, color: C.red, fontSize: 11 }}>
                Connection failed. Check console.
              </span>
            )}
            {signError && (
              <span style={{ ...mono, color: C.red, fontSize: 11 }}>{signError}</span>
            )}
            {!isDemo && !signing && status !== 'connecting' && pointer && (
              <button
                onClick={connect}
                style={{
                  background: accentColor, color: '#fff', border: 'none',
                  borderRadius: 6, padding: '8px 16px',
                  ...mono, fontWeight: 700, cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Connect to Waku
              </button>
            )}
          </div>
        )}
      </div>

      {/* Message thread */}
      <div style={{
        ...card,
        flex: 1,
        minHeight: 280,
        maxHeight: 400,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
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
                  color: msg.direction === 'out' ? 'rgba(255,255,255,0.55)' : C.muted }}>
                  {msg.direction === 'out' ? 'you' : 'group'} · {new Date(msg.at).toLocaleTimeString()}
                </div>
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={status === 'connected' ? 'Type a message…' : 'Connect first…'}
            disabled={status !== 'connected'}
            style={{
              flex: 1,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: C.text,
              ...mono,
              outline: 'none',
              opacity: status !== 'connected' ? 0.4 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !draft.trim() || status !== 'connected'}
            style={{
              background: sending || !draft.trim() || status !== 'connected'
                ? C.dim : accentColor,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              ...mono,
              fontWeight: 700,
              cursor: sending || !draft.trim() || status !== 'connected'
                ? 'default' : 'pointer',
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

  const aliceResult = useMessenger(address, pointer)
  const bobResult   = useDemoMessenger(DEMO_PRIVATE_KEYS.B, 'Betty', pointer)

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
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
          result={bobResult}
        />
      </div>
    </div>
  )
}
