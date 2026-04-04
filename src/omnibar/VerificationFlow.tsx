/**
 * VerificationFlow — modal that runs after a Luma URL is pasted
 *
 * Two verification paths:
 *
 *   Option A — Email (Privy OTP)
 *     Marked as TODO — Privy not integrated for demo.
 *     Stub is present so the UI shows the option.
 *
 *   Option B — Web3 wallet  ← ACTIVE for demo
 *     1. Connect MetaMask / any injected wallet
 *     2. Try ENS email lookup (getText('email'))
 *     3. If no ENS email → show manual email input
 *     4. Call /api/resolve-event with { eventUrl, verifiedEmail, targetWallet }
 *     5. Show result (tokenId) or error
 */

import { useState }     from 'react'
import { ethers }       from 'ethers'
import { useENSEmail }  from './useENSEmail'

const C = {
  bg:      '#0b0b0e',
  surface: '#13131a',
  raised:  '#1a1a24',
  border:  '#25253a',
  overlay: 'rgba(0,0,0,0.75)',
  text:    '#ddddf0',
  muted:   '#5a5a7a',
  dim:     '#3a3a55',
  accent:  '#7c6aff',
  green:   '#3ddc97',
  red:     '#ff5a5a',
  yellow:  '#ffc83d',
  orange:  '#ff9a3d',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
}

type Path   = 'choose' | 'email-privy' | 'web3'
type Status = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  eventUrl:  string
  onClose:   () => void
  onSuccess: (tokenId: string) => void
}

