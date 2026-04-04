/**
 * HumanControls — floating toolbar for human-in-the-loop interaction.
 *   PAUSE        → freeze/unfreeze the demo timer
 *   INJECT       → insert a directive message as Alice
 *   INTERCEPT    → (only when paused) edit the next pending message
 */

import { useState } from 'react'
import { useOpenClawStore } from './store'
import { demoMessenger } from './demo/DemoMessenger'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 11,
}

export default function HumanControls() {
  const paused          = useOpenClawStore(s => s.paused)
  const pendingMessage  = useOpenClawStore(s => s.pendingMessage)
  const injectDirective = useOpenClawStore(s => s.injectDirective)
  const setPaused       = useOpenClawStore(s => s.setPaused)

  const [showInject,    setShowInject]    = useState(false)
  const [showIntercept, setShowIntercept] = useState(false)
  const [injectText,    setInjectText]    = useState('')
  const [interceptText, setInterceptText] = useState('')

  function handlePause() {
    if (paused) {
      demoMessenger.resume()
    } else {
      demoMessenger.pause()
    }
    setPaused(!paused)
  }

  function handleInject() {
    if (!injectText.trim()) return
    injectDirective(injectText.trim())
    setInjectText('')
    setShowInject(false)
  }

  function handleIntercept() {
    if (!pendingMessage || !interceptText.trim()) return
    const edited = { ...pendingMessage, content: interceptText.trim(), agentId: 'alice' as const }
    useOpenClawStore.getState().addMessage(edited)
    useOpenClawStore.getState().setPending(null)
    setShowIntercept(false)
    setInterceptText('')
    demoMessenger.resume()
  }

  const btnBase: React.CSSProperties = {
    ...mono, fontWeight: 700, padding: '6px 14px',
    borderRadius: 5, cursor: 'pointer', border: 'none',
    transition: 'opacity 0.15s',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'flex-end',
    }}>
      {/* Toolbar row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* PAUSE / RESUME */}
        <button
          onClick={handlePause}
          style={{
            ...btnBase,
            background: paused ? '#3ddc97' : '#ff5a5a',
            color: '#000',
          }}
        >
          {paused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>

        {/* INJECT DIRECTIVE */}
        <button
          onClick={() => { setShowInject(x => !x); setShowIntercept(false) }}
          style={{ ...btnBase, background: '#422006', color: '#fcd34d', border: '1px solid #f59e0b' }}
        >
          ⚡ INJECT
        </button>

        {/* INTERCEPT — only enabled when paused and there is a pending message */}
        <button
          onClick={() => {
            if (!paused || !pendingMessage) return
            setInterceptText(pendingMessage.content)
            setShowIntercept(x => !x)
            setShowInject(false)
          }}
          disabled={!paused || !pendingMessage}
          style={{
            ...btnBase,
            background: (paused && pendingMessage) ? '#0f172a' : '#0a0a0f',
            color:  (paused && pendingMessage) ? '#fb7185' : '#334155',
            border: `1px solid ${(paused && pendingMessage) ? '#fb7185' : '#1e293b'}`,
            cursor: (paused && pendingMessage) ? 'pointer' : 'not-allowed',
          }}
        >
          ✋ INTERCEPT
        </button>
      </div>

      {/* INJECT textarea */}
      {showInject && (
        <div style={{
          background: '#0f172a', border: '1px solid #f59e0b',
          borderRadius: 6, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 340,
        }}>
          <div style={{ ...mono, fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>
            ALICE DIRECTIVE
          </div>
          <textarea
            value={injectText}
            onChange={e => setInjectText(e.target.value)}
            rows={3}
            placeholder="Write a directive for the agents…"
            style={{
              background: '#0a0f1a', border: '1px solid #334155',
              borderRadius: 4, padding: '6px 10px',
              color: '#ddddf0', resize: 'vertical',
              ...mono, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowInject(false)}
              style={{ ...btnBase, background: 'none', color: '#5a5a7a', border: '1px solid #25253a' }}>
              Cancel
            </button>
            <button onClick={handleInject} disabled={!injectText.trim()}
              style={{ ...btnBase, background: '#f59e0b', color: '#000' }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* INTERCEPT editor */}
      {showIntercept && pendingMessage && (
        <div style={{
          background: '#0f172a', border: '1px solid #fb7185',
          borderRadius: 6, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 340,
        }}>
          <div style={{ ...mono, fontSize: 10, color: '#fb7185', fontWeight: 700 }}>
            INTERCEPT PENDING MESSAGE
          </div>
          <textarea
            value={interceptText}
            onChange={e => setInterceptText(e.target.value)}
            rows={3}
            style={{
              background: '#0a0f1a', border: '1px solid #334155',
              borderRadius: 4, padding: '6px 10px',
              color: '#ddddf0', resize: 'vertical',
              ...mono, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowIntercept(false)}
              style={{ ...btnBase, background: 'none', color: '#5a5a7a', border: '1px solid #25253a' }}>
              Cancel
            </button>
            <button onClick={handleIntercept} disabled={!interceptText.trim()}
              style={{ ...btnBase, background: '#fb7185', color: '#000' }}>
              SEND AS ALICE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
