/**
 * MemberPill — displays a single channel member.
 * If the member is a verified agent, shows a 🤖 badge.
 * Hovering the badge opens an inline agent card popover.
 */

import { useState }                              from 'react'
import type { MemberIdentity, ReputationEntry } from './useMemberIdentities'

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds
  if (diff <    60) return 'ahora mismo'
  if (diff <  3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  if (days  <    7) return `hace ${days} día${days > 1 ? 's' : ''}`
  return new Date(unixSeconds * 1000).toLocaleDateString('es-ES')
}

function StarDisplay({ score }: { score: number }) {
  const full = Math.round(score)
  return (
    <span style={{ letterSpacing: 1 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= full ? '#ffc83d' : '#3a3a55', fontSize: 10 }}>
          {n <= full ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

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

export default function MemberPill({ identity, onRate }: { identity: MemberIdentity; onRate?: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ ...mono, fontSize: 11, color: C.muted }}>
        {identity.displayName}
      </span>

      {identity.isAgent && (
        <>
          <span
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              ...mono, fontSize: 9, cursor: 'default',
              padding: '1px 5px', borderRadius: 3,
              background: identity.ensip25Verified ? C.dim      : '#2a2000',
              color:      identity.ensip25Verified ? C.muted     : C.yellow,
              border: `1px solid ${identity.ensip25Verified ? C.border : C.yellow + '44'}`,
              userSelect: 'none',
            }}
          >
            🤖 {identity.ensip25Verified ? 'Agent' : 'Unverified Agent'}
          </span>

          {hovered && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0,
              marginBottom: 6, zIndex: 100,
              background: C.raised, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '10px 14px',
              width: 260, display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}>
              <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: C.text }}>
                {identity.displayName}
              </div>

              {identity.ensip25Verified ? (
                <div style={{ ...mono, fontSize: 9, color: C.accent }}>
                  ✓ ENSIP-25 verified · ERC-8004 #{identity.agentId}
                </div>
              ) : (
                <div style={{ ...mono, fontSize: 9, color: C.yellow }}>
                  ⚠ ERC-8004 registered but ENSIP-25 bidirectional check failed
                </div>
              )}

              {identity.agentCard && (
                <>
                  <div style={{ ...mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                    {identity.agentCard.description}
                  </div>
                  {identity.agentCard.version && (
                    <div style={{ ...mono, fontSize: 9, color: C.dim }}>
                      v{identity.agentCard.version}
                    </div>
                  )}
                  {identity.agentCard.capabilities && identity.agentCard.capabilities.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {identity.agentCard.capabilities.map(cap => (
                        <span key={cap} style={{
                          ...mono, fontSize: 9,
                          background: C.dim, color: C.muted,
                          padding: '1px 5px', borderRadius: 3,
                        }}>{cap}</span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Reputation */}
              {identity.reputation !== null && (() => {
                const rep = identity.reputation!
                return (
                  <div style={{ borderTop: `1px solid ${C.dim}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ ...mono, fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                      Reputación on-chain
                    </div>
                    {rep.entries.length === 0 ? (
                      <div style={{ ...mono, fontSize: 9, color: C.dim }}>
                        Sin valoraciones todavía. Sé el primero.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <StarDisplay score={rep.avgScore ?? 0} />
                          <span style={{ ...mono, fontSize: 9, color: C.muted }}>
                            {rep.avgScore?.toFixed(1)} ({rep.entries.length})
                          </span>
                        </div>
                        {rep.entries.slice(-3).reverse().map((e: ReputationEntry, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StarDisplay score={e.score} />
                            <span style={{ ...mono, fontSize: 8, color: C.dim }}>
                              {relativeTime(e.timestamp)}
                            </span>
                            {e.feedbackURI && (
                              <a
                                href={e.feedbackURI.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                                target="_blank" rel="noopener noreferrer"
                                style={{ ...mono, fontSize: 8, color: C.accent }}
                              >
                                evidencia →
                              </a>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    {onRate && (
                      <button
                        onClick={e => { e.stopPropagation(); onRate() }}
                        style={{
                          ...mono, fontSize: 9, background: 'none',
                          border: `1px solid ${C.dim}`, borderRadius: 3,
                          padding: '2px 8px', color: C.accent, cursor: 'pointer',
                          alignSelf: 'flex-start', marginTop: 2,
                        }}
                      >
                        Valorar
                      </button>
                    )}
                  </div>
                )
              })()}

              {identity.agentId !== null && (
                <a
                  href={`https://sepolia.etherscan.io/token/${
                    (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_ERC8004_REGISTRY
                    ?? '0x7177a6867296406881E20d6647232314736Dd09A'
                  }?a=${identity.agentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...mono, fontSize: 9, color: C.accent }}
                >
                  View on Etherscan →
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
