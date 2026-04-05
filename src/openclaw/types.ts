// ── OpenClaw Observer — shared types ─────────────────────────────────────────

export type AgentId = 'betty' | 'caroline' | 'alice' | 'system'
export type MessageKind = 'message' | 'thought' | 'action' | 'directive'
export type AgentStatus = 'active' | 'thinking' | 'idle'

export interface AgentMessage {
  id:          string
  parentId:    string | null
  agentId:     AgentId
  agentLabel:  string
  ensName:     string
  wallet:      string
  kind:        MessageKind
  content:     string
  toolName?:   string
  toolInput?:  Record<string, unknown>
  toolOutput?: Record<string, unknown>
  model?:      string
  latencyMs?:  number
  tokens?:     number
  timestamp:   number
}

export interface AgentInfo {
  id:              AgentId
  label:           string
  ensName:         string
  wallet:          string
  tokenId:         number
  isHuman:         boolean
  status:          AgentStatus
  tokenCount:      number
  maxTokens:       number
  erc8004AgentId?: string
  erc8004CID?:     string
}

export interface MemoryVars {
  channel:      string
  nft_contract: string
  epoch:        number
  current_task: string
  last_error:   string | null
  project_path: string
  [key: string]: unknown
}

// Colours per agent — dark-theme variants (bg, border, text, dot)
export const AGENT_COLORS: Record<AgentId, {
  bg: string; border: string; text: string; dot: string; label: string
}> = {
  betty:    { bg: '#022c22', border: '#34d399', text: '#6ee7b7', dot: '#10b981', label: 'emerald' },
  caroline: { bg: '#2d1b00', border: '#fbbf24', text: '#fcd34d', dot: '#f59e0b', label: 'amber'   },
  alice:    { bg: '#2d0a10', border: '#fb7185', text: '#fda4af', dot: '#f43f5e', label: 'rose'    },
  system:   { bg: '#0f172a', border: '#475569', text: '#94a3b8', dot: '#64748b', label: 'slate'   },
}

// Static identity table — used as fallback when ENS resolution fails
export const AGENT_IDENTITIES: Record<AgentId, Omit<AgentInfo, 'status' | 'tokenCount' | 'maxTokens'>> = {
  alice: {
    id: 'alice', label: 'Alice',
    ensName: 'alice.whispery.eth',
    wallet:  '0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c',
    tokenId: 1, isHuman: true,
  },
  betty: {
    id: 'betty', label: 'Betty',
    ensName: 'betty.whispery.eth',
    wallet:  '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    tokenId: 2, isHuman: false,
    erc8004AgentId: '31815',
    erc8004CID:     'QmTppopyJEZLMVpQCKm6w3yR6vvFBXAb2T7XEKd5CptekH',
  },
  caroline: {
    id: 'caroline', label: 'Caroline',
    ensName: 'caroline.whispery.eth',
    wallet:  '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    tokenId: 3, isHuman: false,
    erc8004AgentId: '31816',
    erc8004CID:     'QmVgPxqTtYYb6UAmQvBygp29P7bTo6rrz2241gyFs3kgyW',
  },
  system: {
    id: 'system', label: 'System',
    ensName: 'system',
    wallet:  '0x0000000000000000000000000000000000000000',
    tokenId: 0, isHuman: false,
  },
}
