/**
 * AttestationToast — fixed bottom-right toast showing the auto-attestation state.
 *
 * States:
 *   building   → "Generando reputación para <name>..."
 *   signing    → "Firmando en MetaMask..."
 *   submitted  → "★★★★★  Reputación enviada  [Etherscan →]"
 *   skipped    → "Sin mensajes suficientes"  (auto-dismissed by parent after 3s)
 */

const C = {
  raised:  '#1a1a24',
  border:  '#25253a',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
  green:   '#3ddc97',
  yellow:  '#ffc83d',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

export type ToastState = 'building' | 'signing' | 'submitted' | 'skipped'

interface Props {
  state:     ToastState
  agentName: string
  score:     number       // 1–5, used in submitted state
  txHash:    string
  onDismiss: () => void
}

export default function AttestationToast({ state, agentName, score, txHash, onDismiss }: Props) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 400,
      background: C.raised, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      maxWidth: 320, minWidth: 260,
    }}>

      {/* Dismiss */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...mono, fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Proof of Useful Conversation
        </span>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ ...mono, fontSize: 12 }}>
        {state === 'building' && (
          <span style={{ color: C.muted }}>
            ◌ Generando reputación para <span style={{ color: C.accent }}>{agentName}</span>…
          </span>
        )}
        {state === 'signing' && (
          <span style={{ color: C.yellow }}>◌ Firmando en MetaMask…</span>
        )}
        {state === 'submitted' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: C.green, fontWeight: 700 }}>
              {'★'.repeat(score)}{'☆'.repeat(5 - score)}{'  '}Reputación enviada
            </span>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.accent, fontSize: 10 }}
            >
              {txHash.slice(0, 18)}… ver en Etherscan →
            </a>
          </div>
        )}
        {state === 'skipped' && (
          <span style={{ color: C.muted }}>Sin mensajes suficientes</span>
        )}
      </div>
    </div>
  )
}
