'use strict'

/**
 * Luma → EAS Oracle  —  Vercel Serverless Function
 *
 * Entry point: only handles HTTP concerns (parse, validate, respond).
 * All business logic lives in lib/.
 *
 * Env vars (set in Vercel dashboard or .env):
 *   PRIVATE_KEY      — hex private key of the signing/paying wallet (no 0x prefix)
 *   EAS_SCHEMA_UID   — bytes32 UID of the registered schema on Gnosis EAS
 *
 * Luma webhook paths used:
 *   req.body.payload.guest.email
 *   req.body.payload.guest.status   → must be 'approved' to emit attestation
 *   req.body.payload.event.api_id
 */

const { loadEnv }         = require('./lib/config')
const { hashEmail }       = require('./lib/email')
const { emitAttestation } = require('./lib/attest')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Parse webhook payload ────────────────────────────────────────────────
  const payload = req.body?.payload
  if (!payload) {
    return res.status(400).json({ error: 'Missing payload' })
  }

  const email   = payload?.guest?.email
  const status  = payload?.guest?.status
  const eventId = payload?.event?.api_id

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Missing guest.email' })
  }
  if (!eventId || typeof eventId !== 'string') {
    return res.status(400).json({ error: 'Missing event.api_id' })
  }

  // ── Gate: only attest approved guests ────────────────────────────────────
  if (status !== 'approved') {
    console.log(`[oracle] Skipped — status='${status}' event=${eventId}`)
    return res.status(200).json({ skipped: true, reason: 'not_approved', status })
  }

  // ── Attest ────────────────────────────────────────────────────────────────
  try {
    const env          = loadEnv()                  // throws if PRIVATE_KEY / EAS_SCHEMA_UID missing
    const hashedEmail  = hashEmail(email)

    console.log(`[oracle] Attesting — event=${eventId} hash=${hashedEmail.slice(0, 10)}…`)

    const uid = await emitAttestation({
      privateKey:   env.privateKey,
      schemaUID:    env.schemaUID,
      hashedEmail,
      eventId,
    })

    console.log(`[oracle] Confirmed — UID=${uid}`)

    return res.status(200).json({ success: true, attestation: uid, hashedEmail, eventId })

  } catch (err) {
    const isConfig = err.message.includes('env var not set')
    console.error('[oracle]', err.message)
    return res.status(isConfig ? 500 : 502).json({
      error:   isConfig ? 'Server misconfiguration' : 'Attestation failed',
      message: err.message,
    })
  }
}
