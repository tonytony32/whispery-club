/**
 * POST /api/resolve-event
 *
 * Universal claim endpoint. Receives a Luma event URL, a verified email,
 * and a target wallet. Checks Luma approval and mints WhisperyNFT.
 * Stateless — no database.
 *
 * Body:
 *   { eventUrl: string, verifiedEmail: string, targetWallet: string }
 *
 * Responses:
 *   200 { success, tokenId, txHash }
 *   200 { success, alreadyMember: true }
 *   400 invalid inputs
 *   403 email not found / not approved
 *   500 / 502 server / Luma / chain errors
 *
 * Env vars:
 *   LUMA_API_KEY       — get at lu.ma/settings/developer
 *   ADMIN_PRIVATE_KEY  — owner wallet that can call mint()
 *   SEPOLIA_RPC_URL    — Sepolia RPC endpoint
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

const LUMA_GUESTS_URL  = 'https://api.lu.ma/v1/event/get-guests'
const APPROVED_STATUSES = new Set(['approved', 'checked_in'])

// ── URL parsing ───────────────────────────────────────────────────────────────

/**
 * Extracts the event identifier from a Luma URL.
 *
 * Supported formats:
 *   https://lu.ma/3wczh9p4        → "3wczh9p4"
 *   https://lu.ma/evt-abc123      → "evt-abc123"
 *   https://lu.ma/my-event-slug   → "my-event-slug"
 *
 * The extracted slug is passed directly to the Luma API as event_api_id.
 * If Luma returns no results with the slug, the user may need to provide
 * the internal evt-xxx ID from the Luma dashboard.
 */
function extractLumaId(eventUrl: string): string | null {
  try {
    const url  = new URL(eventUrl)
    const slug = url.pathname.replace(/^\//, '').split('/')[0].trim()
    return slug || null
  } catch {
    return null
  }
}

// ── Luma guest check ──────────────────────────────────────────────────────────

interface LumaPage {
  entries: Array<{ guest: { email: string; approval_status: string } }>
  has_more: boolean
  next_cursor?: string
}

async function getLumaStatus(
  email:   string,
  eventId: string,
  apiKey:  string,
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

    if (!res.ok) throw new Error(`Luma API ${res.status}: ${await res.text()}`)

    const page = (await res.json()) as LumaPage

    const entry = page.entries.find(
      e => e.guest.email.toLowerCase().trim() === normalised,
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
  to:       string,
  adminKey: string,
  rpcUrl:   string,
): Promise<{ tokenId: string; txHash: string } | { alreadyMember: true }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer   = new ethers.Wallet(adminKey, provider)
  const nft      = new ethers.Contract(NFT_PROXY, NFT_ABI, signer)

  // Check first — avoids spending gas on a revert
  if (await nft.isMember(to)) return { alreadyMember: true }

  const tx      = await nft.mint(to)
  const receipt = await tx.wait()

  const iface       = new ethers.Interface(NFT_ABI)
  const transferLog = receipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try { return iface.parseLog(log) } catch { return null }
    })
    .find((e: { name: string } | null) => e?.name === 'Transfer')

  const tokenId = transferLog?.args.tokenId.toString() ?? 'unknown'
  console.log(`[resolve-event] Minted tokenId=${tokenId} → ${to} tx=${receipt.hash}`)

  return { tokenId, txHash: receipt.hash }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { eventUrl, verifiedEmail, targetWallet } =
    (req.body ?? {}) as Record<string, unknown>

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!eventUrl || typeof eventUrl !== 'string') {
    return res.status(400).json({ error: 'Missing eventUrl' })
  }
  if (!verifiedEmail || typeof verifiedEmail !== 'string') {
    return res.status(400).json({ error: 'Missing verifiedEmail' })
  }
  if (!targetWallet || !ethers.isAddress(targetWallet as string)) {
    return res.status(400).json({ error: 'Missing or invalid targetWallet' })
  }

  const lumaId = extractLumaId(eventUrl)
  if (!lumaId) {
    return res.status(400).json({ error: 'Could not parse a Luma event ID from the URL' })
  }

  // ── Env ────────────────────────────────────────────────────────────────────
  const lumaApiKey = process.env.LUMA_API_KEY
  const adminKey   = process.env.ADMIN_PRIVATE_KEY
  const rpcUrl     = process.env.SEPOLIA_RPC_URL

  if (!lumaApiKey || !adminKey || !rpcUrl) {
    console.error('[resolve-event] Missing env vars')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  // ── Luma check ─────────────────────────────────────────────────────────────
  let lumaStatus: Awaited<ReturnType<typeof getLumaStatus>>

  try {
    lumaStatus = await getLumaStatus(verifiedEmail as string, lumaId, lumaApiKey)
  } catch (err) {
    console.error('[resolve-event] Luma error:', err)
    return res.status(502).json({ error: 'Could not reach Luma API — try again shortly.' })
  }

  if (lumaStatus === 'not_found') {
    return res.status(403).json({
      error: 'This email is not registered for the event.',
      hint:  'Make sure you use the exact email you signed up with on Luma.',
    })
  }

  if (lumaStatus === 'not_approved') {
    return res.status(403).json({
      error: 'Your registration is pending or was not approved.',
      hint:  'Contact the event organiser if you believe this is a mistake.',
    })
  }

  // ── Mint ───────────────────────────────────────────────────────────────────
  try {
    const result = await mintNFT(targetWallet as string, adminKey, rpcUrl)

    if ('alreadyMember' in result) {
      return res.status(200).json({ success: true, alreadyMember: true })
    }

    return res.status(200).json({ success: true, ...result })

  } catch (err) {
    console.error('[resolve-event] Mint error:', err)
    return res.status(500).json({
      error:   'NFT mint failed.',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
