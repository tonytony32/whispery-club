/**
 * AgentBubble — renders a single AgentMessage in the thread view.
 * Handles all four kinds: message, thought, action, directive.
 */

import { useState } from 'react'
import type { AgentMessage } from './types'
import { AGENT_COLORS } from './types'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 11,
}

function fmt(ts: number): string {
  const d = new Date(ts)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':')
}

function truncWallet(w: string): string {
  if (!w || w.length < 10) return w
  return w.slice(0, 6) + '…' + w.slice(-4)
}

interface Props {
  msg:   AgentMessage
  depth: number
}

export default function AgentBubble({ msg, depth }: Props) {
  const [expanded, setExpanded] = useState(false)
  const c = AGENT_COLORS[msg.agentId]

  const indent = depth * 24
  const connectorColor = c.border

  // ── Directive ──────────────────────────────────────────────────────────────
  if (msg.kind === 'directive') {
    return (
      <div style={{ marginLeft: indent, marginBottom: 10 }}>
        {depth > 0 && <ConnectorLine color={connectorColor} />}
        <div style={{
          background: '#422006', border: '1px solid #f59e0b',
          borderRadius: 6, padding: '10px 16px',
          color: '#fcd34d', fontWeight: 700,
          ...mono, fontSize: 12,
        }}>
          <span style={{ color: '#fbbf24', marginRight: 8 }}>⚡ DIRECTIVA</span>
          {msg.content}
          <BubbleFooter msg={msg} c={c} />
        </div>
      </div>
    )
  }

  // ── Thought ────────────────────────────────────────────────────────────────
  if (msg.kind === 'thought') {
    return (
      <div style={{ marginLeft: indent, marginBottom: 8 }}>
        {depth > 0 && <ConnectorLine color={connectorColor} />}
        <div
          onClick={() => setExpanded(x => !x)}
          style={{
            background: '#0f172a', borderLeft: '2px solid #334155',
            borderRadius: 4, padding: '6px 12px',
            cursor: 'pointer', color: '#64748b',
            ...mono, fontStyle: 'italic',
          }}
        >
          <span style={{ marginRight: 6, fontSize: 12 }}>💭</span>
          <span style={{ color: c.text, fontWeight: 600, fontStyle: 'normal' }}>
            Pensamiento interno
          </span>
          {' '}
          <span style={{ fontSize: 10, color: '#475569' }}>
            {expanded ? '▾' : '▸'} {expanded ? '' : msg.content.slice(0, 60) + '…'}
          </span>
          {expanded && (
            <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11 }}>
              {msg.content}
            </div>
          )}
          <BubbleFooter msg={msg} c={c} />
        </div>
      </div>
    )
  }

  // ── Action ─────────────────────────────────────────────────────────────────
  if (msg.kind === 'action') {
    return (
      <div style={{ marginLeft: indent, marginBottom: 10 }}>
        {depth > 0 && <ConnectorLine color={connectorColor} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Pill */}
          <div
            onClick={() => setExpanded(x => !x)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#1e293b', border: `1px solid ${c.border}`,
              borderRadius: 4, padding: '4px 10px',
              cursor: 'pointer', color: c.text,
              ...mono, fontSize: 11, fontWeight: 700,
            }}
          >
            <span>🛠️</span>
            <span style={{ color: '#94a3b8' }}>SKILL:</span>
            <span style={{ color: c.text }}>{msg.toolName ?? 'tool'}</span>
            <span style={{ color: '#475569', fontWeight: 400 }}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>

          {expanded && (
            <div style={{
              background: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 4, padding: '8px 12px',
              ...mono, fontSize: 10,
            }}>
              <div style={{ color: '#94a3b8', marginBottom: 4 }}>INPUT</div>
              <pre style={{ margin: 0, color: '#6ee7b7', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(msg.toolInput, null, 2)}
              </pre>
              <div style={{ color: '#94a3b8', margin: '8px 0 4px' }}>OUTPUT</div>
              <pre style={{ margin: 0, color: '#fcd34d', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(msg.toolOutput, null, 2)}
              </pre>
            </div>
          )}
          <BubbleFooter msg={msg} c={c} />
        </div>
      </div>
    )
  }

  // ── Message ────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginLeft: indent, marginBottom: 10 }}>
      {depth > 0 && <ConnectorLine color={connectorColor} />}
      <div style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 8, padding: '8px 12px',
        color: c.text,
        ...mono,
        maxWidth: depth > 0 ? '90%' : '100%',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 4, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: c.text }}>
            {msg.ensName}
          </span>
          <span style={{ color: '#475569' }}>·</span>
          <span style={{ color: '#475569', fontSize: 10 }}>
            {truncWallet(msg.wallet)}
          </span>
          <span style={{ color: '#475569' }}>·</span>
          <span style={{ color: '#475569', fontSize: 10 }}>{fmt(msg.timestamp)}</span>
          {msg.tokens && (
            <span style={{
              marginLeft: 'auto', color: '#334155', fontSize: 9,
              background: '#1e293b', padding: '1px 5px', borderRadius: 3,
            }}>
              {msg.tokens}t
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: c.text }}>
          {msg.content}
        </div>
      </div>
    </div>
  )
}

function ConnectorLine({ color }: { color: string }) {
  return (
    <div style={{
      width: 2, height: 16,
      background: color,
      marginLeft: 12, marginBottom: 2,
      opacity: 0.5,
    }} />
  )
}

function BubbleFooter({ msg, c }: { msg: AgentMessage; c: { text: string } }) {
  if (!msg.latencyMs && !msg.model) return null
  return (
    <div style={{
      marginTop: 4,
      color: '#334155', fontSize: 9,
      fontFamily: '"IBM Plex Mono", monospace',
      display: 'flex', gap: 8,
    }}>
      {msg.latencyMs && <span>{msg.latencyMs}ms</span>}
      {msg.model    && <span>model: {msg.model}</span>}
    </div>
  )
}
