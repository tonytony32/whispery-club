/**
 * POST /api/claim-membership
 *
 * Verifies a guest is approved on a Luma event and mints a WhisperyNFT
 * to their Circles address. No database — stateless by design.
 *
 * Body: { userEmail: string, circlesAddress: string, lumaEventId: string }
 *
 * Env vars:
 *   LUMA_API_KEY        — Luma API key (https://lu.ma/settings/developer)
 *   ADMIN_PRIVATE_KEY   — Owner wallet that can call mint() on WhisperyNFT
 *   SEPOLIA_RPC_URL     — Sepolia RPC endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ethers } from 'ethers'

// ── Constants ─────────────────────────────────────────────────────────────────

const NFT_PROXY = '0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16'

const NFT_ABI = [
  'function mint(address to) external returns (uint256)',
  'function isMember(address account) external view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

const LUMA_GUESTS_URL = 'https://api.lu.ma/v1/event/get-guests'
const APPROVED_STATUSES = new Set(['approved', 'checked_in'])

// ── Luma guest check ──────────────────────────────────────────────────────────

interface LumaGuest {
  email: string
  approval_status: string
}

interface LumaPage {
  entries: Array<{ guest: LumaGuest }>
  has_more: boolean
  next_cursor?: string
}

/**
 * Walk Luma's paginated guest list for an event and return whether the given
 * email has an approved or checked_in status. Returns null if the email is
 * not found at all (not registered).
 */
async function getLumaStatus(
  email: string,
  eventId: string,
  apiKey: string,
): Promise<'approved' | 'not_approved' | 'not_found'> {
  const normalised = email.toLowerCase().trim()
  let cursor: string | undefined

  do {
    const url = new URL(LUMA_GUESTS_URL)
    url.searchParams.set('event_api_id', eventId)
    if (cursor) url.searchParams.set('pagination_cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { 'x-luma-api-key': apiKey },
    })

    if (!res.ok) {
      throw new Error(`Luma API responded ${res.status}: ${await res.text()}`)
    }

    const page = (await res.json()) as LumaPage

    const entry = page.entries.find(
      (e) => e.guest.email.toLowerCase().trim() === normalised,
    )

    if (entry) {
      return APPROVED_STATUSES.has(entry.guest.approval_status)
        ? 'approved'
        : 'not_approved'
    }

    cursor = page.has_more ? page.next_cursor : undefined
  } while (cursor)

  return 'not_found'
}

// ── Mint ──────────────────────────────────────────────────────────────────────

async function mintNFT(
  to: string,
  adminKey: string,
  rpcUrl: string,
): Promise<{ tokenId: string; txHash: string } | { alreadyMember: true }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer   = new ethers.Wallet(adminKey, provider)
  const nft      = new ethers.Contract(NFT_PROXY, NFT_ABI, signer)

  // Idempotency — mint reverts if already a member, but check first for a
  // cleaner response without spending gas on a revert.
  const already = await nft.isMember(to)
  if (already) return { alreadyMember: true }

  const tx      = await nft.mint(to)
  const receipt = await tx.wait()

  // Extract tokenId from the ERC-721 Transfer(0x0 → to) event
  const iface       = new ethers.Interface(NFT_ABI)
  const transferLog = receipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try { return iface.parseLog(log) } catch { return null }
    })
    .find((e: { name: string } | null) => e?.name === 'Transfer')

  const tokenId = transferLog ? transferLog.args.tokenId.toString() : 'unknown'

  console.log(`[claim] Minted tokenId=${tokenId} to ${to} tx=${receipt.hash}`)

  return { tokenId, txHash: receipt.hash }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userEmail, circlesAddress, lumaEventId } = (req.body ?? {}) as Record<string, unknown>

  // ── Validate inputs ────────────────────────────────────────────────────────
  if (!userEmail || typeof userEmail !== 'string') {
    return res.status(400).json({ error: 'Missing userEmail' })
  }
  if (!circlesAddress || !ethers.isAddress(circlesAddress as string)) {
    return res.status(400).json({ error: 'Missing or invalid circlesAddress' })
  }
  if (!lumaEventId || typeof lumaEventId !== 'string') {
    return res.status(400).json({ error: 'Missing lumaEventId' })
  }

  // ── Validate env ───────────────────────────────────────────────────────────
  const lumaApiKey  = process.env.LUMA_API_KEY
  const adminKey    = process.env.ADMIN_PRIVATE_KEY
  const rpcUrl      = process.env.SEPOLIA_RPC_URL

  if (!lumaApiKey || !adminKey || !rpcUrl) {
    console.error('[claim] Missing env vars')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  // ── Check Luma approval ────────────────────────────────────────────────────
  let lumaStatus: Awaited<ReturnType<typeof getLumaStatus>>

  try {
    lumaStatus = await getLumaStatus(userEmail as string, lumaEventId, lumaApiKey)
  } catch (err) {
    console.error('[claim] Luma error:', err)
    return res.status(502).json({ error: 'Failed to verify Luma status' })
  }

  if (lumaStatus === 'not_found') {
    return res.status(403).json({ error: 'Email not registered for this event' })
  }
  if (lumaStatus === 'not_approved') {
    return res.status(403).json({ error: 'Guest not approved for this event' })
  }

  // ── Mint ───────────────────────────────────────────────────────────────────
  try {
    const result = await mintNFT(circlesAddress as string, adminKey, rpcUrl)

    if ('alreadyMember' in result) {
      return res.status(200).json({ success: true, alreadyMember: true })
    }

    return res.status(200).json({ success: true, ...result })

  } catch (err) {
    console.error('[claim] Mint error:', err)
    return res.status(500).json({
      error: 'Mint failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
