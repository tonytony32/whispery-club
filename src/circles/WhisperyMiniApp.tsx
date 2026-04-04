/**
 * WhisperyMiniApp — Circles Mini-app entry point
 *
 * Runs inside the Circles wallet interface. Guides the user through:
 *   1. Connect  — resolve Circles Safe address from injected provider
 *   2. Email    — enter Luma-registered email
 *   3. Verify   — Privy OTP confirms email ownership
 *   4. Claim    — backend mints WhisperyNFT to the Safe address
 *   5. Sign     — Safe signs one SIWE message to authorise the session key
 *   6. Ready    — Waku keys derived, ready to open the messenger
 *
 * Email verification via Privy (https://privy.io):
 *   - Requires VITE_PRIVY_APP_ID in .env
 *   - Wrap this component in <PrivyProvider appId={PRIVY_APP_ID}>
 *   - If VITE_PRIVY_APP_ID is not set, the verify step is skipped (demo mode)
 */

import { useState } from 'react'
import { useLoginWithEmail } from '@privy-io/react-auth'
import { siweMessage } from '../core/crypto'
import { useCirclesAddress } from './useCirclesAddress'
import { useSessionKey }     from './useSessionKey'

// ── Luma event to target — set via env or override at runtime ─────────────────
const LUMA_EVENT_ID = import.meta.env.VITE_LUMA_EVENT_ID as string | undefined

// ── Colour palette (matches the rest of the Whispery UI) ─────────────────────
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
  fontSize: 13,
}

// ── Step type ─────────────────────────────────────────────────────────────────

type Step =
  | 'connect'   // waiting for wallet
  | 'email'     // enter email
  | 'verify'    // Privy OTP
  | 'claiming'  // API call in progress
  | 'sign'      // Safe signs SIWE
  | 'ready'     // all done

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.raised, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: C.muted,
      textTransform: 'uppercase', letterSpacing: 1.2 }}>
      {children}
    </div>
  )
}

