import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { bytesToHex } from '@noble/hashes/utils'
import { useMessenger, type UseMessengerResult, type ChatMessage } from './transport/useMessenger'
import { useDemoMessenger } from './transport/useDemoMessenger'
import { BACK_ADDRESS, BACK_ABI, CHANNEL_ID, GROUP_NAME } from './contracts'
import { DEMO_PRIVATE_KEYS, createWallet } from './core/crypto'
import type { NodeStatus } from './transport/node'
import { useMemberIdentities, type MemberIdentity } from './chat/useMemberIdentities'
import AgentBanner                          from './chat/AgentBanner'
import MemberPill                           from './chat/MemberPill'
import AgentFeedback                        from './chat/AgentFeedback'
import AttestationToast, { type ToastState } from './chat/AttestationToast'
import { calcScore, fetchRepScore }          from './chat/conversationAttestation'
import { uploadJSON }                        from './core/ipfs'
import { ethers }                            from 'ethers'

const REPUTATION_REGISTRY =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_ERC8004_REPUTATION
  ?? '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322'

const GIVE_FEEDBACK_ABI = [
  'function giveFeedback(uint256 agentId, int8 score, string calldata feedbackURI) external',
]

const C = {
  bg:        '#0b0b0e',
  surface:   '#13131a',
  raised:    '#1a1a24',
  border:    '#25253a',
  text:      '#ddddf0',
  muted:     '#5a5a7a',
  dim:       '#3a3a55',
  accent:    '#7c6aff',
  green:     '#3ddc97',
  red:       '#ff5a5a',
  yellow:    '#ffc83d',
  orange:    '#ff9a3d',
  logBg:     '#080c08',
  logBorder: '#1a2a1a',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

function StatusBadge({ status, signing }: { status: NodeStatus; signing: boolean }) {
  const s = signing ? 'signing' : status
  const [color, label] =
    s === 'connected'    ? [C.green,  '● connected']    :
    s === 'signing'      ? [C.yellow, '◌ signing…']     :
    s === 'connecting'   ? [C.yellow, '◌ connecting…']  :
    s === 'disconnected' ? [C.orange, '⚡ disconnected'] :
    s === 'error'        ? [C.red,    '✗ error']        :
                           [C.muted,  '○ idle']
  return <span style={{ ...mono, fontSize: 11, color, fontWeight: 700 }}>{label}</span>
}

function LogPanel({ logs, accent }: { logs: string[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight) }, [logs])

  return (
    <div ref={ref} style={{
      background: C.logBg, border: `1px solid ${C.logBorder}`,
      borderRadius: 8, padding: '8px 12px',
      height: 140, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color: accent + '40', marginBottom: 4 }}>
        log
      </div>
      {logs.length === 0
        ? <span style={{ ...mono, fontSize: 11, color: '#222' }}>— waiting —</span>
        : logs.map((e, i) => {
            const c =
              e.includes('✓')                                         ? '#3d7a4d' :
              e.includes('failed') || e.includes('error') ||
              e.includes('Error')  || e.includes('lost')              ? '#7a3a3a' :
              e.includes('peer:connect ')                             ? '#3a5a7a' :
              e.includes('peer:disconnect')                           ? '#5a4a2a' :
                                                                        '#2d4a3a'
            return (
              <div key={i} style={{
                ...mono, fontSize: 11, color: c, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{e}</div>
            )
          })
      }
    </div>
  )
}

function ParticipantPanel({
  label, accent, isDemo, pointer, eeeEpoch, result, logs,
  memberIdentities, pubkeyToAddress, channelId, humanAddress,
}: {
  label: string
  accent: string
  isDemo: boolean
  pointer: string | undefined
  eeeEpoch: bigint
  result: UseMessengerResult
  logs: string[]
  memberIdentities: ReturnType<typeof useMemberIdentities>
  pubkeyToAddress: Map<string, string>
  channelId: string
  humanAddress: string
}) {
  const { status, signing, myPubKey, messages, connect, send, disconnect, signError } = result
  const [draft, setDraft]         = useState('')
  const [sending, setSending]     = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [hoveredMsgIdx, setHoveredMsgIdx] = useState<number | null>(null)
  const [ratingAgent,   setRatingAgent]   = useState<MemberIdentity | null>(null)

  // ── Attestation toast ───────────────────────────────────────────────────────
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const [toastScore, setToastScore] = useState(0)
  const [toastTxHash, setToastTxHash] = useState('')
  const [toastAgent, setToastAgent] = useState('')

  // ── Live reputation score ───────────────────────────────────────────────────
  const [liveScore, setLiveScore] = useState<{ avg: number; count: number } | null>(null)

  useEffect(() => {
    const agent = [...memberIdentities.values()].find(m => m.ensip25Verified && m.reputation)
    if (agent?.reputation && agent.reputation.avgScore !== null) {
      setLiveScore({ avg: agent.reputation.avgScore, count: agent.reputation.entries.length })
    }
  }, [memberIdentities])

  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight)
  }, [messages])

  // ── Disconnect + auto-attestation ───────────────────────────────────────────

  async function handleDisconnect() {
    const agent = [...memberIdentities.values()].find(m => m.ensip25Verified)

    if (!isDemo && agent?.agentId !== null && agent !== undefined) {
      const enriched = messages.map(m => ({
        ethAddress: m.direction === 'out'
          ? humanAddress
          : (m.senderPk ? (pubkeyToAddress.get(m.senderPk) ?? '') : ''),
        timestamp: m.at,
      })).filter(m => m.ethAddress !== '')

      const score = calcScore(enriched, agent.address, humanAddress)
      setToastAgent(agent.displayName)

      if (score === null) {
        setToastState('skipped')
        setTimeout(() => setToastState(null), 3000)
      } else {
        try {
          setToastState('building')
          const attestation = {
            protocol:    'whispery-attestation-v1',
            agentId:     agent.agentId,
            channelId,
            score,
            exchanges:   messages.length,
            generatedAt: Date.now(),
          }
          const uri = await uploadJSON(attestation, `attestation-agent-${agent.agentId}`)

          setToastState('signing')
          const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
          if (!eth) throw new Error('No wallet')
          const provider = new ethers.BrowserProvider(eth)
          const signer   = await provider.getSigner()
          const registry = new ethers.Contract(REPUTATION_REGISTRY, GIVE_FEEDBACK_ABI, signer)
          const tx: ethers.ContractTransactionResponse =
            await registry.giveFeedback(agent.agentId!, score, uri)
          await tx.wait()

          setToastScore(score)
          setToastTxHash(tx.hash)
          setToastState('submitted')

          // Refresh live score
          const fresh = await fetchRepScore(agent.agentId!)
          if (fresh) setLiveScore(fresh)

        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (!msg.includes('user rejected') && !msg.includes('ACTION_REJECTED')) {
            // non-rejection error: dismiss silently
          }
          setToastState(null)
        }
      }
    }

    await disconnect()
  }

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true); setSendError(null)
    try { await send(draft.trim()); setDraft('') }
    catch (e) { setSendError(e instanceof Error ? e.message : String(e)) }
    finally { setSending(false) }
  }

  const connected = status === 'connected'
  const canSend   = connected && !!draft.trim() && !sending

  const card: React.CSSProperties = {
    background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

      {/* Header */}
      <div style={{
        ...card, padding: '12px 16px',
        borderColor: status === 'connected'    ? accent + '55'      :
                     status === 'disconnected' ? C.orange + '55'    : C.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: accent }}>
              {label}
            </span>
            {connected && myPubKey && (
              <span style={{ ...mono, fontSize: 10, color: C.muted }}>
                0x{bytesToHex(myPubKey.slice(0, 4))}…
              </span>
            )}
          </div>
          <StatusBadge status={status} signing={signing} />
        </div>

        {connected &&
          <div style={{ ...mono, fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: accent, fontWeight: 700 }}>{GROUP_NAME}</span>
            {' · '}epoch {String(eeeEpoch)}
            {liveScore && liveScore.count > 0 && (
              <span style={{ color: C.yellow }}>
                🤖 ⭐ {liveScore.avg.toFixed(1)}
                <span style={{ color: C.muted }}> ({liveScore.count})</span>
              </span>
            )}
          </div>
        }

        {/* Channel member list */}
        {memberIdentities.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' }}>
            {[...memberIdentities.values()].map(m => (
              <div key={m.address} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MemberPill
                  identity={m}
                  onRate={m.ensip25Verified ? () => setRatingAgent(m) : undefined}
                />
                {m.ensip25Verified && (
                  <button
                    onClick={() => setRatingAgent(m)}
                    style={{
                      ...mono, fontSize: 9, background: 'none',
                      border: `1px solid ${C.dim}`, borderRadius: 3,
                      padding: '1px 6px', color: C.accent, cursor: 'pointer',
                    }}
                  >
                    Valorar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {status === 'disconnected' &&
          <div style={{ ...mono, fontSize: 11, color: C.orange }}>
            All Waku peers dropped — messages paused.
          </div>
        }
        {!pointer &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>
            EEE not published — go to Live tab first.
          </div>
        }
        {signing &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>
            Check MetaMask — sign the SIWE message…
          </div>
        }
        {status === 'connecting' && !signing &&
          <div style={{ ...mono, fontSize: 11, color: C.yellow }}>Joining Waku…</div>
        }
        {status === 'error' &&
          <div style={{ ...mono, fontSize: 11, color: C.red }}>
            Failed — see log below.
          </div>
        }
        {signError &&
          <div style={{ ...mono, fontSize: 11, color: C.red, marginTop: 4 }}>{signError}</div>
        }
        {!signing && status === 'idle' && pointer && (
          <button onClick={connect} style={{
            marginTop: 8, background: accent, color: '#fff',
            border: 'none', borderRadius: 6, padding: '8px 18px',
            ...mono, fontWeight: 700, cursor: 'pointer',
          }}>
            Connect to Waku
          </button>
        )}
        {(status === 'disconnected' || status === 'error') && (
          <button onClick={connect} style={{
            marginTop: 8, background: C.dim, color: C.text,
            border: `1px solid ${accent}`, borderRadius: 6, padding: '8px 18px',
            ...mono, fontWeight: 700, cursor: 'pointer',
          }}>
            ↺ Reconnect
          </button>
        )}
        {status === 'connected' && (
          <button onClick={handleDisconnect} style={{
            marginTop: 8, background: 'none', color: C.muted,
            border: `1px solid ${C.dim}`, borderRadius: 6, padding: '6px 14px',
            ...mono, fontSize: 11, cursor: 'pointer',
          }}>
            Desconectar
          </button>
        )}
      </div>

      {/* Agent banner */}
      {(() => {
        const agents = [...memberIdentities.values()].filter(m => m.isAgent)
        return agents.length > 0
          ? <AgentBanner agents={agents} channelId={channelId} />
          : null
      })()}

      {/* Thread */}
      <div ref={threadRef} style={{
        ...card, flex: 1, height: 300, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      }}>
        {messages.length === 0
          ? <span style={{ ...mono, color: C.dim, fontSize: 11, margin: 'auto' }}>No messages yet</span>
          : [...messages].sort((a, b) => a.at - b.at).map((msg: ChatMessage, i: number) => {
              const senderAddr   = msg.senderPk ? pubkeyToAddress.get(msg.senderPk) : undefined
              const senderIdent  = senderAddr ? memberIdentities.get(senderAddr) : undefined
              const senderLabel  = msg.direction === 'out'
                ? label.toLowerCase()
                : (senderIdent?.displayName ?? 'group')
              const isAgentMsg   = msg.direction === 'in' && senderIdent?.ensip25Verified
              return (
                <div
                  key={i}
                  onMouseEnter={() => isAgentMsg ? setHoveredMsgIdx(i) : undefined}
                  onMouseLeave={() => setHoveredMsgIdx(null)}
                  style={{
                    display: 'flex', position: 'relative',
                    justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    background: msg.direction === 'out' ? accent : C.surface,
                    color: C.text,
                    border: `1px solid ${msg.direction === 'out' ? accent : C.border}`,
                    borderRadius: 8, padding: '6px 10px',
                    maxWidth: '85%', wordBreak: 'break-word', ...mono,
                  }}>
                    <div style={{ fontSize: 10, marginBottom: 2,
                      color: msg.direction === 'out' ? 'rgba(255,255,255,0.5)' : C.muted,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {senderIdent
                        ? <MemberPill identity={senderIdent} onRate={senderIdent.ensip25Verified ? () => setRatingAgent(senderIdent) : undefined} />
                        : <span>{senderLabel}</span>
                      }
                      <span>· {new Date(msg.at).toLocaleTimeString()}</span>
                    </div>
                    {msg.text}
                  </div>
                  {/* Star icon — only visible on hover for verified agent messages */}
                  {isAgentMsg && hoveredMsgIdx === i && (
                    <button
                      onClick={() => setRatingAgent(senderIdent!)}
                      title="Valorar este agente"
                      style={{
                        position: 'absolute', right: -24, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        color: C.yellow, cursor: 'pointer', fontSize: 14,
                        padding: 2, lineHeight: 1,
                      }}
                    >
                      ☆
                    </button>
                  )}
                </div>
              )
            })
        }
      </div>

      {/* Compose */}
      <div style={{ ...card, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={connected ? 'Type a message…' : 'Not connected…'}
            disabled={!connected}
            style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '7px 11px', color: C.text,
              ...mono, outline: 'none', opacity: connected ? 1 : 0.35,
            }}
          />
          <button onClick={handleSend} disabled={!canSend} style={{
            background: canSend ? accent : C.dim,
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '7px 14px', ...mono, fontWeight: 700,
            cursor: canSend ? 'pointer' : 'default',
          }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
        {sendError && (
          <div style={{ ...mono, color: C.red, fontSize: 11, marginTop: 5 }}>{sendError}</div>
        )}
      </div>

      {/* Log */}
      <LogPanel logs={logs} accent={accent} />

      {/* Reputation feedback modal */}
      {ratingAgent && (
        <AgentFeedback
          identity={ratingAgent}
          messages={messages}
          channelId={channelId}
          epoch={Number(eeeEpoch)}
          humanAddress={humanAddress}
          onClose={() => setRatingAgent(null)}
        />
      )}

      {/* Auto-attestation toast */}
      {toastState && (
        <AttestationToast
          state={toastState}
          agentName={toastAgent}
          score={toastScore}
          txHash={toastTxHash}
          onDismiss={() => setToastState(null)}
        />
      )}
    </div>
  )
}

// ── Demo member addresses (stable — declared outside component) ───────────────

const DEMO_ADDRESSES = [
  '0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c',  // Alice
  '0xBF0c2136430053e6839113Abac2E55DBeB0E80a7',  // Betty
  '0x055476B69029367CF0E26eC784FB456Ed8ebcA00',  // Caroline
]

// Betty's X25519 pubkey is deterministic — compute once at module level
const BETTY_PUBKEY_HEX = bytesToHex(createWallet(DEMO_PRIVATE_KEYS.B, 'Betty').x25519.publicKey)

// ── Main split view ───────────────────────────────────────────────────────────

export default function MessengerView() {
  const { address } = useAccount()

  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS, abi: BACK_ABI, functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`], query: { enabled: true },
  })
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]
  const pointer = eeePointer || undefined

  const [aliceLogs, setAliceLogs] = useState<string[]>([])
  const [bettyLogs, setBettyLogs] = useState<string[]>([])
  const addAliceLog = useCallback((msg: string) => setAliceLogs(p => [...p, msg]), [])
  const addBettyLog = useCallback((msg: string) => setBettyLogs(p => [...p, msg]), [])

  const aliceResult = useMessenger(address, pointer, 'Alice', addAliceLog)
  const bettyResult = useDemoMessenger(DEMO_PRIVATE_KEYS.B, 'Betty', pointer, addBettyLog)

  // ── Member identity resolution ───────────────────────────────────────────────

  const memberIdentities = useMemberIdentities(DEMO_ADDRESSES)

  // Map X25519 pubkey (hex) → eth address — Betty is static, Alice resolves after connect
  const pubkeyToAddress = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>()
    m.set(BETTY_PUBKEY_HEX, DEMO_ADDRESSES[1])
    if (aliceResult.myPubKey) {
      m.set(bytesToHex(aliceResult.myPubKey), DEMO_ADDRESSES[0])
    }
    return m
  }, [aliceResult.myPubKey])

  if (!address) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 32 }}>
        <span style={{ ...mono, color: C.muted }}>Connect your wallet in the Live tab first.</span>
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px 24px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 20,
      height: 'calc(100vh - 57px)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <ParticipantPanel
        label="Alice" accent={C.accent} isDemo={false}
        pointer={pointer} eeeEpoch={eeeEpoch}
        result={aliceResult} logs={aliceLogs}
        memberIdentities={memberIdentities} pubkeyToAddress={pubkeyToAddress}
        channelId={CHANNEL_ID} humanAddress={address ?? ''}
      />
      <ParticipantPanel
        label="Betty" accent={C.orange} isDemo={true}
        pointer={pointer} eeeEpoch={eeeEpoch}
        result={bettyResult} logs={bettyLogs}
        memberIdentities={memberIdentities} pubkeyToAddress={pubkeyToAddress}
        channelId={CHANNEL_ID} humanAddress={address ?? ''}
      />
    </div>
  )
}
