/**
 * MemberPill — displays a single channel member.
 * If the member is a verified agent, shows a 🤖 badge.
 * Hovering the badge opens an inline agent card popover.
 */

import { useState }                   from 'react'
import type { MemberIdentity }         from './useMemberIdentities'

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

export default function MemberPill({ identity }: { identity: MemberIdentity }) {
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
