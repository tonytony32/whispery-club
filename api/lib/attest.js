'use strict'

/**
 * EAS attestation layer.
 * Responsible for: provider setup, signer, schema encoding, tx submission.
 * Has no knowledge of HTTP — takes plain data, returns the attestation UID.
 */

const { ethers }             = require('ethers')
const { EAS, SchemaEncoder } = require('@ethereum-attestation-service/eas-sdk')
const { EAS_CONTRACT_ADDRESS, SCHEMA_STRING } = require('./config')

/**
 * Emit an on-chain EAS attestation on Sepolia.
 *
 * @param {object} params
 * @param {string} params.privateKey   Hex private key of the paying wallet
 * @param {string} params.schemaUID    bytes32 UID of the registered schema
 * @param {string} params.hashedEmail  bytes32 keccak256 hash of the normalised email
 * @param {string} params.eventId      Luma event API ID
 * @param {string} params.rpcUrl       Sepolia RPC endpoint
 * @returns {Promise<string>}          UID of the new attestation
 */
async function emitAttestation({ privateKey, schemaUID, hashedEmail, eventId, rpcUrl }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer   = new ethers.Wallet(privateKey, provider)

  const eas = new EAS(EAS_CONTRACT_ADDRESS)
  eas.connect(signer)

  const encoder     = new SchemaEncoder(SCHEMA_STRING)
  const encodedData = encoder.encodeData([
    { name: 'hashedEmail', value: hashedEmail, type: 'bytes32' },
    { name: 'eventId',     value: eventId,     type: 'string'  },
    { name: 'isApproved',  value: true,        type: 'bool'    },
  ])

  const tx  = await eas.attest({
    schema: schemaUID,
    data: {
      recipient:      ethers.ZeroAddress, // identity is the hashed email, not an address
      expirationTime: 0n,
      revocable:      true,
      data:           encodedData,
    },
  })

  const uid = await tx.wait() // EAS SDK resolves to the new UID string
  return uid
}

module.exports = { emitAttestation }
