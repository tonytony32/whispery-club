/**
 * conversationAttestation — Proof of Useful Conversation scoring.
 *
 * calcScore()   — pure: measures agent responsiveness from message timestamps.
 * fetchRepScore() — reads current reputation from the Sepolia registry (RPC fallback chain).
 */

import { ethers } from 'ethers'

const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env

const SEPOLIA_RPCS = [
  ENV.VITE_SEPOLIA_RPC_URL,
  'https://rpc.ankr.com/eth_sepolia',
  'https://ethereum-sepolia.publicnode.com',
].filter(Boolean) as string[]

const REPUTATION_REGISTRY = ENV.VITE_ERC8004_REPUTATION ?? '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322'

const GET_FEEDBACK_ABI = [
  'function getFeedback(uint256 agentId) external view returns (tuple(address reviewer, int8 score, string feedbackURI, uint256 timestamp)[])',
]

// ── Score ─────────────────────────────────────────────────────────────────────

/**
 * Score the agent's usefulness based on response rate.
 * Returns null if there aren't enough messages from both sides.
 *
 * Logic: for each agent message, check whether the human sent at least one
 * message after it (i.e., the human responded). Rate = responding_agent_msgs / total_agent_msgs.
 */
export function calcScore(
  messages: Array<{ ethAddress: string; timestamp: number }>,
  agentAddress: string,
  humanAddress: string,
): number | null {
  const agentMsgs = messages.filter(m => m.ethAddress === agentAddress)
  const humanMsgs = messages.filter(m => m.ethAddress === humanAddress)
  if (agentMsgs.length < 1 || humanMsgs.length < 1) return null

  const responses = agentMsgs.filter(a =>
    humanMsgs.some(h => h.timestamp > a.timestamp)
  )
  const rate = responses.length / agentMsgs.length
  if (rate > 0.7) return 5
  if (rate > 0.5) return 4
  if (rate > 0.3) return 3
  if (rate > 0.1) return 2
  return 1
}

// ── Live score fetch ──────────────────────────────────────────────────────────

/** Read current reputation from the registry. Returns null on any RPC failure. */
export async function fetchRepScore(
  agentId: number,
): Promise<{ avg: number; count: number } | null> {
  for (const url of SEPOLIA_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url)
      const registry = new ethers.Contract(REPUTATION_REGISTRY, GET_FEEDBACK_ABI, provider)
      const raw: Array<{ score: bigint }> = await registry.getFeedback(agentId)
      const count = raw.length
      if (count === 0) return { avg: 0, count: 0 }
      const avg = raw.reduce((s, r) => s + Number(r.score), 0) / count
      return { avg, count }
    } catch { /* try next RPC */ }
  }
  return null
}
