/**
 * Omnibar — the universal entry point for Whispery
 *
 * Accepts three input types:
 *
 *   1. Luma URL   (https://lu.ma/…)
 *      → opens VerificationFlow to check approval + mint NFT
 *
 *   2. NFT contract address  (0x…)
 *      → connects wallet and checks ownership on-chain
 *      → if the wallet holds a token, enters the chat directly
 *
 *   3. ENS name  (alice.eth)
 *      → resolves ENS → address on mainnet
 *      → checks if that address holds a WhisperyNFT on Sepolia
 *      → shows ENS name throughout UI, never raw address
 */

import { useState }                              from 'react'
import { ethers }                                from 'ethers'
import VerificationFlow                          from './VerificationFlow'
import { resolveDisplayName, truncateAddress }   from './ensDisplay'

// ── Config ────────────────────────────────────────────────────────────────────

/** WhisperyNFT UUPS Proxy on Sepolia */
const WHISPERY_NFT_ADDRESS = '0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16'

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg:      '#0b0b0e',
  surface: '#13131a',
  raised:  '#1a1a24',
  border:  '#25253a',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
  green:   '#3ddc97',
  red:     '#ff5a5a',
  yellow:  '#ffc83d',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

// ── Input detection ───────────────────────────────────────────────────────────

type InputKind = 'luma-url' | 'nft-address' | 'ens-name' | 'unknown'

function detectKind(value: string): InputKind {
  const v = value.trim()
  if (v.startsWith('http') && v.includes('lu.ma')) return 'luma-url'
  if (/^0x[0-9a-fA-F]{40}$/.test(v))              return 'nft-address'
  if (/\.eth$/i.test(v) && !v.startsWith('http'))  return 'ens-name'
  return 'unknown'
}

