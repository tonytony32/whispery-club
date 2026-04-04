/**
 * AgentFeedback — modal for submitting a reputation rating to the
 * ERC-8004 Reputation Registry on-chain.
 *
 * Flow: idle → building → uploading → signing → submitted | error
 *
 * Attaches cryptographic evidence (outer envelope hashes + signatures) to
 * the IPFS payload so the rating is verifiable without revealing content.
 */

import { useState }      from 'react'
import { ethers }        from 'ethers'
import type { MemberIdentity } from './useMemberIdentities'
import type { ChatMessage }    from '../transport/useMessenger'
import { buildEvidence }       from './reputationEvidence'
import { uploadJSON }          from '../core/ipfs'

// ── Config ────────────────────────────────────────────────────────────────────

const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env

const REPUTATION_REGISTRY =
  ENV.VITE_ERC8004_REPUTATION ?? '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322'

const REPUTATION_ABI = [
  'function giveFeedback(uint256 agentId, int8 score, string calldata feedbackURI) external',
]

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0b0b0e',
  raised:  '#1a1a24',
  surface: '#13131a',
  border:  '#25253a',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
  green:   '#3ddc97',
  yellow:  '#ffc83d',
  red:     '#ff5a5a',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowState = 'idle' | 'building' | 'uploading' | 'signing' | 'submitted' | 'error'

