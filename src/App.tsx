/**
 * Whispery — Level 0 | React Demo App
 *
 * Panel izquierdo: Escenario A — Canal P2P (Wallet A ↔ Wallet B)
 * Panel derecho:   Escenario B — Canal de grupo gateado por NFT
 *                  (A, B, C autorizadas · D denegada)
 */

import { useState, useMemo } from 'react'
import {
  createWallet,
  DEMO_PRIVATE_KEYS,
  createP2PEnvelope,
  openP2PEnvelope,
  createGroupChannel,
  accessGroupChannel,
  createGroupEnvelope,
  openGroupEnvelope,
  type Envelope,
} from './core/crypto'

// ── Wallets inicializadas una sola vez ────────────────────────────────────────
const walletA = createWallet(DEMO_PRIVATE_KEYS.A, 'Wallet A')
const walletB = createWallet(DEMO_PRIVATE_KEYS.B, 'Wallet B')
const walletC = createWallet(DEMO_PRIVATE_KEYS.C, 'Wallet C')
const walletD = createWallet(DEMO_PRIVATE_KEYS.D, 'Wallet D')

// ── EEE inicializado una sola vez (A, B, C autorizadas) ───────────────────────
const { eee: initialEEE } = createGroupChannel(
  walletA,
  [walletA, walletB, walletC],
  'WHISP-001',
  0,
)

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0d0d0f',
  surface: '#16161a',
  border: '#2a2a35',
  text: '#e8e8f0',
  muted: '#6b6b85',
  accent: '#7c6aff',
  green: '#3ddc97',
  red: '#ff5a5a',
  yellow: '#ffc83d',
  code: '#1e1e28',
}

