/**
 * AgentBanner — shown once per channel when ≥1 verified agent is present.
 * Dismissed with X, stored in sessionStorage so it doesn't reappear.
 * Neutral styling — informative, not alarming.
 */

import { useState }       from 'react'
import type { MemberIdentity, AgentCard } from './useMemberIdentities'

const C = {
  raised:  '#1a1a24',
  border:  '#25253a',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

// ── AgentCardPanel ─────────────────────────────────────────────────────────────

function AgentCardPanel({ identity, onClose }: { identity: MemberIdentity; onClose: () => void }) {
  const card = identity.agentCard
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.raised, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '24px 28px',
        width: 380, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: C.text }}>
            🤖 {identity.displayName}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.muted,
            cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
        {identity.ensip25Verified && (
          <span style={{ ...mono, fontSize: 10, color: C.accent }}>
            ✓ ENSIP-25 verified · ERC-8004 #{identity.agentId}
          </span>
        )}
        {card ? (
          <>
            <div style={{ ...mono, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              {card.description}
            </div>
            {card.version && (
              <div style={{ ...mono, fontSize: 11, color: C.dim }}>
                Version: {card.version}
              </div>
            )}
            {card.capabilities && card.capabilities.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {card.capabilities.map(cap => (
                  <span key={cap} style={{
                    ...mono, fontSize: 10,
                    background: C.dim, color: C.muted,
                    padding: '2px 8px', borderRadius: 4,
                  }}>{cap}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ ...mono, fontSize: 11, color: C.dim }}>
            No agent card available.
          </div>
        )}
        {identity.agentId !== null && (
          <a
            href={`https://sepolia.etherscan.io/token/${import.meta.env.VITE_ERC8004_REGISTRY ?? '0x7177a6867296406881E20d6647232314736Dd09A'}?a=${identity.agentId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...mono, fontSize: 10, color: C.accent }}
          >
            View on Etherscan →
          </a>
        )}
      </div>
    </div>
  )
}

// ── AgentBanner ────────────────────────────────────────────────────────────────

interface Props {
  agents:    MemberIdentity[]
  channelId: string
}

export default function AgentBanner({ agents, channelId }: Props) {
  const storageKey = `whispery:agent-banner-dismissed:${channelId}`
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(storageKey) === '1'
  )
  const [cardAgent, setCardAgent] = useState<MemberIdentity | null>(null)

  if (dismissed || agents.length === 0) return null

  function dismiss() {
    sessionStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  const n     = agents.length
  const names = agents.map(a => a.displayName).join(', ')

  return (
    <>
      <div style={{
        ...mono, fontSize: 11,
        background: C.raised,
        border: `1px solid ${C.border}`,
        borderRadius: 8, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        color: C.muted, lineHeight: 1.5,
        marginBottom: 8,
      }}>
        <span style={{ flex: 1 }}>
          🤖 This channel includes {n} autonomous agent{n > 1 ? 's' : ''} ({names}).
          {' '}Messages are cryptographically signed and identity is verifiable on-chain.
        </span>
        <button
          onClick={() => setCardAgent(agents[0])}
          style={{
            ...mono, fontSize: 10, background: 'none',
            border: `1px solid ${C.dim}`, borderRadius: 4,
            padding: '3px 8px', color: C.muted, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          View agents
        </button>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none',
            color: C.dim, cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {cardAgent && (
        <AgentCardPanel identity={cardAgent} onClose={() => setCardAgent(null)} />
      )}
    </>
  )
}
