import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { keysFromSig } from '../core/crypto'
import type { Wallet } from '../core/crypto'

const STORAGE_KEY = 'whispery_session_key'

/**
 * A session key is an ephemeral EOA generated once per browser session and
 * stored in localStorage. It is used as the source of the Waku identity keys
 * (X25519 + secp256k1) instead of the Circles Safe address directly, because
 * a Safe cannot sign messages quickly for every Waku envelope.
 *
 * The Safe authorises this EOA exactly once by signing a SIWE message. That
 * signature becomes the deterministic seed for all Whispery crypto operations.
 */
export interface SessionKey {
  /** Ephemeral EOA address (used in the SIWE authorisation message) */
  eoa: string
  /** Ephemeral EOA private key — kept only in memory + localStorage */
  privateKey: string
  /** Derived Whispery wallet (x25519 + secp256k1), populated after SIWE */
  wallet: Wallet | null
  /** The Safe's SIWE signature — present once the user has signed */
  siweSignature: string | null
}

export function useSessionKey() {
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null)

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const stored = JSON.parse(raw) as SessionKey
      // wallet contains Uint8Array that was stringified — rebuild it
      setSessionKey({ ...stored, wallet: null })
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /**
   * Generate a new ephemeral EOA and persist it. Called after successful mint.
   * Does NOT sign yet — the Safe still needs to approve this key.
   */
  function generateSessionKey(): SessionKey {
    const wallet = ethers.Wallet.createRandom()
    const key: SessionKey = {
      eoa:           wallet.address,
      privateKey:    wallet.privateKey,
      wallet:        null,
      siweSignature: null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(key))
    setSessionKey(key)
    return key
  }

  /**
   * Finalise the session key by attaching the SIWE signature from the Safe.
   * Derives the Whispery Wallet (x25519 + secp256k1) from that signature.
   *
   * @param signature   Hex signature returned by the Safe (EIP-1271)
   * @param safeAddress The Circles Safe address that signed
   */
  function activateWithSig(signature: string, safeAddress: string): Wallet {
    if (!sessionKey) throw new Error('No session key — call generateSessionKey first')

    const wallet  = keysFromSig(signature, safeAddress)
    const updated = { ...sessionKey, siweSignature: signature, wallet }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...updated, wallet: null }))
    setSessionKey(updated)
    return wallet
  }

  function clearSessionKey() {
    localStorage.removeItem(STORAGE_KEY)
    setSessionKey(null)
  }

  return { sessionKey, generateSessionKey, activateWithSig, clearSessionKey }
}
