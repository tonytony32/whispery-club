/**
 * OpenClawObserver — root layout: ThreadPanel (60%) + Sidebar (40%).
 * Starts the demo engine on mount.
 */

import { useEffect, useRef } from 'react'
import ThreadPanel from './ThreadPanel'
import Sidebar from './Sidebar'
import { demoMessenger } from './demo/DemoMessenger'

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

const DEMO_MODE = import.meta.env.VITE_OPENCLAW_DEMO === 'true'

export default function OpenClawObserver() {
  const started = useRef(false)

  useEffect(() => {
    if (!DEMO_MODE || started.current) return
    started.current = true
    // Small delay so the UI renders first
    const t = setTimeout(() => demoMessenger.start(), 400)
    return () => {
      clearTimeout(t)
      demoMessenger.stop()
    }
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 57px)',
      background: '#0b0b0e',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1a1a24',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#7c6aff' }}>
          OpenClaw Observer
        </span>
        <span style={{ ...mono, fontSize: 10, color: '#475569' }}>
          beachclaw.whispery.eth · multi-agent session
        </span>
        {DEMO_MODE && (
          <span style={{
            ...mono, fontSize: 9, fontWeight: 700,
            background: '#f59e0b22', color: '#fbbf24',
            border: '1px solid #fbbf2455',
            borderRadius: 4, padding: '2px 7px',
          }}>
            ⚡ DEMO
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60% 40%',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Left — thread */}
        <div style={{
          borderRight: '1px solid #1a1a24',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <ThreadPanel />
        </div>

        {/* Right — sidebar */}
        <div style={{
          padding: '14px 16px',
          overflowY: 'auto',
          background: '#0b0b0e',
        }}>
          <Sidebar />
        </div>
      </div>
    </div>
  )
}