function Btn({
  onClick, disabled, children, variant = 'primary',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: 'primary' | 'ghost'
}) {
  const bg = variant === 'primary'
    ? (disabled ? C.dim : C.accent)
    : 'transparent'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...mono, fontWeight: 700, padding: '10px 20px',
      background: bg, color: disabled ? C.muted : C.text,
      border: variant === 'ghost' ? `1px solid ${C.border}` : 'none',
      borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
    }}>
      {children}
    </button>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ ...mono, fontSize: 11, color: C.red, marginTop: 4 }}>{msg}</div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WhisperyMiniApp() {
  const { address, connect, signMessage } = useCirclesAddress()
  const { sessionKey, generateSessionKey, activateWithSig } = useSessionKey()
  const privyEmail = useLoginWithEmail()

  const [step, setStep]         = useState<Step>('connect')
  const [email, setEmail]       = useState('')
  const [otpCode, setOtpCode]   = useState('')
  const [lumaEventId, setLumaEventId] = useState(LUMA_EVENT_ID ?? '')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [mintedId, setMintedId] = useState<string | null>(null)

  const privy = import.meta.env.VITE_PRIVY_APP_ID

  // ── Step handlers ────────────────────────────────────────────────────────────

  async function handleConnect() {
    setError(null)
    try {
      await connect()
      setStep('email')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect wallet')
    }
  }

  async function handleSendOtp() {
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      if (privy) {
        await privyEmail.sendCode({ email: email.trim() })
        setStep('verify')
      } else {
        // Demo mode — skip email verification, go straight to claim
        setStep('claiming')
        await handleClaim()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim()) return
    setError(null)
    setLoading(true)
    try {
      await privyEmail.loginWithCode({ code: otpCode.trim() })
      setStep('claiming')
      await handleClaim()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code — try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim() {
    if (!address) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/claim-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail:      email.trim(),
          circlesAddress: address,
          lumaEventId:    lumaEventId.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      if (data.alreadyMember) {
        // Already has the NFT — go straight to session key step
        setStep('sign')
        return
      }

      setMintedId(data.tokenId)
      setStep('sign')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed')
      setStep('email')
    } finally {
      setLoading(false)
    }
  }

  async function handleSign() {
    if (!address) return
    setError(null)
    setLoading(true)
    try {
      // Generate ephemeral EOA if not already present
      const sk = sessionKey ?? generateSessionKey()

      // SIWE message: same format as the main Whispery app so keys are
      // compatible with the existing L0 crypto and transport layer.
      const msg = siweMessage(address)
      const sig = await signMessage(msg)

      activateWithSig(sig, address)
      setStep('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Header */}
        <div style={{ ...mono, color: C.accent, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
          Whispery
          <span style={{ color: C.muted, fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
            Circles Mini-app
          </span>
        </div>

        {/* ── Step: connect ──────────────────────────────────────────────────── */}
        {step === 'connect' && (
          <Card>
            <Label>Step 1 — Connect your Circles wallet</Label>
            <div style={{ ...mono, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Your Circles Safe address will receive the membership NFT and
              sign the session key authorisation.
            </div>
            <Btn onClick={handleConnect}>Connect wallet</Btn>
            {error && <ErrorMsg msg={error} />}
          </Card>
        )}

        {/* ── Step: email ────────────────────────────────────────────────────── */}
        {step === 'email' && (
          <Card>
            <Label>Step 2 — Enter your Luma email</Label>
            <div style={{ ...mono, fontSize: 11, color: C.muted }}>
              Connected: <span style={{ color: C.text }}>{address?.slice(0, 10)}…</span>
            </div>
            {!LUMA_EVENT_ID && (
              <input
                value={lumaEventId}
                onChange={e => setLumaEventId(e.target.value)}
                placeholder="Luma event ID (evt-…)"
                style={{
                  ...mono, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '8px 12px', color: C.text, outline: 'none',
                }}
              />
            )}
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
              placeholder="email@example.com"
              type="email"
              style={{
                ...mono, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '8px 12px', color: C.text, outline: 'none',
              }}
            />
            <Btn onClick={handleSendOtp} disabled={loading || !email.trim() || !lumaEventId.trim()}>
              {loading ? 'Sending…' : privy ? 'Send verification code' : 'Claim access'}
            </Btn>
            {!privy && (
              <div style={{ ...mono, fontSize: 10, color: C.dim }}>
                Demo mode — VITE_PRIVY_APP_ID not set, email verification skipped.
              </div>
            )}
            {error && <ErrorMsg msg={error} />}
          </Card>
        )}

        {/* ── Step: verify (Privy OTP) ────────────────────────────────────────── */}
        {step === 'verify' && (
          <Card>
            <Label>Step 3 — Verify your email</Label>
            <div style={{ ...mono, fontSize: 12, color: C.muted }}>
              Enter the code sent to <span style={{ color: C.text }}>{email}</span>
            </div>
            <input
              value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
              placeholder="6-digit code"
              maxLength={6}
              style={{
                ...mono, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '8px 12px', color: C.text,
                outline: 'none', letterSpacing: 4, fontSize: 18,
              }}
            />
            <Btn onClick={handleVerifyOtp} disabled={loading || otpCode.length < 6}>
              {loading ? 'Verifying…' : 'Verify'}
            </Btn>
            <Btn variant="ghost" onClick={() => setStep('email')}>← Back</Btn>
            {error && <ErrorMsg msg={error} />}
          </Card>
        )}

        {/* ── Step: claiming ──────────────────────────────────────────────────── */}
        {step === 'claiming' && (
          <Card>
            <Label>Minting membership NFT…</Label>
            <div style={{ ...mono, fontSize: 12, color: C.muted }}>
              Checking Luma approval and minting WhisperyNFT to your Safe.
              This may take a few seconds.
            </div>
            <div style={{ ...mono, color: C.yellow }}>⏳ Waiting for on-chain confirmation…</div>
          </Card>
        )}

        {/* ── Step: sign ──────────────────────────────────────────────────────── */}
        {step === 'sign' && (
          <Card>
            <Label>Step {privy ? '4' : '3'} — Authorise session key</Label>
            {mintedId && (
              <div style={{ ...mono, fontSize: 11, color: C.green }}>
                ✓ NFT minted — token #{mintedId}
              </div>
            )}
            <div style={{ ...mono, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              Sign one message with your Circles wallet to generate your Waku
              identity keys. This is a <strong style={{ color: C.text }}>free
              off-chain signature</strong> — no gas required.
            </div>
            <div style={{ ...mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
              An ephemeral key ({sessionKey?.eoa?.slice(0, 10) ?? '…generating'}…)
              will be authorised to sign Waku envelopes on your behalf.
            </div>
            <Btn onClick={handleSign} disabled={loading}>
              {loading ? 'Check your wallet…' : 'Sign to activate'}
            </Btn>
            {error && <ErrorMsg msg={error} />}
          </Card>
        )}

        {/* ── Step: ready ─────────────────────────────────────────────────────── */}
        {step === 'ready' && (
          <Card>
            <Label>Ready</Label>
            <div style={{ ...mono, fontSize: 13, color: C.green, fontWeight: 700 }}>
              ✓ Membership active
            </div>
            <div style={{ ...mono, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              Your session key is set. Connect to Waku to start messaging.
            </div>
            <div style={{ ...mono, fontSize: 11, color: C.dim }}>
              Safe: {address?.slice(0, 14)}…<br />
              Session EOA: {sessionKey?.eoa?.slice(0, 14)}…
            </div>
            {/* TODO: render <MessengerView /> or navigate to the chat */}
            <Btn onClick={() => alert('Connect to Waku messenger here')}>
              Open Whispery Chat →
            </Btn>
          </Card>
        )}

      </div>
    </div>
  )
}
