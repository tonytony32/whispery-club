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

// staticNetwork: skip ethers v6 auto-detection (no eth_chainId call,
// no internal "retry in 1s" loop). Constructor never throws, so we retry
// at the call-site level so each RPC is tried for the real operation.
const MAINNET = ethers.Network.from(1)

function makeProvider(url: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(url, MAINNET, { staticNetwork: MAINNET })
}

/**
 * Reverse-resolves an address to its ENS name.
 * Tries each RPC in turn; falls back to truncated address.
 */
export async function resolveDisplayName(
  address: string,
  _provider?: ethers.BrowserProvider,
): Promise<string> {
  if (ensCache.has(address)) return ensCache.get(address)!
  for (const url of MAINNET_RPCS) {
    try {
      const name    = await makeProvider(url).lookupAddress(address)
      const display = name ?? truncateAddress(address)
      ensCache.set(address, display)
      return display
    } catch { /* RPC failed — try next */ }
  }
  const display = truncateAddress(address)
  ensCache.set(address, display)
  return display
}

/**
 * Forward-resolves an ENS name to an address.
 * Tries each RPC in turn; returns null if no record or all RPCs fail.
 */
export async function resolveENSName(name: string): Promise<string | null> {
  for (const url of MAINNET_RPCS) {
    try {
      return await makeProvider(url).resolveName(name)
    } catch { /* RPC failed — try next */ }
  }
  return null
}
