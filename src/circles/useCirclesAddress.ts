import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

/**
 * Resolves the connected wallet address from the injected EIP-1193 provider.
 *
 * In the Circles Mini-app context, `window.ethereum` is the Safe's injected
 * provider — the address returned is the Gnosis Safe (Smart Account) address,
 * not an EOA. All on-chain interactions (NFT mint target, SIWE signing) use
 * this address.
 */
export interface CirclesWallet {
  address: string | null
  provider: ethers.BrowserProvider | null
  connect: () => Promise<void>
  signMessage: (message: string) => Promise<string>
}

export function useCirclesAddress(): CirclesWallet {
  const [address, setAddress]   = useState<string | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)

  useEffect(() => {
    const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
    if (!eth) return

    const p = new ethers.BrowserProvider(eth)
    setProvider(p)

    // Restore already-connected account without prompting
    p.listAccounts().then(accounts => {
      if (accounts.length > 0) setAddress(accounts[0].address)
    })

    const onAccountsChanged = (accounts: string[]) => {
      setAddress(accounts[0] ?? null)
    }

    eth.on?.('accountsChanged', onAccountsChanged)
    return () => { eth.removeListener?.('accountsChanged', onAccountsChanged) }
  }, [])

  async function connect() {
    if (!provider) throw new Error('No injected provider found')
    const accounts = await provider.send('eth_requestAccounts', [])
    setAddress(accounts[0] ?? null)
  }

  async function signMessage(message: string): Promise<string> {
    if (!provider || !address) throw new Error('Wallet not connected')
    const signer = await provider.getSigner()
    // Safe wallets return an EIP-1271 signature here — compatible with
    // the keysFromSig derivation in src/core/crypto.ts.
    return signer.signMessage(message)
  }

  return { address, provider, connect, signMessage }
}
