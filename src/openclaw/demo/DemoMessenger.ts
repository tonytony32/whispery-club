/**
 * DemoMessenger — script-driven message engine for OpenClaw Observer.
 *
 * Plays through DEMO_SCRIPT on a timer, feeding the Zustand store directly.
 * Supports pause/resume, directive injection, and intercept/edit.
 * No real Waku node required — VITE_OPENCLAW_DEMO=true activates this.
 *
 * Thought entries stream character-by-character at ~40 chars/second before
 * the full message is committed to the store.
 */

import type { ScriptEntry } from './script'
import { DEMO_SCRIPT } from './script'
import { useOpenClawStore } from '../store'
import type { AgentMessage } from '../types'

const CHARS_PER_MS = 40 / 1000   // 40 chars/second

export class DemoMessenger {
  private index       = 0
  private timerId:    ReturnType<typeof setTimeout> | null = null
  private streamTimer: ReturnType<typeof setInterval> | null = null
  private startedAt   = 0
  private pausedAt    = 0
  private remaining   = 0        // ms remaining for current step when paused

  start() {
    this.index     = 0
    this.startedAt = Date.now()
    this.scheduleNext(0)
  }

  pause() {
    const store = useOpenClawStore.getState()
    if (store.paused) return
    store.setPaused(true)
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
      this.remaining = Math.max(0, (this.pausedAt || Date.now()) - Date.now())
    }
    this.stopStream()
  }

  resume() {
    const store = useOpenClawStore.getState()
    if (!store.paused) return
    store.setPaused(false)
    this.scheduleNext(this.remaining)
    this.remaining = 0
  }

  stop() {
    if (this.timerId !== null) clearTimeout(this.timerId)
    this.stopStream()
    this.timerId = null
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private scheduleNext(delay: number) {
    this.pausedAt = Date.now() + delay
    this.timerId  = setTimeout(() => this.fire(), delay)
  }

  private async fire() {
    const store = useOpenClawStore.getState()
    if (store.paused) return
    if (this.index >= DEMO_SCRIPT.length) return

    const entry = DEMO_SCRIPT[this.index]
    this.index++

    // Timestamp = real now
    const msg: AgentMessage = { ...entry, timestamp: Date.now() }

    // Apply memory update if present
    if (entry.memoryUpdate) store.updateMemory(entry.memoryUpdate)

    // Apply token update if present
    if (entry.tokenUpdate) store.setTokenCount(entry.tokenUpdate.agentId, entry.tokenUpdate.count)

    // Mark agent status
    if (entry.agentId !== 'system') {
      store.setAgentStatus(entry.agentId, entry.kind === 'thought' ? 'thinking' : 'active')
    }

    if (entry.kind === 'thought' && entry.streamText) {
      // Stream the thought character by character, then commit
      await this.streamThought(msg)
    } else {
      store.addMessage(msg)
    }

    // Reset agent to idle after acting
    if (entry.agentId !== 'system') {
      store.setAgentStatus(entry.agentId, 'idle')
    }

    // Schedule next entry
    if (this.index < DEMO_SCRIPT.length) {
      const next = DEMO_SCRIPT[this.index]
      this.scheduleNext(next.delayMs)
    }
  }

  private streamThought(msg: AgentMessage): Promise<void> {
    return new Promise(resolve => {
      const store = useOpenClawStore.getState()
      store.setThoughtStream({ agentId: msg.agentId, text: '', full: msg.content })

      let charIndex = 0
      const intervalMs = 1 / CHARS_PER_MS   // ~25ms per char

      this.streamTimer = setInterval(() => {
        const current = useOpenClawStore.getState()
        if (current.paused) return      // freeze during pause

        if (charIndex >= msg.content.length) {
          this.stopStream()
          // Commit the full thought message
          useOpenClawStore.getState().addMessage(msg)
          useOpenClawStore.getState().setThoughtStream(null)
          resolve()
          return
        }

        useOpenClawStore.getState().appendThoughtChar(msg.content[charIndex])
        charIndex++
      }, intervalMs)
    })
  }

  private stopStream() {
    if (this.streamTimer !== null) {
      clearInterval(this.streamTimer)
      this.streamTimer = null
    }
  }
}

// Module-level singleton — one engine per page
export const demoMessenger = new DemoMessenger()
