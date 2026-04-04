/**
 * Omnibar — universal entry point for Whispery
 *
 * Classification order (highest priority first):
 *
 *   1. Luma URL      (contains lu.ma/)
 *      → VerificationFlow: check event approval → mint NFT → chat
 *
 *   2. NFT contract  (0x + 40 hex, eth_getCode != "0x")
 *      → connect wallet → balanceOf → enter chat
 *
 *   3. ENS name      (*.eth or subdomain)
 *      → resolveName on mainnet → balanceOf on Sepolia → enter chat
 *
 *   4. EOA address   (0x + 40 hex, eth_getCode == "0x")
 *      → informative message, no chat opened
 *
 *   5. Unrecognised  (anything else with content)
 *      → format hint, no action
 *
 * The 0x path requires an async eth_getCode call to distinguish
 * contract from EOA, so it shows an "Analysing…" state while resolving.
 */

import { useState, useRef }                              from 'react'
import { ethers }                                        from 'ethers'
import VerificationFlow                                  from './VerificationFlow'
import { resolveDisplayName, resolveENSName, truncateAddress } from './ensDisplay'

// ── Config ────────────────────────────────────────────────────────────────────

const WHISPERY_NFT_ADDRESS = '0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16'

const SEPOLIA_RPCS = [
  'https://rpc.ankr.com/eth_sepolia',
  'https://ethereum-sepolia.publicnode.com',
]

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

// ── Input classification ──────────────────────────────────────────────────────

type InputKind =
  | 'empty'
  | 'luma-url'
  | 'nft-address'
  | 'ens-name'
  | 'eoa-address'
  | 'unrecognised'
  | 'classifying'   // transient: 0x address, eth_getCode in flight

function syncClassify(v: string): InputKind {
  if (!v) return 'empty'
  if (v.includes('lu.ma/'))                             return 'luma-url'
  if (/\.eth$/i.test(v) && !v.startsWith('http'))       return 'ens-name'
  if (/^0x[0-9a-fA-F]{40}$/.test(v))                   return 'classifying'
  return 'unrecognised'
}

async function asyncClassifyAddress(address: string): Promise<'nft-address' | 'eoa-address'> {
  // Try eth_getCode via public Sepolia RPCs
  for (const url of SEPOLIA_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url)
      const code = await provider.getCode(address)
      return code !== '0x' ? 'nft-address' : 'eoa-address'
    } catch { /* try next */ }
  }
  // If all RPCs fail, fall back to assuming contract (better demo UX)
  return 'nft-address'
}

// ── ERC-721 ABI (minimal) ────────────────────────────────────────────────────

