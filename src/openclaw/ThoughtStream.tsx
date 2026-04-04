/**
 * ThoughtStream — live character-by-character streaming drawer.
 * Shown at the bottom of the thread while an agent is "thinking".
 * Collapses automatically when the thought is committed.
 */

import { useOpenClawStore } from './store'
import { AGENT_COLORS } from './types'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

export default function ThoughtStream() {
  const ts = useOpenClawStore(s => s.thoughtStream)
  if (!ts) return null

  const agentId = ts.agentId as keyof typeof AGENT_COLORS
  const c       = AGENT_COLORS[agentId] ?? AGENT_COLORS.system

  return (
    <div style={{
      background: '#0a0f1a',
      borderTop: '1px solid #1e293b',
      padding: '10px 16px',
      minHeight: 48,
      position: 'relative',
    }}>
      <div style={{
        ...mono, fontSize: 11, color: c.text, opacity: 0.85,
        fontStyle: 'italic', lineHeight: 1.6,
      }}>
        <span style={{ opacity: 0.5, fontSize: 14, marginRight: 6 }}>💭</span>
        <span style={{ color: c.border, fontWeight: 700, fontStyle: 'normal' }}>
          {ts.agentId}.whispery.eth
        </span>
        {' '}está pensando:{' '}
        {ts.text}
        <span style={{
          display: 'inline-block', width: 8, height: 14,
          background: c.dot, marginLeft: 2, verticalAlign: 'text-bottom',
          animation: 'blink 0.8s step-end infinite',
        }} />
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  )
}
