/**
 * Whispery — Level 0 | React Demo App
 *
 * Left half:  interactive group channel — identities, send, who can read
 * Right half: EEE state, ACT table, envelope anatomy (built field by field)
 */

import { useState, useMemo } from 'react'
import {
  createWallet,
  DEMO_PRIVATE_KEYS,
  createGroupChannel,
  accessGroupChannel,
  createGroupEnvelope,
  openGroupEnvelope,
  toHex,
  type Envelope,
  type EEE,
} from './core/crypto'

// ── Wallets ───────────────────────────────────────────────────────────────────
const walletA = createWallet(DEMO_PRIVATE_KEYS.A, 'Wallet A')
const walletB = createWallet(DEMO_PRIVATE_KEYS.B, 'Wallet B')
const walletC = createWallet(DEMO_PRIVATE_KEYS.C, 'Wallet C')
const walletD = createWallet(DEMO_PRIVATE_KEYS.D, 'Wallet D')

const ALL_WALLETS = [walletA, walletB, walletC, walletD]

const { eee: INITIAL_EEE } = createGroupChannel(
  walletA,
  [walletA, walletB, walletC],
  'WHISP-001',
  0,
)

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
  orange:  '#ff9f5a',
  pink:    '#ff6eb4',
}

// ── Envelope field groups (for anatomy view) ──────────────────────────────────
const FIELD_GROUPS = [
  {
    label: '① Channel context',
    color: C.accent,
    fields: ['version', 'channel_id', 'epoch'],
    note: 'Identifies which channel and epoch this message belongs to.',
  },
  {
    label: '② Sender identity',
    color: C.blue,
    fields: ['sender_pk'],
    note: 'X25519 public key of the sender. The receiver uses it to verify who encrypted this.',
  },
  {
    label: '③ Encrypted payload',
    color: C.green,
    fields: ['ciphertext', 'mac_hint'],
    note: 'nonce[24] || XSalsa20-Poly1305(message). mac_hint is the first 4 bytes of the nonce — a routing hint, not authentication.',
  },
  {
    label: '④ Origin seal',
    color: C.yellow,
    fields: ['timestamp'],
    note: 'Unix ms stamped by the sender at emission time. Enables sequential ordering across epochs.',
  },
  {
    label: '⑤ Non-repudiation',
    color: C.pink,
    fields: ['signature'],
    note: 'secp256k1 over sha256(canonical JSON without this field). Proves the Ethereum identity that built this envelope.',
  },
]