interface Props {
  identity:     MemberIdentity
  messages:     ChatMessage[]
  channelId:    string
  epoch:        number
  humanAddress: string
  onClose:      () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentFeedback({
  identity, messages, channelId, epoch, humanAddress, onClose,
}: Props) {
  const [score,           setScore]           = useState(0)
  const [comment,         setComment]         = useState('')
  const [flowState,       setFlowState]       = useState<FlowState>('idle')
  const [errorMsg,        setErrorMsg]        = useState('')
  const [txHash,          setTxHash]          = useState('')
  const [evidenceExpanded, setEvidenceExpanded] = useState(false)
  const [showHashes,      setShowHashes]      = useState(false)

  const evidenceCount = messages.filter(m => m.envelope).length

  // ── Submit flow ─────────────────────────────────────────────────────────────

  async function submit() {
    if (score === 0 || flowState !== 'idle') return

    try {
      // 1. Build evidence
      setFlowState('building')
      const envelopes = messages.filter(m => m.envelope).map(m => m.envelope!)
      const evidence = buildEvidence(envelopes, identity.address, humanAddress, channelId, epoch)

      const payload = {
        agentId:         identity.agentId,
        agentName:       identity.agentCard?.name ?? identity.displayName,
        score,
        comment:         comment.trim() || undefined,
        evidence,
        reviewerAddress: humanAddress,
      }

      // 2. Upload to IPFS
      setFlowState('uploading')
      let feedbackURI: string
      try {
        feedbackURI = await uploadJSON(payload, `whispery-feedback-agent-${identity.agentId}`)
      } catch (e) {
        setFlowState('error')
        setErrorMsg(`IPFS upload failed: ${e instanceof Error ? e.message : String(e)}`)
        return
      }

      // 3. Get signer + submit tx
      setFlowState('signing')
      const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
      if (!eth) {
        setFlowState('error')
        setErrorMsg('No Ethereum wallet found.')
        return
      }

      const provider = new ethers.BrowserProvider(eth)
      const signer   = await provider.getSigner()
      const registry = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, signer)

      let tx: ethers.ContractTransactionResponse
      try {
        tx = await registry.giveFeedback(identity.agentId!, score, feedbackURI)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED')) {
          setFlowState('idle')
          return
        }
        setFlowState('error')
        setErrorMsg(`Transaction reverted: ${msg.slice(0, 120)}`)
        return
      }

      await tx.wait()
      setTxHash(tx.hash)
      setFlowState('submitted')

    } catch (e) {
      setFlowState('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const busy = flowState !== 'idle' && flowState !== 'submitted' && flowState !== 'error'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.raised, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '24px 28px', width: 400,
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: C.text }}>
              🤖 {identity.displayName}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: 9, color: C.accent }}>
                ERC-8004 #{identity.agentId}
              </span>
              <a
                href={`https://sepolia.etherscan.io/token/${REPUTATION_REGISTRY}?a=${identity.agentId}`}
                target="_blank" rel="noopener noreferrer"
                style={{ ...mono, fontSize: 9, color: C.muted }}
              >
                registry →
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Stars */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              onClick={() => !busy && setScore(n)}
              style={{
                fontSize: 28, cursor: busy ? 'default' : 'pointer',
                color: n <= score ? C.yellow : C.dim,
                transition: 'color 0.1s',
                userSelect: 'none',
              }}
            >
              {n <= score ? '★' : '☆'}
            </span>
          ))}
        </div>

        {/* Comment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, 280))}
            disabled={busy}
            placeholder="¿Qué hizo bien o mal este agente?"
            rows={3}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 10px', color: C.text,
              ...mono, fontSize: 11, resize: 'vertical',
              outline: 'none', opacity: busy ? 0.5 : 1,
            }}
          />
          <span style={{ ...mono, fontSize: 9, color: C.muted, textAlign: 'right' }}>
            {comment.length}/280
          </span>
        </div>

        {/* Evidence section */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '8px 12px',
        }}>
          <button
            onClick={() => setEvidenceExpanded(x => !x)}
            style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
              ...mono, fontSize: 10, padding: 0, display: 'flex', gap: 6, alignItems: 'center',
              width: '100%', textAlign: 'left',
            }}
          >
            <span>{evidenceExpanded ? '▾' : '▸'}</span>
            <span>Evidencia criptográfica</span>
          </button>
          {evidenceExpanded && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ ...mono, fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
                Se adjuntarán <span style={{ color: C.accent }}>{evidenceCount}</span> pruebas
                criptográficas de esta conversación. El contenido de los mensajes no se revela.
              </div>
              <button
                onClick={() => setShowHashes(x => !x)}
                style={{
                  background: 'none', border: 'none', color: C.dim,
                  cursor: 'pointer', ...mono, fontSize: 9, padding: 0, textAlign: 'left',
                }}
              >
                {showHashes ? 'Ocultar hashes' : 'Ver hashes'}
              </button>
              {showHashes && (
                <div style={{
                  background: C.bg, borderRadius: 4, padding: '6px 8px',
                  maxHeight: 100, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {messages
                    .filter(m => m.envelope)
                    .slice(-20)
                    .map((m, i) => (
                      <span key={i} style={{ ...mono, fontSize: 8, color: C.dim, wordBreak: 'break-all' }}>
                        {i + 1}. {m.envelope!.signature.slice(0, 32)}…
                      </span>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        {flowState !== 'idle' && (
          <div style={{ ...mono, fontSize: 10, textAlign: 'center', padding: '4px 0' }}>
            {flowState === 'building'  && <span style={{ color: C.muted }}>◌ Construyendo evidencia…</span>}
            {flowState === 'uploading' && <span style={{ color: C.muted }}>◌ Subiendo a IPFS…</span>}
            {flowState === 'signing'   && <span style={{ color: C.yellow }}>◌ Confirma en MetaMask…</span>}
            {flowState === 'submitted' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                <span style={{ color: C.green, fontWeight: 700 }}>✓ Valoración enviada</span>
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: C.accent, fontSize: 9 }}
                >
                  {txHash.slice(0, 20)}… ver en Etherscan →
                </a>
              </div>
            )}
            {flowState === 'error' && (
              <span style={{ color: C.red }}>{errorMsg}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {flowState === 'error' && (
            <button
              onClick={() => { setFlowState('idle'); setErrorMsg('') }}
              style={{
                flex: 1, background: 'none', border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '9px 0', color: C.muted,
                ...mono, fontSize: 11, cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          )}
          {flowState !== 'submitted' && (
            <button
              onClick={submit}
              disabled={score === 0 || busy}
              style={{
                flex: 1, background: score > 0 && !busy ? C.accent : C.dim,
                border: 'none', borderRadius: 6, padding: '9px 0',
                color: '#fff', ...mono, fontSize: 11, fontWeight: 700,
                cursor: score > 0 && !busy ? 'pointer' : 'default',
              }}
            >
              {busy ? '…' : 'Enviar valoración on-chain'}
            </button>
          )}
          {flowState === 'submitted' && (
            <button
              onClick={onClose}
              style={{
                flex: 1, background: C.green, border: 'none', borderRadius: 6,
                padding: '9px 0', color: C.bg, ...mono, fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
