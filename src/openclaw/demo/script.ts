/**
 * OpenClaw Observer — 90-second demo script.
 *
 * Each entry extends AgentMessage with:
 *   delayMs      — ms to wait after the previous entry fires
 *   streamText   — if true, the thought content streams char-by-char (~40 cps)
 *   memoryUpdate — optional patch applied to the MemoryVars snapshot
 *   tokenUpdate  — optional {agentId, count} applied to the token usage bars
 */

import type { AgentMessage, MemoryVars } from '../types'

export interface ScriptEntry extends AgentMessage {
  delayMs:       number
  streamText?:   boolean
  memoryUpdate?: Partial<MemoryVars>
  tokenUpdate?:  { agentId: string; count: number }
}

const BETTY    = 'betty.whispery.eth'
const CAROLINE = 'caroline.whispery.eth'
const ALICE    = 'alice.whispery.eth'

export const DEMO_SCRIPT: ScriptEntry[] = [

  // ── Act 1 — Task assignment (0–20 s) ────────────────────────────────────────

  {
    id: 'sys-init', parentId: null,
    agentId: 'system', agentLabel: 'System', ensName: 'system',
    wallet: '0x0000000000000000000000000000000000000000',
    kind: 'message',
    content: 'Channel beachclaw.whispery.eth · epoch 0 · 3 active members',
    timestamp: 0, delayMs: 0, tokens: 12, latencyMs: 0,
  },

  {
    id: 'betty-thought-1', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'thought',
    content: 'Scanning the channel... alice.whispery.eth just connected. There is a pending analysis task.',
    timestamp: 0, delayMs: 2000, tokens: 28, latencyMs: 950,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 320 },
  },

  {
    id: 'betty-msg-1', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Caroline, Alice has assigned us a task: analyse the Whispery repo and summarise the contract architecture.',
    timestamp: 0, delayMs: 5000, tokens: 95, latencyMs: 1200,
    tokenUpdate: { agentId: 'betty', count: 640 },
  },

  {
    id: 'caroline-msg-1', parentId: 'betty-msg-1',
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'message',
    content: 'Received. I\'ll review /src, you look for external documentation.',
    timestamp: 0, delayMs: 6000, tokens: 82, latencyMs: 1050,
    tokenUpdate: { agentId: 'caroline', count: 280 },
  },

  // ── Act 2 — Parallel work (20–50 s) ─────────────────────────────────────────

  {
    id: 'betty-action-search', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'action',
    content: 'Searching external documentation about Whispery',
    toolName: 'web_search',
    toolInput:  { query: 'Whispery NFT gated chat ENS Waku' },
    toolOutput: { results: [
      'ERC-721 membership gates access to encrypted Waku channels',
      'Waku transport layer provides P2P messaging without central servers',
      'ENS names used as verifiable identities for channel members',
    ]},
    timestamp: 0, delayMs: 7000, tokens: 148, latencyMs: 1800,
    tokenUpdate: { agentId: 'betty', count: 1280 },
    memoryUpdate: { current_task: 'analysing contract architecture' },
  },

  {
    id: 'betty-thought-2', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'thought',
    content: 'Results confirm the ERC-721 + Waku pattern. I\'ll synthesise for Caroline. The membership model is clean — tokenId maps directly to channel access.',
    timestamp: 0, delayMs: 5000, tokens: 112, latencyMs: 1100,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 1840 },
  },

  {
    id: 'caroline-action-readdir', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'action',
    content: 'Exploring directory structure of /src',
    toolName: 'read_dir',
    toolInput:  { path: '/src' },
    toolOutput: { files: [
      'core/crypto.ts',
      'transport/messenger.ts',
      'omnibar/Omnibar.tsx',
      'contracts.ts',
      'MessengerView.tsx',
    ]},
    timestamp: 0, delayMs: 3000, tokens: 134, latencyMs: 2100,
    tokenUpdate: { agentId: 'caroline', count: 720 },
  },

  {
    id: 'caroline-msg-2', parentId: 'betty-msg-1',
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'message',
    content: 'Found 3 key files. Should I analyse crypto.ts first or would you prefer I start with the transport layer?',
    timestamp: 0, delayMs: 4000, tokens: 97, latencyMs: 1350,
    tokenUpdate: { agentId: 'caroline', count: 1100 },
  },

  {
    id: 'betty-msg-2', parentId: 'caroline-msg-2',
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Start with crypto.ts — that\'s where the ACT logic and X25519 live.',
    timestamp: 0, delayMs: 4000, tokens: 88, latencyMs: 980,
    tokenUpdate: { agentId: 'betty', count: 2200 },
  },

  // ── Act 3 — Synthesis (50–75 s) ──────────────────────────────────────────────

  {
    id: 'caroline-thought-1', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'thought',
    content: 'Reading crypto.ts... the accessGroupChannel function uses DH(sk_group, pk_member) to derive the lookup_key... this is elegant, no central server. The HKDF over the Diffie-Hellman secret guarantees each epoch has independent keys.',
    timestamp: 0, delayMs: 5000, tokens: 156, latencyMs: 2300,
    streamText: true,
    tokenUpdate: { agentId: 'caroline', count: 1680 },
    memoryUpdate: { project_path: '/src/core/crypto.ts' },
  },

  {
    id: 'caroline-action-readfile', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'action',
    content: 'Reading src/core/crypto.ts',
    toolName: 'read_file',
    toolInput:  { path: '/src/core/crypto.ts' },
    toolOutput: { lines: 312, exports: [
      'accessGroupChannel',
      'createGroupEnvelope',
      'openGroupEnvelope',
      'keysFromSig',
      'createWallet',
    ]},
    timestamp: 0, delayMs: 8000, tokens: 178, latencyMs: 2400,
    tokenUpdate: { agentId: 'caroline', count: 2400 },
  },

  {
    id: 'caroline-msg-3', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'message',
    content: 'crypto.ts exports 3 main functions. The ACT uses HKDF over the DH secret — forward secrecy per epoch.',
    timestamp: 0, delayMs: 5000, tokens: 103, latencyMs: 1450,
    tokenUpdate: { agentId: 'caroline', count: 2800 },
  },

  {
    id: 'betty-msg-summary', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Summary ready: Whispery uses ERC-721 for membership, X25519+HKDF for the ACT, and Waku for P2P transport with no central server. ENS anchors identities. Solid architecture for the hackathon.',
    timestamp: 0, delayMs: 5000, tokens: 187, latencyMs: 1680,
    tokenUpdate: { agentId: 'betty', count: 3200 },
    memoryUpdate: { current_task: 'summary delivered' },
  },

  // ── Act 4 — Human directive (75–90 s) ────────────────────────────────────────

  {
    id: 'alice-directive', parentId: null,
    agentId: 'alice', agentLabel: 'Alice', ensName: ALICE,
    wallet: '0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c',
    kind: 'directive',
    content: 'Add to the summary: the Omnibar supports ENS group names like beachclaw.whispery.eth — it is the main entry point for new members.',
    timestamp: 0, delayMs: 6000,
  },

  {
    id: 'betty-thought-3', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'thought',
    content: 'Directive received from alice.whispery.eth. Updating the summary with the Omnibar information.',
    timestamp: 0, delayMs: 2000, tokens: 44, latencyMs: 820,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 3600 },
  },

  {
    id: 'betty-msg-updated', parentId: 'betty-msg-summary',
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Updated. The Omnibar detects beachclaw.whispery.eth, resolves to contract 0x51a5…C16, and verifies balanceOf before granting access to the encrypted channel.',
    timestamp: 0, delayMs: 4000, tokens: 142, latencyMs: 1540,
    tokenUpdate: { agentId: 'betty', count: 3900 },
  },

  {
    id: 'sys-done', parentId: null,
    agentId: 'system', agentLabel: 'System', ensName: 'system',
    wallet: '0x0000000000000000000000000000000000000000',
    kind: 'message',
    content: 'Task completed · betty.whispery.eth · caroline.whispery.eth',
    timestamp: 0, delayMs: 3000, tokens: 14, latencyMs: 0,
    memoryUpdate: { current_task: 'completed', last_error: null },
  },
]
