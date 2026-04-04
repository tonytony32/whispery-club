/**
 * OpenClaw Observer — Zustand store.
 * Central state for messages, agent status, memory snapshot, and UI controls.
 */

import { create } from 'zustand'
import type { AgentMessage, AgentInfo, MemoryVars } from './types'
import { AGENT_IDENTITIES } from './types'

interface ThoughtStream {
  agentId: string
  text:    string        // text built up so far
  full:    string        // complete text (target)
}

interface OpenClawStore {
  // ── Messages ────────────────────────────────────────────────────────────────
  messages:       AgentMessage[]
  addMessage:     (msg: AgentMessage) => void

  // ── Agent status ─────────────────────────────────────────────────────────────
  agents:         Record<string, AgentInfo>
  setAgentStatus: (id: string, status: AgentInfo['status']) => void
  setTokenCount:  (id: string, count: number) => void

  // ── Memory snapshot ──────────────────────────────────────────────────────────
  memoryVars:     MemoryVars
  updateMemory:   (patch: Partial<MemoryVars>) => void

  // ── Playback controls ────────────────────────────────────────────────────────
  paused:         boolean
  setPaused:      (v: boolean) => void

  // ── Thought stream ────────────────────────────────────────────────────────────
  thoughtStream:     ThoughtStream | null
  setThoughtStream:  (ts: ThoughtStream | null) => void
  appendThoughtChar: (char: string) => void

  // ── Human-in-the-loop ────────────────────────────────────────────────────────
  pendingMessage:    AgentMessage | null
  setPending:        (msg: AgentMessage | null) => void
  injectDirective:   (content: string) => void   // called by HumanControls

  // ── Resolved ENS names (live, may differ from fallback) ──────────────────────
  resolvedNames: Record<string, string>
  setResolvedName: (wallet: string, name: string) => void
}

const INITIAL_AGENTS: Record<string, AgentInfo> = {
  betty: {
    ...AGENT_IDENTITIES.betty,
    status: 'idle', tokenCount: 0, maxTokens: 8192,
  },
  caroline: {
    ...AGENT_IDENTITIES.caroline,
    status: 'idle', tokenCount: 0, maxTokens: 8192,
  },
  alice: {
    ...AGENT_IDENTITIES.alice,
    status: 'idle', tokenCount: 0, maxTokens: 8192,
  },
}

const INITIAL_MEMORY: MemoryVars = {
  channel:      'beachclaw.whispery.eth',
  nft_contract: '0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16',
  epoch:        0,
  current_task: 'analyse whispery codebase',
  last_error:   null,
  project_path: '/src',
}

export const useOpenClawStore = create<OpenClawStore>((set, get) => ({
  messages: [],
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),

  agents: INITIAL_AGENTS,
  setAgentStatus: (id, status) =>
    set(s => ({
      agents: { ...s.agents, [id]: { ...s.agents[id], status } },
    })),
  setTokenCount: (id, count) =>
    set(s => ({
      agents: { ...s.agents, [id]: { ...s.agents[id], tokenCount: count } },
    })),

  memoryVars: INITIAL_MEMORY,
  updateMemory: (patch) =>
    set(s => ({ memoryVars: { ...s.memoryVars, ...patch } })),

  paused: false,
  setPaused: (v) => set({ paused: v }),

  thoughtStream: null,
  setThoughtStream: (ts) => set({ thoughtStream: ts }),
  appendThoughtChar: (char) =>
    set(s => s.thoughtStream
      ? { thoughtStream: { ...s.thoughtStream, text: s.thoughtStream.text + char } }
      : {}
    ),

  pendingMessage: null,
  setPending: (msg) => set({ pendingMessage: msg }),

  injectDirective: (content) => {
    const msg: AgentMessage = {
      id:         `inject-${Date.now()}`,
      parentId:   null,
      agentId:    'alice',
      agentLabel: 'Alice',
      ensName:    'alice.whispery.eth',
      wallet:     '0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c',
      kind:       'directive',
      content,
      timestamp:  Date.now(),
    }
    get().addMessage(msg)
  },

  resolvedNames: {},
  setResolvedName: (wallet, name) =>
    set(s => ({ resolvedNames: { ...s.resolvedNames, [wallet]: name } })),
}))
