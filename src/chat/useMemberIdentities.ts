/**
 * useMemberIdentities — resolves ENS names and ERC-8004 agent status
 * for a list of member wallet addresses.
 *
 * Runs entirely in background after mount. The chat never blocks on this.
 * Results update state incrementally as each address resolves.
 *
 * Cache: module-level Map — each address is resolved at most once per session.
 */

import { useState, useEffect } from 'react'
import { ethers }              from 'ethers'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentCard = {
  name:          string
  description:   string
  version?:      string
  capabilities?: string[]
}

export type ReputationEntry = {
  reviewer:    string   // eth address
  score:       number   // int8, 1–5
  feedbackURI: string   // ipfs:// URI
  timestamp:   number   // unix seconds (from contract)
}

export type Reputation = {
  entries:  ReputationEntry[]
  avgScore: number | null   // arithmetic mean, null if no entries
}

export type MemberIdentity = {
  address:         string
  displayName:     string   // ENS name or truncated address
  isAgent:         boolean
  ensip25Verified: boolean  // bidirectional ENS ↔ ERC-8004 check passed
  agentId:         number | null
  agentCard:       AgentCard | null
  reputation:      Reputation | null   // null for non-agents; fetched once per session
}

// ── Config ────────────────────────────────────────────────────────────────────

const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env

const ERC8004_REGISTRY = ENV.VITE_ERC8004_REGISTRY ?? '0x7177a6867296406881E20d6647232314736Dd09A'
const REPUTATION_REGISTRY = ENV.VITE_ERC8004_REPUTATION ?? '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322'

const ERC8004_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 agentId) view returns (string)',
]

const REPUTATION_ABI = [
  'function getFeedback(uint256 agentId) external view returns (tuple(address reviewer, int8 score, string feedbackURI, uint256 timestamp)[])',
]

const MAINNET_RPCS: string[] = [
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_ENS_RPC_URL,
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
  'https://1rpc.io/eth',
].filter(Boolean) as string[]

const SEPOLIA_RPCS: string[] = [
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_SEPOLIA_RPC_URL,
  'https://rpc.ankr.com/eth_sepolia',
  'https://ethereum-sepolia.publicnode.com',
].filter(Boolean) as string[]

// ── Module-level cache ────────────────────────────────────────────────────────

const identityCache = new Map<string, MemberIdentity>()

// ── Provider helpers ──────────────────────────────────────────────────────────

async function mainnetProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of MAINNET_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url)
      await p.getNetwork()
      return p
    } catch { /* try next */ }
  }
  throw new Error('All mainnet RPCs unavailable')
}

async function sepoliaProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of SEPOLIA_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url)
      await p.getNetwork()
      return p
    } catch { /* try next */ }
  }
  throw new Error('All Sepolia RPCs unavailable')
}

// ── Agent card fetch ──────────────────────────────────────────────────────────

async function fetchAgentCard(uri: string): Promise<AgentCard | null> {
  try {
    const url = uri.startsWith('ipfs://')
      ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
      : uri
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const json = await res.json()
    return {
      name:         json.name         ?? 'Unknown Agent',
      description:  json.description  ?? '',
      version:      json.version,
      capabilities: Array.isArray(json.capabilities) ? json.capabilities : undefined,
    }
  } catch {
    return null
  }
}

// ── Core resolution ───────────────────────────────────────────────────────────

function truncate(address: string) {
  return address.slice(0, 6) + '…' + address.slice(-4)
}

async function resolveIdentity(address: string): Promise<MemberIdentity> {
  const base: MemberIdentity = {
    address,
    displayName:     truncate(address),
    isAgent:         false,
    ensip25Verified: false,
    agentId:         null,
    agentCard:       null,
    reputation:      null,
  }

  try {
    // ── Step 1: reverse ENS lookup ───────────────────────────────────────────
    const ensProvider = await mainnetProvider()
    const ensName     = await ensProvider.lookupAddress(address)
    if (ensName) base.displayName = ensName

    // ── Step 2: check ERC-8004 registry on Sepolia ───────────────────────────
    const sepProvider = await sepoliaProvider()
    const registry    = new ethers.Contract(ERC8004_REGISTRY, ERC8004_ABI, sepProvider)

    // Use provider.call() instead of registry.balanceOf() — when the contract isn't
    // deployed the node returns 0x, and ethers v6 logs BAD_DATA to console before
    // throwing even when caught. Raw call() returns 0x silently, no logging.
    const BALANCE_OF_IFACE = new ethers.Interface([
      'function balanceOf(address) view returns (uint256)',
    ])
    let balance = 0n
    try {
      const raw = await sepProvider.call({
        to:   ERC8004_REGISTRY,
        data: BALANCE_OF_IFACE.encodeFunctionData('balanceOf', [address]),
      })
      if (raw && raw !== '0x') {
        balance = BALANCE_OF_IFACE.decodeFunctionResult('balanceOf', raw)[0] as bigint
      }
    } catch { /* RPC failure — treat as non-agent */ }

    if (balance > 0n) {
      const agentId: bigint = await registry.tokenOfOwnerByIndex(address, 0)
      base.agentId          = Number(agentId)
      base.isAgent          = true // tentative — confirmed by ENSIP-25

      // ── Step 3: ENSIP-25 bidirectional verification ──────────────────────
      if (ensName) {
        try {
          const registryAddrLower = ERC8004_REGISTRY.toLowerCase().slice(2)
          const erc7930  = `0x00010000010114${registryAddrLower}`
          const textKey  = `agent-registration[${erc7930}][${agentId}]`
          const resolver = await ensProvider.getResolver(ensName)
          const textVal  = await resolver?.getText(textKey)

          if (textVal) {
            base.ensip25Verified = true
            // ── Step 4: fetch agent card from tokenURI ─────────────────────
            const agentUri = await registry.tokenURI(agentId)
            base.agentCard = await fetchAgentCard(agentUri)
          }
        } catch { /* ENSIP-25 check failed — agent stays unverified */ }

      // ── Step 5: fetch reputation (cached per session via identityCache) ──
      try {
        const repRegistry = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, sepProvider)
        const raw: Array<{ reviewer: string; score: bigint; feedbackURI: string; timestamp: bigint }>
          = await repRegistry.getFeedback(agentId)
        const entries: ReputationEntry[] = raw.map(r => ({
          reviewer:    r.reviewer,
          score:       Number(r.score),
          feedbackURI: r.feedbackURI,
          timestamp:   Number(r.timestamp),
        }))
        const avgScore = entries.length > 0
          ? entries.reduce((s, e) => s + e.score, 0) / entries.length
          : null
        base.reputation = { entries, avgScore }
      } catch { /* silent — reputation not critical */ }
      }
    }
  } catch { /* any failure → return base (human, truncated address) */ }

  return base
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMemberIdentities(addresses: string[]): Map<string, MemberIdentity> {
  const [identities, setIdentities] = useState<Map<string, MemberIdentity>>(() => {
    // Populate synchronously from cache on mount
    const m = new Map<string, MemberIdentity>()
    for (const a of addresses) {
      if (identityCache.has(a)) m.set(a, identityCache.get(a)!)
    }
    return m
  })

  const key = addresses.slice().sort().join(',')

  useEffect(() => {
    const toResolve = addresses.filter(a => !identityCache.has(a))
    if (toResolve.length === 0) return

    for (const address of toResolve) {
      resolveIdentity(address).then(identity => {
        identityCache.set(address, identity)
        setIdentities(prev => new Map(prev).set(address, identity))
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return identities
}