export default function VerificationFlow({ eventUrl, onClose, onSuccess }: Props) {
  const [path, setPath]         = useState<Path>('choose')
  const [status, setStatus]     = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tokenId, setTokenId]   = useState<string | null>(null)

  // Web3 path state
  const [address, setAddress]   = useState<string | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [email, setEmail]       = useState('')

  const ens = useENSEmail()

  // ── Wallet connection ─────────────────────────────────────────────────────
  async function connectWallet() {
    const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
    if (!eth) {
      setErrorMsg('No wallet detected. Install MetaMask or another Web3 wallet.')
      return
    }
    try {
      const p        = new ethers.BrowserProvider(eth)
      await p.send('eth_requestAccounts', [])
      const signer   = await p.getSigner()
      const addr     = await signer.getAddress()
      setProvider(p)
      setAddress(addr)
      setErrorMsg(null)

      // Attempt ENS email lookup automatically
      const ensEmail = await ens.resolveEmail(addr, p)
      if (ensEmail) setEmail(ensEmail)

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Wallet connection failed.')
    }
  }

  // ── Claim ─────────────────────────────────────────────────────────────────
  async function handleClaim() {
    if (!address || !email.trim()) return
    setStatus('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/resolve-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventUrl,
          verifiedEmail: email.trim().toLowerCase(),
          targetWallet:  address,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      if (data.alreadyMember) {
        setTokenId('existing')
        setStatus('success')
        onSuccess('existing')
        return
      }

      setTokenId(data.tokenId)
      setStatus('success')
      onSuccess(data.tokenId)

    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Claim failed.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 24,
      }}
    >
      <div style={{
        background: C.raised, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '28px 32px',
        width: '100%', maxWidth: 460,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: C.text }}>
              Who are you?
            </div>
            <div style={{ ...mono, fontSize: 11, color: C.muted, marginTop: 4 }}>
              {eventUrl.length > 52 ? eventUrl.slice(0, 52) + '…' : eventUrl}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.muted,
            cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* ── Path: choose ─────────────────────────────────────────────────── */}
        {path === 'choose' && (
          <>
            {/* Option A — Privy (stubbed) */}
            <button
              onClick={() => setPath('email-privy')}
              style={{
                ...mono, fontSize: 13, fontWeight: 700,
                padding: '14px 20px', borderRadius: 8, cursor: 'pointer',
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.muted, textAlign: 'left',
                position: 'relative',
              }}
            >
              ✉ Continue with Email
              <span style={{
                position: 'absolute', top: 8, right: 10,
                fontSize: 9, background: C.dim, color: C.muted,
                padding: '2px 6px', borderRadius: 4, letterSpacing: 1,
              }}>
                COMING SOON
              </span>
            </button>

            {/* Option B — Web3 wallet */}
            <button
              onClick={() => { setPath('web3'); connectWallet() }}
              style={{
                ...mono, fontSize: 13, fontWeight: 700,
                padding: '14px 20px', borderRadius: 8, cursor: 'pointer',
                background: C.accent, border: 'none',
                color: '#fff', textAlign: 'left',
              }}
            >
              ⬡ Connect Wallet
            </button>
          </>
        )}

        {/* ── Path: Privy email (stub) ──────────────────────────────────────── */}
        {path === 'email-privy' && (
          <>
            <div style={{ ...mono, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              Email verification via Privy OTP is not integrated in this demo.
              <br />
              Set <span style={{ color: C.text }}>VITE_PRIVY_APP_ID</span> and install{' '}
              <span style={{ color: C.text }}>@privy-io/react-auth</span> to enable it.
            </div>
            {/* TODO: <PrivyProvider appId={VITE_PRIVY_APP_ID}><EmailOTPFlow /></PrivyProvider> */}
            <button onClick={() => setPath('choose')} style={{
              ...mono, fontSize: 12, background: 'none',
              border: `1px solid ${C.border}`, color: C.muted,
              borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
            }}>
              ← Back
            </button>
          </>
        )}

        {/* ── Path: Web3 ───────────────────────────────────────────────────── */}
        {path === 'web3' && (
          <>
            {/* Wallet status */}
            {address ? (
              <div style={{ ...mono, fontSize: 11, color: C.green }}>
                ✓ Connected: {address.slice(0, 10)}…{address.slice(-6)}
              </div>
            ) : (
              <button onClick={connectWallet} style={{
                ...mono, fontSize: 13, fontWeight: 700,
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                background: C.accent, border: 'none', color: '#fff',
              }}>
                Connect wallet
              </button>
            )}

            {/* ENS email status */}
            {ens.loading && (
              <div style={{ ...mono, fontSize: 11, color: C.yellow }}>
                Looking up ENS email…
              </div>
            )}
            {ens.status && !ens.loading && (
              <div style={{ ...mono, fontSize: 11, color: ens.email ? C.green : C.muted }}>
                {ens.status}
              </div>
            )}

            {/* Email input — pre-filled from ENS if found */}
            {address && (
              <>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: C.muted,
                    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                    Email registered on Luma
                  </div>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleClaim()}
                    placeholder="your@email.com"
                    type="email"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      ...mono, fontSize: 13,
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: '10px 14px', color: C.text, outline: 'none',
                    }}
                  />
                </div>

                <button
                  onClick={handleClaim}
                  disabled={!email.trim() || status === 'loading'}
                  style={{
                    ...mono, fontWeight: 700, fontSize: 13,
                    padding: '12px 20px', borderRadius: 8,
                    background: email.trim() && status !== 'loading' ? C.accent : C.dim,
                    border: 'none', color: '#fff',
                    cursor: email.trim() && status !== 'loading' ? 'pointer' : 'default',
                  }}
                >
                  {status === 'loading' ? 'Verifying & minting…' : 'Claim membership →'}
                </button>
              </>
            )}

            {/* Result */}
            {status === 'success' && (
              <div style={{
                ...mono, fontSize: 12, color: C.green,
                background: C.surface, border: `1px solid ${C.green}44`,
                borderRadius: 8, padding: '12px 16px', lineHeight: 1.7,
              }}>
                ✓ Membership confirmed
                {tokenId && tokenId !== 'existing' && (
                  <><br />NFT token #{tokenId} minted to your wallet.</>
                )}
                {tokenId === 'existing' && (
                  <><br />You already hold a membership token.</>
                )}
              </div>
            )}

            {/* Error */}
            {(errorMsg || status === 'error') && (
              <div style={{ ...mono, fontSize: 12, color: C.red }}>
                {errorMsg ?? 'Something went wrong.'}
              </div>
            )}

            <button onClick={() => { setPath('choose'); setAddress(null); setEmail('') }} style={{
              ...mono, fontSize: 11, background: 'none',
              border: 'none', color: C.dim, cursor: 'pointer', textAlign: 'left',
            }}>
              ← Choose differently
            </button>
          </>
        )}

      </div>
    </div>
  )
}
