'use strict'

/**
 * EAS / Sepolia constants and runtime env validation.
 * Import this first — throws early if the function is misconfigured.
 *
 * EAS on Sepolia:
 *   Explorer  : https://sepolia.easscan.org
 *   EAS       : 0xC2679fBD37d54388Ce493F1DB75320D236e1815e
 *   Chain ID  : 11155111
 */

const EAS_CONTRACT_ADDRESS = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e'
// Schema registered on Sepolia: bytes32 hashedEmail, string eventId, bool isApproved

/**
 * Load and validate required environment variables.
 * @throws {Error} if any required var is missing
 * @returns {{ privateKey: string, schemaUID: string, rpcUrl: string }}
 */
function loadEnv() {
  const privateKey = process.env.PRIVATE_KEY
  const schemaUID  = process.env.EAS_SCHEMA_UID
  const rpcUrl     = process.env.SEPOLIA_RPC_URL

  if (!privateKey) throw new Error('PRIVATE_KEY env var not set')
  if (!schemaUID)  throw new Error('EAS_SCHEMA_UID env var not set')
  if (!rpcUrl)     throw new Error('SEPOLIA_RPC_URL env var not set')

  return { privateKey, schemaUID, rpcUrl }
}

module.exports = { EAS_CONTRACT_ADDRESS, loadEnv }
