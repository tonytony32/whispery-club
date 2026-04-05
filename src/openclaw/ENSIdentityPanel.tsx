/**
 * ENSIdentityPanel — shows ENS name + wallet + tokenId for each participant.
 * Calls resolveDisplayName() from ensDisplay.ts for live resolution.
 * Falls back to hardcoded values if RPC is unavailable.
 */

import { useEffect } from 'react'
import { resolveDisplayName } from '../omnibar/ensDisplay'
import { useOpenClawStore } from './store'
import { AGENT_IDENTITIES, AGENT_COLORS } from './types'
import { ENSIP25Badge } from './ENSIP25Badge'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

const ORDERED: Array<'alice' | 'betty' | 'caroline'> = ['alice', 'betty', 'caroline']

export default function ENSIdentityPanel() {
  const resolvedNames  = useOpenClawStore(s => s.resolvedNames)
  const setResolvedName = useOpenClawStore(s => s.setResolvedName)

  // Attempt live ENS resolution for each agent wallet
  useEffect(() => {
    for (const id of ORDERED) {
      const agent = AGENT_IDENTITIES[id]
      resolveDisplayName(agent.wallet).then(name => {
        setResolvedName(agent.wallet, name)
      }).catch(() => {/* silent — fallback to hardcoded */})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ORDERED.map(id => {
        const agent = AGENT_IDENTITIES[id]
        const c     = AGENT_COLORS[id]
        const displayName = resolvedNames[agent.wallet] ?? agent.ensName

        return (
          <div key={id} style={{
            background: '#0f172a', border: `1px solid ${c.border}22`,
            borderLeft: `3px solid ${c.border}`,
            borderRadius: 5, padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: c.text }}>
                {displayName}
              </span>
              {agent.isHuman && (
                <span style={{
                  ...mono, fontSize: 8, fontWeight: 700,
                  background: '#fb718533', color: '#fb7185',
                  border: '1px solid #fb718566',
                  padding: '1px 5px', borderRadius: 3,
                }}>
                  ADMIN
                </span>
              )}
              <span style={{
                marginLeft: 'auto',
                ...mono, fontSize: 9, color: '#475569',
              }}>
                tokenId #{agent.tokenId}
              </span>
              {!agent.isHuman && (
                <ENSIP25Badge
                  ensName={agent.ensName}
                  tokenId={agent.tokenId}
                  tooltip={
                    agent.erc8004AgentId && agent.erc8004CID
                      ? `${agent.ensName} · agentId #${agent.erc8004AgentId} · ipfs://${agent.erc8004CID}`
                      : undefined
                  }
                />
              )}
            </div>
            <span style={{ ...mono, fontSize: 9, color: '#475569' }}>
              {agent.wallet.slice(0, 6)}…{agent.wallet.slice(-4)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