function fieldColor(key: string): string {
  for (const g of FIELD_GROUPS) {
    if (g.fields.includes(key)) return g.color
  }
  return C.muted
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function short(s: string, n = 10): string {
  return s.length <= n * 2 + 2 ? s : `${s.slice(0, n)}…${s.slice(-6)}`
}

// ── Styles ────────────────────────────────────────────────────────────────────
const base: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

function label(color = C.muted): React.CSSProperties {
  return { ...base, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
    textTransform: 'uppercase', color }
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function Tag({ ok }: { ok: boolean }) {
  return (
    <span style={{
      ...base, fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 4,
      background: ok ? '#1a2e22' : '#2e1a1a',
      color: ok ? C.green : C.red,
      border: `1px solid ${ok ? '#2a5040' : '#5a2a2a'}`,
    }}>
      {ok ? '✓ ACT' : '✗ out'}
    </span>
  )
}

// ── Identity Table ────────────────────────────────────────────────────────────

function IdentityTable() {
  const rows = [
    { w: walletA, pk: toHex(walletA.x25519.publicKey), auth: true },
    { w: walletB, pk: toHex(walletB.x25519.publicKey), auth: true },
    { w: walletC, pk: toHex(walletC.x25519.publicKey), auth: true },
    { w: walletD, pk: toHex(walletD.x25519.publicKey), auth: false },
  ]

  const th: React.CSSProperties = {
    ...base, fontSize: 10, color: C.muted, fontWeight: 700,
    letterSpacing: 1, textTransform: 'uppercase',
    padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`,
  }
  const td: React.CSSProperties = {
    ...base, padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div>
      <p style={label()}>Identities</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8,
        background: C.raised, borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            <th style={th}>Wallet</th>
            <th style={th}>ETH Address</th>
            <th style={th}>X25519 Public Key</th>
            <th style={{ ...th, textAlign: 'center' }}>Access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ w, pk, auth }) => (
            <tr key={w.label} style={{ opacity: auth ? 1 : 0.55 }}>
              <td style={{ ...td, color: C.text, fontWeight: 700 }}>{w.label}</td>
              <td style={{ ...td, color: C.blue }}>{short(w.ethAddress, 8)}</td>
              <td style={{ ...td, color: C.accent }}>{short(pk, 10)}</td>
              <td style={{ ...td, textAlign: 'center' }}><Tag ok={auth} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...base, color: C.muted, fontSize: 10, marginTop: 6 }}>
        X25519 keys derived deterministically: sha256(secp256k1_sign(SIWE_message))
      </p>
    </div>
  )
}

// ── ACT Table ─────────────────────────────────────────────────────────────────

function ACTTable({ eee }: { eee: EEE }) {
  const members = [walletA, walletB, walletC]

  const th: React.CSSProperties = {
    ...base, fontSize: 10, color: C.muted, fontWeight: 700,
    letterSpacing: 1, textTransform: 'uppercase',
    padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`,
  }
  const td: React.CSSProperties = {
    ...base, padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div>
      <p style={label()}>
        EEE · Access Control Table
        <span style={{ color: C.muted, marginLeft: 8, fontWeight: 400 }}>
          epoch {eee.epoch} · {members.length} entries · chunks_hint {eee.chunks_hint}
        </span>
      </p>

      <div style={{ ...base, color: C.muted, fontSize: 10, margin: '4px 0 8px',
        padding: '6px 10px', background: C.raised, borderRadius: 6,
        borderLeft: `3px solid ${C.accent}` }}>
        channel_id: <span style={{ color: C.accent }}>{short(eee.channel_id, 14)}</span>
        {'  '}pk_group: <span style={{ color: C.blue }}>{short(eee.pk_group, 10)}</span>
        {'  '}admin: <span style={{ color: C.green }}>{short(eee.admin_address, 8)}</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse',
        background: C.raised, borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            <th style={th}>Member</th>
            <th style={{ ...th, color: C.yellow }}>lookup_key</th>
            <th style={{ ...th, color: C.green }}>encrypted_content_key</th>
          </tr>
        </thead>
        <tbody>
          {eee.act.map((entry, i) => (
            <tr key={i}>
              <td style={{ ...td, color: C.text, fontWeight: 700 }}>{members[i].label}</td>
              <td style={{ ...td, color: C.yellow }}>{short(entry.lookup_key, 12)}</td>
              <td style={{ ...td, color: C.green }}>{short(entry.encrypted_content_key, 12)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ ...base, color: C.muted, fontSize: 10, marginTop: 6 }}>
        lookup_key = HKDF(DH(sk_group, pk_member), "…/act/lookup/…")
        {'  ·  '}
        encrypted_content_key = secretbox(content_key, access_kdk)
      </p>
    </div>
  )
}

// ── Envelope Anatomy ──────────────────────────────────────────────────────────

function EnvelopeAnatomy({ envelope }: { envelope: Envelope }) {
  const [active, setActive] = useState<string | null>(null)

  const entries = Object.entries(envelope) as [string, string | number][]

  const activeGroup = active
    ? FIELD_GROUPS.find(g => g.fields.includes(active))
    : null

  return (
    <div>
      <p style={label()}>Envelope · hover a field to inspect</p>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'flex-start' }}>

        {/* JSON with colored fields */}
        <div style={{
          flex: '0 0 auto', background: C.raised, borderRadius: 8,
          padding: '12px 14px', fontSize: 11, lineHeight: 1.9,
          border: `1px solid ${C.border}`, minWidth: 0,
        }}>
          <span style={{ color: C.dim }}>{'{'}</span>
          {entries.map(([k, v]) => {
            const color = fieldColor(k)
            const isActive = active === k
            const val = typeof v === 'string' && v.length > 20
              ? `"${v.slice(0, 18)}…"` : JSON.stringify(v)
            return (
              <div
                key={k}
                onMouseEnter={() => setActive(k)}
                onMouseLeave={() => setActive(null)}
                style={{
                  paddingLeft: 14, cursor: 'default',
                  background: isActive ? `${color}18` : 'transparent',
                  borderRadius: 4, transition: 'background 0.1s',
                }}
              >
                <span style={{ color: isActive ? color : C.muted }}>&quot;{k}&quot;</span>
                <span style={{ color: C.dim }}>: </span>
                <span style={{ color: isActive ? color : C.dim }}>{val}</span>
              </div>
            )
          })}
          <span style={{ color: C.dim }}>{'}'}</span>
        </div>

        {/* Legend + active explanation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FIELD_GROUPS.map(g => {
            const isActive = g.fields.some(f => f === active)
            return (
              <div
                key={g.label}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: isActive ? `${g.color}15` : C.raised,
                  border: `1px solid ${isActive ? g.color : C.border}`,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ ...base, fontSize: 10, fontWeight: 700, color: g.color }}>
                  {g.label}
                </div>
                <div style={{ ...base, fontSize: 10, color: C.dim, marginTop: 2 }}>
                  {g.fields.join(', ')}
                </div>
                {isActive && (
                  <div style={{ ...base, fontSize: 10, color: C.muted, marginTop: 4,
                    borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                    {g.note}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Decryption Results ────────────────────────────────────────────────────────

function DecryptResults({
  envelope,
  contentKeys,
}: {
  envelope: Envelope
  contentKeys: Record<string, Uint8Array | null>
}) {
  const rows = ALL_WALLETS.map(w => {
    const ck = contentKeys[w.label]
    let result: { ok: boolean; text: string }
    if (!ck) {
      result = { ok: false, text: 'ACCESS DENIED — not in ACT' }
    } else {
      try {
        const plain = openGroupEnvelope(ck, envelope)
        result = { ok: true, text: `"${plain}"` }
      } catch {
        result = { ok: false, text: 'decryption failed' }
      }
    }
    return { wallet: w.label, ...result }
  })

  return (
    <div>
      <p style={label()}>Who can read?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {rows.map(r => (
          <div key={r.wallet} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 6,
            background: r.ok ? '#1a2e2240' : '#2e1a1a40',
            border: `1px solid ${r.ok ? '#2a5040' : '#5a2a2a'}`,
          }}>
            <span style={{ ...base, fontWeight: 700, color: C.text, minWidth: 64 }}>
              {r.wallet}
            </span>
            <span style={{ ...base, color: r.ok ? C.green : C.red }}>
              {r.ok ? '✓' : '✗'} {r.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

type SenderKey = 'Wallet A' | 'Wallet B' | 'Wallet C'
const SENDERS: SenderKey[] = ['Wallet A', 'Wallet B', 'Wallet C']
const senderMap: Record<SenderKey, typeof walletA> = {
  'Wallet A': walletA, 'Wallet B': walletB, 'Wallet C': walletC,
}

export default function App() {
  const [msg, setMsg] = useState('This message is for the group.')
  const [sender, setSender] = useState<SenderKey>('Wallet B')
  const [envelope, setEnvelope] = useState<Envelope | null>(null)

  const contentKeys = useMemo(() => ({
    'Wallet A': accessGroupChannel(walletA, INITIAL_EEE),
    'Wallet B': accessGroupChannel(walletB, INITIAL_EEE),
    'Wallet C': accessGroupChannel(walletC, INITIAL_EEE),
    'Wallet D': accessGroupChannel(walletD, INITIAL_EEE),
  }), [])

  function send() {
    const ck = contentKeys[sender]!
    const env = createGroupEnvelope(senderMap[sender], ck, INITIAL_EEE.channel_id, msg, 0)
    setEnvelope(env)
  }

  const divider: React.CSSProperties = {
    width: 1, background: C.border, flexShrink: 0, alignSelf: 'stretch',
  }

  return (
    <div style={{
      background: C.bg, color: C.text, minHeight: '100vh',
      fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
      fontSize: 12, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: '14px 28px',
        display: 'flex', alignItems: 'baseline', gap: 16,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, color: C.accent }}>
          WHISPERY
        </span>
        <span style={{ color: C.muted, fontSize: 11 }}>
          Level 0 · NFT-gated group channel · tokenId: WHISP-001
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>

        {/* ── Left: interactive ── */}
        <div style={{
          flex: 1, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0,
        }}>

          <IdentityTable />

          {/* Send */}
          <div>
            <p style={label()}>Send a message</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select
                value={sender}
                onChange={e => setSender(e.target.value as SenderKey)}
                style={{
                  background: C.raised, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, padding: '8px 10px',
                  fontFamily: 'inherit', fontSize: 12, outline: 'none',
                }}
              >
                {SENDERS.map(s => <option key={s}>{s} encrypts</option>)}
              </select>
              <input
                value={msg}
                onChange={e => setMsg(e.target.value)}
                style={{
                  flex: 1, background: C.raised, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, padding: '8px 10px',
                  fontFamily: 'inherit', fontSize: 12, outline: 'none',
                }}
              />
              <button
                onClick={send}
                style={{
                  background: C.accent, color: '#fff', border: 'none',
                  borderRadius: 6, padding: '8px 16px',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Encrypt & send
              </button>
            </div>
          </div>

          {envelope && (
            <DecryptResults envelope={envelope} contentKeys={contentKeys} />
          )}
        </div>

        <div style={divider} />

        {/* ── Right: explanation ── */}
        <div style={{
          flex: 1, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0,
          overflowY: 'auto',
        }}>

          <ACTTable eee={INITIAL_EEE} />

          {envelope
            ? <EnvelopeAnatomy envelope={envelope} />
            : (
              <div style={{
                padding: 20, borderRadius: 8, border: `1px dashed ${C.border}`,
                color: C.muted, textAlign: 'center', fontSize: 11,
              }}>
                Send a message to see the envelope anatomy
              </div>
            )
          }
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${C.border}`, padding: '8px 28px',
        color: C.muted, fontSize: 10, display: 'flex', gap: 24,
      }}>
        <span>Simulated wallets · no blockchain connection</span>
        <span>Swarm transport layer abstracted</span>
        <span>XSalsa20-Poly1305 · X25519 · HKDF-SHA256 · secp256k1</span>
      </div>
    </div>
  )
}
