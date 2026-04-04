/**
 * Sidebar — 4-section state monitor.
 * a. Agents Online
 * b. Context Window Usage
 * c. Memory Snapshot
 * d. ENS Identity Panel
 */

import { useOpenClawStore } from './store'
import { AGENT_COLORS } from './types'
import ENSIdentityPanel from './ENSIdentityPanel'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', color: '#475569',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

// ── a. Agents Online ──────────────────────────────────────────────────────────

function AgentsOnline() {
  const agents = useOpenClawStore(s => s.agents)

  const statusColor = (s: string) =>
    s === 'active'   ? '#10b981' :
    s === 'thinking' ? '#f59e0b' : '#475569'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Object.values(agents).map(agent => {
        const c = AGENT_COLORS[agent.id]
        return (
          <div key={agent.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0',
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusColor(agent.status), flexShrink: 0,
            }} />
            <span style={{ ...mono, fontSize: 11, color: c.text, fontWeight: 600 }}>
              {agent.label}
            </span>
            <span style={{ ...mono, fontSize: 9, color: '#475569', flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.ensName}
            </span>
            {agent.isHuman && (
              <span style={{
                ...mono, fontSize: 8, color: '#fb7185',
                border: '1px solid #fb718566', borderRadius: 3,
                padding: '0 4px', flexShrink: 0,
              }}>
                HUMAN
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── b. Context Window Usage ───────────────────────────────────────────────────

function TokenBar({ agentId }: { agentId: string }) {
  const agent = useOpenClawStore(s => s.agents[agentId])
  if (!agent) return null

  const c      = AGENT_COLORS[agent.id]
  const pct    = Math.min(1, agent.tokenCount / agent.maxTokens)
  const pctInt = Math.round(pct * 100)

  const barColor =
    pct < 0.6  ? '#10b981' :
    pct < 0.85 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ ...mono, fontSize: 10, color: c.text }}>{agent.label}</span>
        <span style={{ ...mono, fontSize: 9, color: '#475569' }}>
          {agent.tokenCount.toLocaleString()} / {agent.maxTokens.toLocaleString()}
        </span>
      </div>
      <div style={{
        height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pctInt}%`,
          background: barColor, borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── c. Memory Snapshot ────────────────────────────────────────────────────────

function MemorySnapshot() {
  const mem = useOpenClawStore(s => s.memoryVars)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {Object.entries(mem).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{
            ...mono, fontSize: 9, color: '#475569', fontWeight: 700,
            minWidth: 90, flexShrink: 0, paddingTop: 1,
          }}>
            {k}
          </span>
          <span style={{
            ...mono, fontSize: 9, color: v === null ? '#334155' : '#94a3b8',
            wordBreak: 'break-all',
          }}>
            {v === null ? 'null' : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const C = {
    bg:      '#0b0b0e',
    surface: '#13131a',
    raised:  '#1a1a24',
    border:  '#25253a',
  }

  const section: React.CSSProperties = {
    background: C.raised,
    border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '12px 14px',
    marginBottom: 12,
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      overflowY: 'auto', paddingRight: 2,
    }}>
      {/* a. Agents Online */}
      <div style={section}>
        <SectionTitle>Agents Online</SectionTitle>
        <AgentsOnline />
      </div>

      {/* b. Context Window */}
      <div style={section}>
        <SectionTitle>Context Window Usage</SectionTitle>
        <TokenBar agentId="betty" />
        <TokenBar agentId="caroline" />
      </div>

      {/* c. Memory Snapshot */}
      <div style={section}>
        <SectionTitle>Memory Snapshot</SectionTitle>
        <MemorySnapshot />
      </div>

      {/* d. ENS Identity Panel */}
      <div style={section}>
        <SectionTitle>ENS Identities</SectionTitle>
        <ENSIdentityPanel />
      </div>
    </div>
  )
}
