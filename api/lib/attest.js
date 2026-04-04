'use strict'

/**
 * EAS attestation layer — direct ethers contract call, no EAS SDK.
 *
 * EAS contract ABI (only the two pieces we need):
 *   attest(AttestationRequest) → bytes32 uid
 *   event Attested(recipient, attester, uid, schemaUID)
 *
 * AttestationRequest = {
 *   bytes32 schema,
 *   AttestationRequestData data: {
 *     address recipient, uint64 expirationTime, bool revocable,
 *     bytes32 refUID, bytes data, uint256 value
 *   }
 * }
 */

const { ethers }             = require('ethers')
const { EAS_CONTRACT_ADDRESS } = require('./config')

const EAS_ABI = [
  'function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) payable returns (bytes32)',
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
]

/**
 * Emit an on-chain EAS attestation on Sepolia.
 *
 * @param {object} params
 * @param {string} params.privateKey   Hex private key of the paying wallet
 * @param {string} params.schemaUID    bytes32 UID of the registered schema
 * @param {string} params.hashedEmail  bytes32 keccak256 hash of the normalised email
 * @param {string} params.eventId      Luma event API ID
 * @param {string} params.rpcUrl       Sepolia RPC endpoint
 * @returns {Promise<string>}          UID of the new attestation (bytes32 hex)
 */
async function emitAttestation({ privateKey, schemaUID, hashedEmail, eventId, rpcUrl }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer   = new ethers.Wallet(privateKey, provider)
  const eas      = new ethers.Contract(EAS_CONTRACT_ADDRESS, EAS_ABI, signer)

  // Encode the three schema fields in the same order they were registered
  const abiCoder    = ethers.AbiCoder.defaultAbiCoder()
  const encodedData = abiCoder.encode(
    ['bytes32', 'string', 'bool'],
    [hashedEmail, eventId, true],
  )

  const tx      = await eas.attest({
    schema: schemaUID,
    data: {
      recipient:      ethers.ZeroAddress, // identity is the hashed email, not an address
      expirationTime: 0n,
      revocable:      true,
      refUID:         ethers.ZeroHash,
      data:           encodedData,
      value:          0n,
    },
  })

  const receipt = await tx.wait()

  // Extract the UID from the Attested event emitted by the contract
  const attested = receipt.logs
    .map(log => { try { return eas.interface.parseLog(log) } catch { return null } })
    .find(e => e?.name === 'Attested')

  return attested.args.uid
}

module.exports = { emitAttestation }
