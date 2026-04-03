import { useState } from 'react'
import { useAccount } from 'wagmi'
import { bytesToHex } from '@noble/hashes/utils'
import { createWallet, DEMO_PRIVATE_KEYS } from './core/crypto'
import { useMessenger } from './transport/useMessenger'

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
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

const card: React.CSSProperties = {
  background: C.raised,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: '20px 24px',
}

// ── Demo targets (other members' X25519 pubkeys, derived from DEMO keys) ──────
// Used as send targets in demo mode. In production, pubkeys would be
// fetched from a key registry (on-chain or IPFS).
const DEMO_MEMBERS = [
  createWallet(DEMO_PRIVATE_KEYS.A, 'Alice'),
  createWallet(DEMO_PRIVATE_KEYS.B, 'Bob'),
  createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie'),
]

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'connected'  ? C.green  :
    status === 'connecting' ? C.yellow :
    status === 'error'      ? C.red    : C.muted

  const label =
    status === 'connected'  ? '● connected'   :
    status === 'connecting' ? '◌ connecting…' :
    status === 'error'      ? '✗ error'       : '○ idle'

  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

export default function MessengerView() {
  const { address } = useAccount()
  const { status, signing, myPubKey, messages, connect, send, signError } = useMessenger(address)

  const [recipientIdx, setRecipientIdx] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // In demo mode, send to any of the known demo members
  const targets = DEMO_MEMBERS

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true)
    setSendError(null)
    try {
      await send(targets[recipientIdx].x25519.publicKey, draft.trim())
      setDraft('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 32,
      display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Connection card */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.muted, margin: 0 }}>
            Waku · L1 Transport
          </p>
          <StatusBadge status={signing ? 'connecting' : status} />
        </div>

        {!address ? (
          <span style={{ ...mono, color: C.muted }}>
            Connect your wallet in the Live tab first.
          </span>
        ) : status === 'connected' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...mono, color: C.green }}>
              Ready · {address.slice(0, 10)}…
            </span>
            {myPubKey && (
              <span style={{ ...mono, color: C.muted, fontSize: 10, wordBreak: 'break-all' }}>
                X25519 · 0x{bytesToHex(myPubKey)}
              </span>
            )}
            {myPubKey && (
              <span style={{ ...mono, color: C.muted, fontSize: 10 }}>
                topic · /whispery/1/neighbor-0x{bytesToHex(myPubKey.slice(0, 2))}/proto
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signing && (
              <span style={{ ...mono, color: C.yellow }}>
                Check MetaMask — sign the SIWE message to derive your keypair…
              </span>
            )}
            {status === 'connecting' && !signing && (
              <span style={{ ...mono, color: C.yellow }}>
                Joining The Waku Network… (may take up to 30 s)
              </span>
            )}
            {status === 'error' && (
              <span style={{ ...mono, color: C.red, fontSize: 11 }}>
                Failed to connect. Check your network and retry.
              </span>
            )}
            {signError && (
              <span style={{ ...mono, color: C.red, fontSize: 11 }}>{signError}</span>
            )}
            {!signing && status !== 'connecting' && (
              <button
                onClick={connect}
                style={{
                  background: C.accent, color: '#fff', border: 'none',
                  borderRadius: 6, padding: '10px 20px',
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

      {/* Compose */}
      {status === 'connected' && (
        <div style={card}>
          <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
            Send message
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {targets.map((m, i) => (
              <button
                key={m.ethAddress}
                onClick={() => setRecipientIdx(i)}
                style={{
                  background: recipientIdx === i ? C.accent : 'transparent',
                  color: recipientIdx === i ? '#fff' : C.muted,
                  border: `1px solid ${recipientIdx === i ? C.accent : C.border}`,
                  borderRadius: 6, padding: '4px 12px',
                  ...mono, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              style={{
                flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '8px 12px', color: C.text,
                ...mono, outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              style={{
                background: sending || !draft.trim() ? C.dim : C.accent,
                color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 16px', ...mono, fontWeight: 700,
                cursor: sending || !draft.trim() ? 'default' : 'pointer',
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
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div style={card}>
          <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
            Messages
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  background: msg.direction === 'out' ? C.accent : C.surface,
                  color: C.text,
                  border: `1px solid ${msg.direction === 'out' ? C.accent : C.border}`,
                  borderRadius: 8, padding: '8px 12px',
                  maxWidth: '80%', wordBreak: 'break-word',
                  ...mono,
                }}>
                  <div style={{ fontSize: 10, marginBottom: 4,
                    color: msg.direction === 'out' ? 'rgba(255,255,255,0.6)' : C.muted }}>
                    {msg.direction === 'out' ? 'you' : 'incoming'} · {new Date(msg.at).toLocaleTimeString()}
                  </div>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
