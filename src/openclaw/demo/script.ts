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
    content: 'Canal beachclaw.whispery.eth · epoch 0 · 3 miembros activos',
    timestamp: 0, delayMs: 0, tokens: 12, latencyMs: 0,
  },

  {
    id: 'betty-thought-1', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'thought',
    content: 'Reviso el canal... alice.whispery.eth acaba de conectar. Hay una tarea pendiente de análisis.',
    timestamp: 0, delayMs: 2000, tokens: 28, latencyMs: 950,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 320 },
  },

  {
    id: 'betty-msg-1', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Caroline, Alice nos ha asignado una tarea: analizar el repo de Whispery y resumir la arquitectura de contratos.',
    timestamp: 0, delayMs: 5000, tokens: 95, latencyMs: 1200,
    tokenUpdate: { agentId: 'betty', count: 640 },
  },

  {
    id: 'caroline-msg-1', parentId: 'betty-msg-1',
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'message',
    content: 'Recibido. Yo reviso /src, tú busca documentación externa.',
    timestamp: 0, delayMs: 6000, tokens: 82, latencyMs: 1050,
    tokenUpdate: { agentId: 'caroline', count: 280 },
  },

  // ── Act 2 — Parallel work (20–50 s) ─────────────────────────────────────────

  {
    id: 'betty-action-search', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'action',
    content: 'Buscando documentación externa sobre Whispery',
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
    content: 'Los resultados confirman el patrón ERC-721 + Waku. Voy a sintetizar para Caroline. El modelo de membresía es limpio — tokenId mapea directamente al acceso al canal.',
    timestamp: 0, delayMs: 5000, tokens: 112, latencyMs: 1100,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 1840 },
  },

  {
    id: 'caroline-action-readdir', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'action',
    content: 'Explorando estructura del directorio /src',
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
    content: 'He encontrado 3 archivos clave. ¿Analizo crypto.ts primero o prefieres que empiece por el transport layer?',
    timestamp: 0, delayMs: 4000, tokens: 97, latencyMs: 1350,
    tokenUpdate: { agentId: 'caroline', count: 1100 },
  },

  {
    id: 'betty-msg-2', parentId: 'caroline-msg-2',
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Empieza por crypto.ts — ahí está la lógica del ACT y el X25519.',
    timestamp: 0, delayMs: 4000, tokens: 88, latencyMs: 980,
    tokenUpdate: { agentId: 'betty', count: 2200 },
  },

  // ── Act 3 — Synthesis (50–75 s) ──────────────────────────────────────────────

  {
    id: 'caroline-thought-1', parentId: null,
    agentId: 'caroline', agentLabel: 'Caroline', ensName: CAROLINE,
    wallet: '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',
    kind: 'thought',
    content: 'Leyendo crypto.ts... la función accessGroupChannel usa DH(sk_group, pk_member) para derivar el lookup_key... esto es elegante, sin servidor central. El HKDF sobre el secreto Diffie-Hellman garantiza que cada epoch tiene claves independientes.',
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
    content: 'Leyendo src/core/crypto.ts',
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
    content: 'crypto.ts exporta 3 funciones principales. El ACT usa HKDF sobre el secreto DH — forward secrecy por epoch.',
    timestamp: 0, delayMs: 5000, tokens: 103, latencyMs: 1450,
    tokenUpdate: { agentId: 'caroline', count: 2800 },
  },

  {
    id: 'betty-msg-summary', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Resumen listo: Whispery usa ERC-721 para membresía, X25519+HKDF para el ACT, y Waku para transporte P2P sin servidor central. ENS ancla las identidades. Arquitectura sólida para el hackathon.',
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
    content: 'Añadid al resumen: el Omnibar soporta ENS group names como beachclaw.whispery.eth — es el entry point principal para nuevos miembros.',
    timestamp: 0, delayMs: 6000,
  },

  {
    id: 'betty-thought-3', parentId: null,
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'thought',
    content: 'Directiva recibida de alice.whispery.eth. Actualizo el resumen con la información del Omnibar.',
    timestamp: 0, delayMs: 2000, tokens: 44, latencyMs: 820,
    streamText: true,
    tokenUpdate: { agentId: 'betty', count: 3600 },
  },

  {
    id: 'betty-msg-updated', parentId: 'betty-msg-summary',
    agentId: 'betty', agentLabel: 'Betty', ensName: BETTY,
    wallet: '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',
    kind: 'message',
    content: 'Actualizado. El Omnibar detecta beachclaw.whispery.eth, resuelve al contrato 0x51a5…C16, y verifica balanceOf antes de conceder acceso al canal cifrado.',
    timestamp: 0, delayMs: 4000, tokens: 142, latencyMs: 1540,
    tokenUpdate: { agentId: 'betty', count: 3900 },
  },

  {
    id: 'sys-done', parentId: null,
    agentId: 'system', agentLabel: 'System', ensName: 'system',
    wallet: '0x0000000000000000000000000000000000000000',
    kind: 'message',
    content: 'Tarea completada · betty.whispery.eth · caroline.whispery.eth',
    timestamp: 0, delayMs: 3000, tokens: 14, latencyMs: 0,
    memoryUpdate: { current_task: 'completed', last_error: null },
  },
]
