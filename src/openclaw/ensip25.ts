// src/openclaw/ensip25.ts
// ENSIP-25: AI Agent Registry ENS Name Verification
// https://docs.ens.domains/ensip/25

export type VerificationStatus =
  | 'verified'
  | 'unverified'
  | 'pending'
  | 'error'

export interface ENSIP25Result {
  ensName:   string
  agentId:   string
  registry:  string
  textKey:   string
  status:    VerificationStatus
  rawValue?: string
}

// ERC-7930 encoding of ERC-8004 Identity Registry on Ethereum mainnet
// 0x0001 = EVM namespace, 00000101 = chain ID 1, 14 = 20-byte address length
const ERC7930_ENCODED =
  '0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432'

export function buildTextKey(registryEncoded: string, agentId: string): string {
  return `agent-registration[${registryEncoded}][${agentId}]`
}

export async function verifyENSIP25(
  ensName: string,
  agentId: string,
  registryEncoded = ERC7930_ENCODED,
): Promise<ENSIP25Result> {
  const textKey = buildTextKey(registryEncoded, agentId)

  // Demo mode: return verified without hitting RPC
  if (import.meta.env.VITE_OPENCLAW_DEMO === 'true') {
    return { ensName, agentId, registry: registryEncoded, textKey,
             status: 'verified', rawValue: '1' }
  }

  try {
    const { ethers } = await import('ethers')
    const rpcUrls = [
      import.meta.env.VITE_ENS_RPC_URL,
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
      'https://1rpc.io/eth',
    ].filter(Boolean) as string[]

    let rawValue: string | null = null

    for (const url of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(url)
        const resolver = await provider.getResolver(ensName)
        if (!resolver) break
        rawValue = await resolver.getText(textKey)
        break
      } catch {
        continue
      }
    }

    return {
      ensName, agentId, registry: registryEncoded, textKey,
      status:   rawValue ? 'verified' : 'unverified',
      rawValue: rawValue ?? undefined,
    }
  } catch {
    return { ensName, agentId, registry: registryEncoded, textKey,
             status: 'error' }
  }
}

export const AGENT_VERIFIERS = {
  alice:    () => verifyENSIP25('alice.whispery.eth',    '1'),
  betty:    () => verifyENSIP25('betty.whispery.eth',    '2'),
  caroline: () => verifyENSIP25('caroline.whispery.eth', '3'),
} as const
