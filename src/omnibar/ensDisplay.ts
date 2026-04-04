import { ethers } from 'ethers'

/**
 * In-memory cache: address → ENS name (or truncated address if no ENS).
 * Lives for the duration of the browser session — good enough for demo.
 * No-ENS addresses are also cached so we don't re-query.
 */
const ensCache = new Map<string, string>()

export function truncateAddress(address: string): string {
  return address.slice(0, 6) + '…' + address.slice(-4)
}

/**
 * Reverse-resolves an address to its ENS name.
 * Falls back to truncated address on any failure or missing name.
 * ENS lives on mainnet — uses getDefaultProvider('mainnet') internally.
 * The provider param is accepted for API compat but not used for the lookup.
 */
export async function resolveDisplayName(
  address: string,
  _provider?: ethers.BrowserProvider,
): Promise<string> {
  if (ensCache.has(address)) return ensCache.get(address)!
  try {
    const mainnet = ethers.getDefaultProvider('mainnet')
    const name    = await mainnet.lookupAddress(address)
    const display = name ?? truncateAddress(address)
    ensCache.set(address, display)
    return display
  } catch {
    const display = truncateAddress(address)
    ensCache.set(address, display)
    return display
  }
}