const ERC721_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Omnibar() {
  const [value, setValue]       = useState('')
  const [kind, setKind]         = useState<InputKind>('unknown')
  const [showFlow, setShowFlow] = useState(false)

  // NFT path state
  const [nftChecking, setNftChecking]               = useState(false)
  const [nftError, setNftError]                     = useState<string | null>(null)
  const [nftGranted, setNftGranted]                 = useState(false)
  const [nftName, setNftName]                       = useState<string | null>(null)
  const [connectedDisplayName, setConnectedDisplay] = useState<string | null>(null)

  // ENS path state
  const [ensChecking, setEnsChecking]   = useState(false)
  const [ensError, setEnsError]         = useState<string | null>(null)
  const [ensGranted, setEnsGranted]     = useState(false)
  const [ensDisplayName, setEnsDisplay] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue(v)
    setKind(detectKind(v))
    setNftError(null)
    setNftGranted(false)
    setConnectedDisplay(null)
    setEnsError(null)
    setEnsGranted(false)
    setEnsDisplay(null)
  }

  function handleGo() {
    if (kind === 'luma-url')    setShowFlow(true)
    if (kind === 'nft-address') checkNFTOwnership(value.trim())
    if (kind === 'ens-name')    checkENSName(value.trim())
  }

  // ── NFT ownership check (path 2) ─────────────────────────────────────────────
  async function checkNFTOwnership(contractAddress: string) {
    setNftChecking(true)
    setNftError(null)

    const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
    if (!eth) {
      setNftError('No wallet found — install MetaMask or another Web3 wallet.')
      setNftChecking(false)
      return
    }

    try {
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer  = await provider.getSigner()
      const address = await signer.getAddress()

      const nft     = new ethers.Contract(contractAddress, ERC721_ABI, provider)
      const balance = await nft.balanceOf(address)
      let   name    = contractAddress.slice(0, 10) + '…'

      try { name = await nft.name() } catch { /* not all contracts implement name() */ }

      setNftName(name)

      if (balance > 0n) {
        setNftGranted(true)
        // Reverse-lookup: show ENS name if the connected wallet has one
        const display = await resolveDisplayName(address, provider)
        setConnectedDisplay(display)
      } else {
        setNftError(`Your wallet doesn't hold any token from ${name}.`)
      }
    } catch (err) {
      setNftError(err instanceof Error ? err.message : 'Ownership check failed.')
    } finally {
      setNftChecking(false)
    }
  }

  // ── ENS name → membership check (path 3) ─────────────────────────────────────
  async function checkENSName(ensName: string) {
    setEnsChecking(true)
    setEnsError(null)

    try {
      // Step 1 — forward resolve: ENS name → address (ENS lives on mainnet)
      const mainnet  = ethers.getDefaultProvider('mainnet')
      const resolved = await (mainnet as ethers.AbstractProvider).resolveName(ensName)

      if (!resolved) {
        setEnsError(`ENS name "${ensName}" not found.`)
        return
      }

      // Step 2 — check WhisperyNFT balance on Sepolia
      const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
      if (!eth) {
        setEnsError('No wallet found — install MetaMask or another Web3 wallet.')
        return
      }

      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])

      const nft     = new ethers.Contract(WHISPERY_NFT_ADDRESS, ERC721_ABI, provider)
      const balance = await nft.balanceOf(resolved)

      if (balance > 0n) {
        setEnsGranted(true)
        setEnsDisplay(ensName) // always show ENS name, never raw address
      } else {
        setEnsError(`${ensName} doesn't hold a membership token.`)
      }
    } catch (err) {
      setEnsError(err instanceof Error ? err.message : 'ENS resolution failed.')
    } finally {
      setEnsChecking(false)
    }
  }

  const isChecking = nftChecking || ensChecking

  // ── Render ────────────────────────────────────────────────────────────────────
  const placeholder =
    kind === 'luma-url'    ? 'Luma event URL detected →' :
    kind === 'nft-address' ? 'NFT contract detected →' :
    kind === 'ens-name'    ? 'ENS name detected →' :
                             'Paste a Luma URL, NFT contract, or ENS name (alice.eth)…'

  const btnLabel =
    isChecking             ? 'Checking…' :
    kind === 'luma-url'    ? 'Claim access →' :
    kind === 'nft-address' ? 'Check ownership →' :
    kind === 'ens-name'    ? `Resolve ${value.trim()} →` :
                             '↵'

  const btnEnabled = kind !== 'unknown' && !isChecking

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>

      {/* Logo */}
      <div style={{ ...mono, color: C.accent, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Whispery
      </div>
      <div style={{ ...mono, color: C.muted, fontSize: 13, marginBottom: 40 }}>
        Private group messaging. Gated by what you hold or where you've been.
      </div>

      {/* The bar */}
      <div style={{
        width: '100%', maxWidth: 600,
        display: 'flex', gap: 0,
        background: C.raised,
        border: `1px solid ${kind !== 'unknown' ? C.accent + '88' : C.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}>
        <input
          value={value}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && btnEnabled && handleGo()}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'transparent',
            border: 'none', outline: 'none',
            padding: '16px 20px',
            ...mono, fontSize: 14, color: C.text,
          }}
          autoFocus
        />
        <button
          onClick={handleGo}
          disabled={!btnEnabled}
          style={{
            ...mono, fontWeight: 700, fontSize: 13,
            padding: '0 24px',
            background: btnEnabled ? C.accent : 'transparent',
            color: btnEnabled ? '#fff' : C.dim,
            border: 'none', cursor: btnEnabled ? 'pointer' : 'default',
            transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {btnLabel}
        </button>
      </div>

      {/* Hint below bar */}
      {kind === 'unknown' && (
        <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 14, textAlign: 'center' }}>
          Examples:&nbsp;
          <span style={{ color: C.muted }}>https://lu.ma/3wczh9p4</span>
          &nbsp;·&nbsp;
          <span style={{ color: C.muted }}>0x51a5a1c7…</span>
          &nbsp;·&nbsp;
          <span style={{ color: C.muted }}>alice.eth</span>
        </div>
      )}

      {/* NFT result (path 2) */}
      {nftGranted && (
        <div style={{
          ...mono, marginTop: 24, padding: '16px 24px',
          background: C.raised, border: `1px solid ${C.green}55`,
          borderRadius: 10, color: C.green, fontSize: 13,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          ✓ Token verified —{' '}
          <strong>{connectedDisplayName ?? truncateAddress(value.trim())}</strong>
          {' '}is a member of <strong>{nftName}</strong>.
          <br />
          <span style={{ color: C.muted, fontSize: 11 }}>
            {/* TODO: navigate to <MessengerView /> */}
            Opening chat…
          </span>
        </div>
      )}

      {nftError && (
        <div style={{
          ...mono, marginTop: 16, color: C.red, fontSize: 12,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          {nftError}
        </div>
      )}

      {/* ENS result (path 3) */}
      {ensGranted && ensDisplayName && (
        <div style={{
          ...mono, marginTop: 24, padding: '16px 24px',
          background: C.raised, border: `1px solid ${C.green}55`,
          borderRadius: 10, color: C.green, fontSize: 13,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          ✓ <strong>{ensDisplayName}</strong> — membership confirmed.
          <br />
          <span style={{ color: C.muted, fontSize: 11 }}>
            {/* TODO: navigate to <MessengerView /> passing ensDisplayName as identity */}
            Opening chat as {ensDisplayName}…
          </span>
        </div>
      )}

      {ensError && (
        <div style={{
          ...mono, marginTop: 16, color: C.red, fontSize: 12,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          {ensError}
        </div>
      )}

      {/* Luma verification modal */}
      {showFlow && (
        <VerificationFlow
          eventUrl={value.trim()}
          onClose={() => setShowFlow(false)}
          onSuccess={() => {
            setShowFlow(false)
            // TODO: navigate to <MessengerView />
          }}
        />
      )}
    </div>
  )
}