const s: Record<string, React.CSSProperties> = {
  root: {
    background: C.bg,
    color: C.text,
    minHeight: '100vh',
    fontFamily: '"IBM Plex Mono", "Fira Code", "Courier New", monospace',
    fontSize: 13,
    padding: '24px 20px',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 2,
    color: C.accent,
    margin: 0,
  },
  subtitle: {
    color: C.muted,
    margin: '6px 0 0',
    fontSize: 12,
  },
  panels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    maxWidth: 1200,
    margin: '0 auto',
  },
  panel: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    color: C.accent,
    margin: 0,
    textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: 10,
  },
  walletRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  walletTag: (authorized: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 700,
    background: authorized ? '#1a2e22' : '#2e1a1a',
    color: authorized ? C.green : C.red,
    border: `1px solid ${authorized ? '#2a5040' : '#5a2a2a'}`,
  }),
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    background: C.code,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.text,
    padding: '8px 10px',
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
  },
  btn: {
    background: C.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    padding: '8px 14px',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  select: {
    background: C.code,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.text,
    padding: '8px 10px',
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
  },
  resultBox: {
    background: C.code,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  resultRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  resultLabel: {
    minWidth: 72,
    color: C.muted,
    fontSize: 11,
  },
  resultValue: (ok: boolean): React.CSSProperties => ({
    color: ok ? C.green : C.red,
    fontWeight: 700,
    fontSize: 12,
    wordBreak: 'break-all' as const,
  }),
  envelopeToggle: {
    background: 'none',
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.muted,
    padding: '4px 10px',
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  envelopeJson: {
    background: C.code,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: '10px 12px',
    fontSize: 10,
    color: C.muted,
    overflowX: 'auto' as const,
    maxHeight: 220,
    overflowY: 'auto' as const,
  },
  sectionLabel: {
    color: C.muted,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  arrow: {
    color: C.muted,
    fontSize: 14,
  },
}

// ── Panel A: P2P ──────────────────────────────────────────────────────────────

function P2PPanel() {
  const [msg, setMsg] = useState('Hola Bob, esto es privado.')
  const [envelope, setEnvelope] = useState<Envelope | null>(null)
  const [decrypted, setDecrypted] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)

  function send() {
    const env = createP2PEnvelope(walletA, walletB.x25519.publicKey, msg, 0)
    const plain = openP2PEnvelope(walletB, walletA.x25519.publicKey, env)
    setEnvelope(env)
    setDecrypted(plain)
    setShowJson(false)
  }

  return (
    <div style={s.panel}>
      <p style={s.panelTitle}>Escenario A — Canal P2P</p>

      {/* Participantes */}
      <div>
        <p style={{ ...s.sectionLabel, marginBottom: 8 }}>Participantes</p>
        <div style={s.walletRow}>
          <span style={s.walletTag(true)}>Wallet A</span>
          <span style={s.arrow}>→ cifra</span>
          <span style={s.walletTag(true)}>Wallet B</span>
          <span style={s.arrow}>→ descifra</span>
        </div>
        <div style={{ marginTop: 6, color: C.muted, fontSize: 11 }}>
          <div>A: {walletA.ethAddress.slice(0, 10)}…</div>
          <div>B: {walletB.ethAddress.slice(0, 10)}…</div>
        </div>
      </div>

      {/* Input */}
      <div>
        <p style={{ ...s.sectionLabel, marginBottom: 6 }}>Mensaje de A para B</p>
        <div style={s.inputRow}>
          <input
            style={s.input}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Escribe un mensaje…"
          />
          <button style={s.btn} onClick={send}>Cifrar y enviar</button>
        </div>
      </div>

      {/* Resultado */}
      {envelope && decrypted !== null && (
        <>
          <div>
            <p style={{ ...s.sectionLabel, marginBottom: 6 }}>Resultado</p>
            <div style={s.resultBox}>
              <div style={s.resultRow}>
                <span style={s.resultLabel}>Wallet B lee:</span>
                <span style={s.resultValue(true)}>"{decrypted}"</span>
              </div>
              <div style={s.resultRow}>
                <span style={s.resultLabel}>channel_id:</span>
                <span style={{ color: C.muted, fontSize: 11, wordBreak: 'break-all' }}>
                  {envelope.channel_id.slice(0, 20)}…
                </span>
              </div>
              <div style={s.resultRow}>
                <span style={s.resultLabel}>epoch:</span>
                <span style={{ color: C.yellow, fontSize: 11 }}>{envelope.epoch}</span>
              </div>
              <div style={s.resultRow}>
                <span style={s.resultLabel}>timestamp:</span>
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {new Date(envelope.timestamp).toISOString()}
                </span>
              </div>
            </div>
          </div>

          <div>
            <button style={s.envelopeToggle} onClick={() => setShowJson(v => !v)}>
              {showJson ? '▲ ocultar envelope' : '▼ ver envelope JSON'}
            </button>
            {showJson && (
              <pre style={s.envelopeJson}>{JSON.stringify(envelope, null, 2)}</pre>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Panel B: Grupo NFT ────────────────────────────────────────────────────────

type SenderKey = 'A' | 'B' | 'C'

const senderMap = { A: walletA, B: walletB, C: walletC } as const

interface GroupResult {
  envelope: Envelope
  results: { label: string; ok: boolean; text: string }[]
}

function GroupPanel() {
  const [msg, setMsg] = useState('Mensaje secreto del grupo.')
  const [sender, setSender] = useState<SenderKey>('B')
  const [result, setResult] = useState<GroupResult | null>(null)
  const [showEEE, setShowEEE] = useState(false)
  const [showEnv, setShowEnv] = useState(false)

  // content keys derivadas desde el EEE inicial
  const contentKeys = useMemo(() => ({
    A: accessGroupChannel(walletA, initialEEE),
    B: accessGroupChannel(walletB, initialEEE),
    C: accessGroupChannel(walletC, initialEEE),
    D: accessGroupChannel(walletD, initialEEE),
  }), [])

  function send() {
    const senderWallet = senderMap[sender]
    const ck = contentKeys[sender]
    if (!ck) return // shouldn't happen for A/B/C

    const env = createGroupEnvelope(senderWallet, ck, initialEEE.channel_id, msg, 0)

    const members: { label: string; key: 'A' | 'B' | 'C' | 'D' }[] = [
      { label: 'Wallet A', key: 'A' },
      { label: 'Wallet B', key: 'B' },
      { label: 'Wallet C', key: 'C' },
      { label: 'Wallet D', key: 'D' },
    ]

    const results = members.map(({ label, key }) => {
      const ck = contentKeys[key]
      if (!ck) return { label, ok: false, text: '✗ ACCESO DENEGADO — no está en la ACT' }
      try {
        const plain = openGroupEnvelope(ck, env)
        return { label, ok: true, text: `✓ "${plain}"` }
      } catch {
        return { label, ok: false, text: '✗ Error al descifrar' }
      }
    })

    setResult({ envelope: env, results })
    setShowEnv(false)
  }

  return (
    <div style={s.panel}>
      <p style={s.panelTitle}>Escenario B — Canal de Grupo · NFT tokenId: WHISP-001</p>

      {/* Miembros */}
      <div>
        <p style={{ ...s.sectionLabel, marginBottom: 8 }}>Control de acceso (ACT)</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[
            { label: 'Wallet A', ok: true },
            { label: 'Wallet B', ok: true },
            { label: 'Wallet C', ok: true },
            { label: 'Wallet D', ok: false },
          ].map(({ label, ok }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={s.walletTag(ok)}>{label}</span>
              <span style={{ fontSize: 10, color: ok ? C.green : C.red }}>
                {ok ? '✓ en ACT' : '✗ fuera'}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, color: C.muted, fontSize: 11 }}>
          channel_id: {initialEEE.channel_id.slice(0, 20)}… · epoch: {initialEEE.epoch}
        </div>
      </div>

      {/* Input */}
      <div>
        <p style={{ ...s.sectionLabel, marginBottom: 6 }}>Enviar mensaje</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select style={s.select} value={sender} onChange={e => setSender(e.target.value as SenderKey)}>
            <option value="A">Wallet A cifra</option>
            <option value="B">Wallet B cifra</option>
            <option value="C">Wallet C cifra</option>
          </select>
        </div>
        <div style={s.inputRow}>
          <input
            style={s.input}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Escribe un mensaje…"
          />
          <button style={s.btn} onClick={send}>Cifrar y enviar</button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <>
          <div>
            <p style={{ ...s.sectionLabel, marginBottom: 6 }}>
              ¿Quién puede leer? — cifrado por Wallet {sender}
            </p>
            <div style={s.resultBox}>
              {result.results.map(({ label, ok, text }) => (
                <div key={label} style={s.resultRow}>
                  <span style={{ ...s.resultLabel, color: ok ? C.text : C.muted }}>{label}:</span>
                  <span style={s.resultValue(ok)}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.envelopeToggle} onClick={() => setShowEnv(v => !v)}>
              {showEnv ? '▲ ocultar envelope' : '▼ ver envelope JSON'}
            </button>
            <button style={s.envelopeToggle} onClick={() => setShowEEE(v => !v)}>
              {showEEE ? '▲ ocultar EEE' : '▼ ver EEE JSON'}
            </button>
          </div>
          {showEnv && (
            <pre style={s.envelopeJson}>{JSON.stringify(result.envelope, null, 2)}</pre>
          )}
          {showEEE && (
            <pre style={s.envelopeJson}>{JSON.stringify(initialEEE, null, 2)}</pre>
          )}
        </>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div style={s.root}>
      <header style={s.header}>
        <h1 style={s.title}>WHISPERY</h1>
        <p style={s.subtitle}>
          Level 0 · Ciclo criptográfico · X25519 · HKDF-SHA256 · secp256k1 · ACT
        </p>
      </header>

      <div style={s.panels}>
        <P2PPanel />
        <GroupPanel />
      </div>

      <footer style={{ textAlign: 'center', marginTop: 28, color: C.muted, fontSize: 11 }}>
        Wallets simuladas · sin blockchain · capa Swarm abstracta · solo lógica criptográfica
      </footer>
    </div>
  )
}