const ERC721_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Omnibar() {
  const [value, setValue]       = useState('')
  const [kind, setKind]         = useState<InputKind>('empty')
  const [showFlow, setShowFlow] = useState(false)

  // NFT path
  const [nftChecking, setNftChecking]               = useState(false)
  const [nftError, setNftError]                     = useState<string | null>(null)
  const [nftGranted, setNftGranted]                 = useState(false)
  const [nftName, setNftName]                       = useState<string | null>(null)
  const [connectedDisplayName, setConnectedDisplay] = useState<string | null>(null)

  // ENS path
  const [ensChecking, setEnsChecking]   = useState(false)
  const [ensError, setEnsError]         = useState<string | null>(null)
  const [ensGranted, setEnsGranted]     = useState(false)
  const [ensDisplayName, setEnsDisplay] = useState<string | null>(null)

  // Used to ignore stale async classification results
  const classifyIdRef = useRef(0)

  // ── Input change ────────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw     = e.target.value
    const trimmed = raw.trim()
    setValue(raw)

    // Reset result state
    setNftError(null); setNftGranted(false); setConnectedDisplay(null)
    setEnsError(null); setEnsGranted(false); setEnsDisplay(null)

    const initial = syncClassify(trimmed)
    setKind(initial)

    if (initial === 'classifying') {
      const id = ++classifyIdRef.current
      asyncClassifyAddress(trimmed).then(resolved => {
        if (classifyIdRef.current === id) setKind(resolved)
      })
    }
  }

  // ── Action ──────────────────────────────────────────────────────────────────
  function handleGo() {
    const v = value.trim()
    if (kind === 'luma-url')    setShowFlow(true)
    if (kind === 'nft-address') checkNFTOwnership(v)
    if (kind === 'ens-name')    checkENSName(v)
  }

  // ── Path 2 — NFT contract ───────────────────────────────────────────────────
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
      try { name = await nft.name() } catch { /* optional */ }
      setNftName(name)

      if (balance > 0n) {
        setNftGranted(true)
        const display = await resolveDisplayName(address, provider)
        setConnectedDisplay(display)
      } else {
        setNftError(`No tienes el NFT de acceso para este grupo.`)
      }
    } catch (err) {
      setNftError(err instanceof Error ? err.message : 'Ownership check failed.')
    } finally {
      setNftChecking(false)
    }
  }

  // ── Path 3 — ENS name ───────────────────────────────────────────────────────
  async function checkENSName(ensName: string) {
    setEnsChecking(true)
    setEnsError(null)

    try {
      const resolved = await resolveENSName(ensName)
      if (!resolved) {
        setEnsError(`ENS name "${ensName}" not found.`)
        return
      }

      const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
      if (!eth) {
        setEnsError('No wallet found — install MetaMask or another Web3 wallet.')
        return
      }

      const provider      = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer        = await provider.getSigner()
      const connectedAddr = await signer.getAddress()

      // Determine if ENS resolves to a contract (group) or an EOA (individual)
      let isContract = false
      for (const url of SEPOLIA_RPCS) {
        try {
          const rpc  = new ethers.JsonRpcProvider(url)
          const code = await rpc.getCode(resolved)
          isContract = code !== '0x'
          break
        } catch { /* try next */ }
      }

      if (isContract) {
        // GROUP flow: ENS → NFT contract → check connected wallet's balance
        const nft     = new ethers.Contract(resolved, ERC721_ABI, provider)
        const balance = await nft.balanceOf(connectedAddr)
        let   name    = ensName
        try { name = await nft.name() } catch { /* optional */ }

        if (balance > 0n) {
          const display = await resolveDisplayName(connectedAddr, provider)
          setEnsGranted(true)
          setEnsDisplay(ensName)
          setConnectedDisplay(display)
        } else {
          setEnsError(`Your wallet doesn't hold a token from ${name}.`)
        }
      } else {
        // INDIVIDUAL flow: ENS → personal wallet → verify connected wallet matches
        if (connectedAddr.toLowerCase() !== resolved.toLowerCase()) {
          setEnsError(
            `This ENS name resolves to a different wallet.\n` +
            `Connected: ${truncateAddress(connectedAddr)} · ` +
            `Expected: ${truncateAddress(resolved)}`
          )
          return
        }
        const nft     = new ethers.Contract(WHISPERY_NFT_ADDRESS, ERC721_ABI, provider)
        const balance = await nft.balanceOf(resolved)
        if (balance > 0n) {
          setEnsGranted(true)
          setEnsDisplay(ensName)
          setConnectedDisplay(ensName)
        } else {
          setEnsError(`${ensName} doesn't hold a membership token.`)
        }
      }
    } catch (err) {
      setEnsError(err instanceof Error ? err.message : 'ENS resolution failed.')
    } finally {
      setEnsChecking(false)
    }
  }

  const isChecking = nftChecking || ensChecking

  // ── Derived display ─────────────────────────────────────────────────────────
  const placeholder =
    kind === 'luma-url'    ? 'Luma event URL detected →' :
    kind === 'nft-address' ? 'NFT contract detected →' :
    kind === 'ens-name'    ? 'ENS name detected →' :
    kind === 'eoa-address' ? 'Wallet address detected →' :
                             'Paste a Luma URL, NFT contract, or ENS name (alice.eth)…'

  const btnLabel =
    kind === 'classifying' ? 'Analysing…' :
    isChecking             ? 'Checking…'  :
    kind === 'luma-url'    ? 'Claim access →' :
    kind === 'nft-address' ? 'Check ownership →' :
    kind === 'ens-name'    ? `Resolve ${value.trim()} →` :
                             '↵'

  const btnEnabled =
    (kind === 'luma-url' || kind === 'nft-address' || kind === 'ens-name') && !isChecking

  const borderColor =
    kind === 'eoa-address' || kind === 'unrecognised'
      ? C.dim + 'aa'
      : kind !== 'empty'
        ? C.accent + '88'
        : C.border

  // ── Render ──────────────────────────────────────────────────────────────────
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

      {/* Bar */}
      <div style={{
        width: '100%', maxWidth: 600,
        display: 'flex',
        background: C.raised,
        border: `1px solid ${borderColor}`,
        borderRadius: 12, overflow: 'hidden',
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

      {/* ── Below-bar messages ─────────────────────────────────────────────── */}

      {/* Default hint */}
      {kind === 'empty' && (
        <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 14, textAlign: 'center' }}>
          Examples:&nbsp;
          <span style={{ color: C.muted }}>https://lu.ma/3wczh9p4</span>
          &nbsp;·&nbsp;
          <span style={{ color: C.muted }}>0x51a5a1c7…</span>
          &nbsp;·&nbsp;
          <span style={{ color: C.muted }}>alice.whispery.eth</span>
        </div>
      )}

      {/* Classifying spinner */}
      {kind === 'classifying' && (
        <div style={{ ...mono, fontSize: 11, color: C.yellow, marginTop: 14 }}>
          Analysing address…
        </div>
      )}

      {/* EOA — informative, not an error */}
      {kind === 'eoa-address' && (
        <div style={{
          ...mono, marginTop: 20, padding: '14px 20px',
          background: C.raised, border: `1px solid ${C.border}`,
          borderRadius: 10, color: C.muted, fontSize: 12,
          maxWidth: 600, width: '100%', lineHeight: 1.7,
        }}>
          Esta app está diseñada para conversaciones grupales.<br />
          Para acceder, usa la URL de un evento Luma, la dirección
          de un contrato NFT o el nombre ENS de un grupo.
        </div>
      )}

      {/* Unrecognised format */}
      {kind === 'unrecognised' && (
        <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 14, textAlign: 'center' }}>
          Formato no reconocido. Puedes pegar una URL de Luma,
          una dirección de contrato o un nombre .eth.
        </div>
      )}

      {/* NFT success */}
      {nftGranted && (
        <div style={{
          ...mono, marginTop: 24, padding: '16px 24px',
          background: C.raised, border: `1px solid ${C.green}55`,
          borderRadius: 10, color: C.green, fontSize: 13,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          ✓ Token verificado —{' '}
          <strong>{connectedDisplayName ?? truncateAddress(value.trim())}</strong>
          {' '}es miembro de <strong>{nftName}</strong>.
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

      {/* ENS success */}
      {ensGranted && ensDisplayName && (
        <div style={{
          ...mono, marginTop: 24, padding: '16px 24px',
          background: C.raised, border: `1px solid ${C.green}55`,
          borderRadius: 10, color: C.green, fontSize: 13,
          maxWidth: 600, width: '100%', textAlign: 'center',
        }}>
          ✓ <strong>{connectedDisplayName ?? truncateAddress(value.trim())}</strong>
          {' '}— acceso a <strong>{ensDisplayName}</strong> confirmado.
          <br />
          <span style={{ color: C.muted, fontSize: 11 }}>
            {/* TODO: navigate to <MessengerView /> */}
            Opening chat…
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

      {/* Luma modal */}
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
