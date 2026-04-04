/**
 * Luma → EAS Oracle
 *
 * Vercel Serverless Function (also compatible with AWS Lambda via a thin adapter).
 *
 * Environment variables required:
 *   PRIVATE_KEY        — hex private key of the signing/paying wallet (no 0x prefix)
 *   EAS_SCHEMA_UID     — bytes32 UID of the registered schema on Gnosis EAS
 *
 * Luma webhook payload path:
 *   req.body.payload.guest.email
 *   req.body.payload.guest.status   → only 'approved' triggers attestation
 *   req.body.payload.event.api_id
 *
 * EAS on Gnosis Chain:
 *   Contract : 0xFd80aC8c1572A6A4F6E39e5e3DF027B2bD2AC7bc
 *   RPC      : https://rpc.gnosischain.com
 *   Chain ID : 100
 *
 * Schema (register once via EAS SDK or https://app.attest.org):
 *   bytes32 hashedEmail, string eventId, bool isApproved
 */

'use strict'

const { ethers }                                = require('ethers')
const { EAS, SchemaEncoder }                    = require('@ethereum-attestation-service/eas-sdk')

// ── Constants ─────────────────────────────────────────────────────────────────

const EAS_CONTRACT_ADDRESS = '0xFd80aC8c1572A6A4F6E39e5e3DF027B2bD2AC7bc'
const RPC_URL              = 'https://rpc.gnosischain.com'
const SCHEMA_STRING        = 'bytes32 hashedEmail,string eventId,bool isApproved'

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Normalise and hash an email address.
 * Lowercase + trim → keccak256 of the UTF-8 bytes.
 * @param {string} raw
 * @returns {string} 0x-prefixed bytes32 hex
 */
function hashEmail(raw) {
  const normalised = raw.toLowerCase().trim()
  return ethers.keccak256(ethers.toUtf8Bytes(normalised))
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Vercel handler signature.
 * For AWS Lambda wrap this: exports.handler = async (event) => { ... }
 */
module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = req.body?.payload

    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' })
    }

    const email   = payload?.guest?.email
    const status  = payload?.guest?.status
    const eventId = payload?.event?.api_id

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing guest.email' })
    }
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'Missing event.api_id' })
    }

    // Only attest approved guests
    if (status !== 'approved') {
      console.log(`[oracle] Skipped — status is '${status}' for event ${eventId}`)
      return res.status(200).json({ skipped: true, reason: 'not_approved', status })
    }

    // Validate env
    if (!process.env.PRIVATE_KEY) {
      console.error('[oracle] PRIVATE_KEY env var not set')
      return res.status(500).json({ error: 'Server misconfiguration' })
    }
    if (!process.env.EAS_SCHEMA_UID) {
      console.error('[oracle] EAS_SCHEMA_UID env var not set')
      return res.status(500).json({ error: 'Server misconfiguration' })
    }

    const schemaUID = process.env.EAS_SCHEMA_UID

    // ── Set up provider + signer ─────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider)

    // ── Initialise EAS ───────────────────────────────────────────────────────
    const eas = new EAS(EAS_CONTRACT_ADDRESS)
    eas.connect(signer)

    // ── Encode attestation data ──────────────────────────────────────────────
    const hashedEmail   = hashEmail(email)
    const schemaEncoder = new SchemaEncoder(SCHEMA_STRING)

    const encodedData = schemaEncoder.encodeData([
      { name: 'hashedEmail', value: hashedEmail, type: 'bytes32' },
      { name: 'eventId',     value: eventId,     type: 'string'  },
      { name: 'isApproved',  value: true,        type: 'bool'    },
    ])

    // ── Submit attestation ───────────────────────────────────────────────────
    console.log(`[oracle] Attesting — event=${eventId} hash=${hashedEmail.slice(0, 10)}…`)

    const tx = await eas.attest({
      schema: schemaUID,
      data: {
        recipient:            ethers.ZeroAddress, // no on-chain recipient — hash is the identifier
        expirationTime:       0n,                 // no expiry
        revocable:            true,
        data:                 encodedData,
      },
    })

    const receipt    = await tx.wait()
    const newUID     = receipt             // EAS SDK returns the UID string directly from wait()

    console.log(`[oracle] Attestation confirmed — UID=${newUID}`)

    return res.status(200).json({
      success:      true,
      attestation:  newUID,
      hashedEmail:  hashedEmail,
      eventId,
    })

  } catch (err) {
    console.error('[oracle] Unhandled error:', err)
    return res.status(500).json({
      error:   'Internal server error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
