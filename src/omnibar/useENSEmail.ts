import { useState } from 'react'
import { ethers } from 'ethers'

/**
 * Attempts to resolve the 'email' text record from an ENS name.
 *
 * Flow:
 *   1. Reverse-resolve address → ENS name (e.g. alice.eth)
 *   2. Get the resolver for that name
 *   3. Read getText('email')
 *
 * Returns null if:
 *   - The address has no ENS name
 *   - The ENS name has no email text record
 *   - Any resolution step fails
 *
 * This is a best-effort lookup — callers must handle the null case
 * and fall back to manual email input.
 */
export function useENSEmail() {
  const [email, setEmail]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState<string | null>(null)

  async function resolveEmail(address: string, provider: ethers.BrowserProvider) {
    setLoading(true)
    setEmail(null)
    setStatus(null)

    try {
      // Step 1 — reverse lookup: address → ENS name
      const ensName = await provider.lookupAddress(address)
      if (!ensName) {
        setStatus('No email found in ENS registry — enter your email manually.')
        return null
      }

      // Step 2 — get resolver
      const resolver = await provider.getResolver(ensName)
      if (!resolver) {
        setStatus('No email found in ENS registry — enter your email manually.')
        return null
      }

      // Step 3 — read email text record
      const ensEmail = await resolver.getText('email')
      if (!ensEmail) {
        setStatus('No email found in ENS registry — enter your email manually.')
        return null
      }

      setEmail(ensEmail)
      setStatus(`Email found via ENS: ${ensEmail}`)
      return ensEmail

    } catch (err) {
        setStatus('No email found in ENS registry — enter your email manually.')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { email, loading, status, resolveEmail }
}
