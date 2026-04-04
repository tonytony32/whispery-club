import { ethers } from 'ethers'

/**
 * In-memory cache: address → ENS name (or truncated address if no ENS).
 * Lives for the duration of the browser session — good enough for demo.
 * No-ENS addresses are also cached so we don't re-query.
 */
const ensCache = new Map<string, string>()

/** Mainnet RPCs tried in order until one works.
 *  VITE_ENS_RPC_URL (e.g. Alchemy) goes first if set. */
const MAINNET_RPCS = [
  import.meta.env.VITE_ENS_RPC_URL,
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
  'https://1rpc.io/eth',
].filter(Boolean) as string[]

export function truncateAddress(address: string): string {
  return address.slice(0, 6) + '…' + address.slice(-4)
}

async function mainnetProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of MAINNET_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url)
      await p.getNetwork() // quick liveness check
      return p
    } catch { /* try next */ }
  }
  throw new Error('All mainnet RPCs unavailable')
}

/**
 * Reverse-resolves an address to its ENS name.
 * Falls back to truncated address on any failure or missing name.
 */
export async function resolveDisplayName(
  address: string,
  _provider?: ethers.BrowserProvider,
): Promise<string> {
  if (ensCache.has(address)) return ensCache.get(address)!
  try {
    const provider = await mainnetProvider()
    const name     = await provider.lookupAddress(address)
    const display  = name ?? truncateAddress(address)
    ensCache.set(address, display)
    return display
  } catch {
    const display = truncateAddress(address)
    ensCache.set(address, display)
    return display
  }
}

/** Forward-resolves an ENS name to an address. Returns null if not found. */
export async function resolveENSName(name: string): Promise<string | null> {
  try {
    const provider = await mainnetProvider()
    return await provider.resolveName(name)
  } catch {
    return null
  }
}
