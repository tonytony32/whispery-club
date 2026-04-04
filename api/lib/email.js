'use strict'

const { ethers } = require('ethers')

/**
 * Normalise an email and hash it with keccak256.
 *
 * Normalisation: lowercase + trim (strips accidental whitespace).
 * The hash is deterministic — same email always produces the same bytes32.
 *
 * @param {string} raw  Raw email from the webhook payload
 * @returns {string}    0x-prefixed bytes32 hex string
 */
function hashEmail(raw) {
  const normalised = raw.toLowerCase().trim()
  return ethers.keccak256(ethers.toUtf8Bytes(normalised))
}

module.exports = { hashEmail }
