'use strict'

/**
 * EAS / Gnosis Chain constants and runtime env validation.
 * Import this first — throws early if the function is misconfigured.
 */

const EAS_CONTRACT_ADDRESS = '0xFd80aC8c1572A6A4F6E39e5e3DF027B2bD2AC7bc'
const RPC_URL              = 'https://rpc.gnosischain.com'
const SCHEMA_STRING        = 'bytes32 hashedEmail,string eventId,bool isApproved'

/**
 * Load and validate required environment variables.
 * @throws {Error} if any required var is missing
 * @returns {{ privateKey: string, schemaUID: string }}
 */
function loadEnv() {
  const privateKey = process.env.PRIVATE_KEY
  const schemaUID  = process.env.EAS_SCHEMA_UID

  if (!privateKey) throw new Error('PRIVATE_KEY env var not set')
  if (!schemaUID)  throw new Error('EAS_SCHEMA_UID env var not set')

  return { privateKey, schemaUID }
}

module.exports = { EAS_CONTRACT_ADDRESS, RPC_URL, SCHEMA_STRING, loadEnv }
