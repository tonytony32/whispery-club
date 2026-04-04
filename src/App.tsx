import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import CryptoDemo from './CryptoDemo'
import MessengerView from './MessengerView'
import Omnibar from './omnibar/Omnibar'
import { NFT_ADDRESS, BACK_ADDRESS, NFT_ABI, BACK_ABI, TOKEN_NAMES, CHANNEL_ID } from './contracts'
import { uploadJSON } from './core/ipfs'
import { siweMessage, keysFromSig, createWallet, createGroupChannel, DEMO_PRIVATE_KEYS } from './core/crypto'

// ── Palette (shared) ──────────────────────────────────────────────────────────
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
  blue:    '#5ab4ff',
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 12,
}

// ── Live view ─────────────────────────────────────────────────────────────────

function LiveView() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: connecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const onWrongNetwork = isConnected && chainId !== sepolia.id

  const { data: isMember, isLoading: loadingMember } = useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'isMember',
    args: [address!],
    query: { enabled: !!address },
  })

  const { data: tokenId } = useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'tokenIdOf',
    args: [address!],
    query: { enabled: !!address && isMember === true },
  })

  const { data: eeeData } = useReadContract({
    address: BACK_ADDRESS,
    abi: BACK_ABI,
    functionName: 'getEEE',
    args: [CHANNEL_ID as `0x${string}`],
    query: { enabled: isMember === true },
  })

  const memberName = tokenId ? TOKEN_NAMES[Number(tokenId)] : undefined
  const [eeePointer, eeeEpoch] = eeeData ?? ['', 0n]

  const { writeContract, data: txHash } = useWriteContract()
  const { isLoading: txPending, isSuccess: txDone } =
    useWaitForTransactionReceipt({ hash: txHash })
  const { signMessageAsync } = useSignMessage()

  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  async function publishEEE() {
    if (!address) return
    setPublishing(true)
    setPublishError(null)
    try {
      // Sign SIWE to derive Alice's actual x25519 key — same derivation as connect()
      const sig = await signMessageAsync({ message: siweMessage(address) })
      const wA = keysFromSig(sig, address)
      const wB = createWallet(DEMO_PRIVATE_KEYS.B, 'Betty')
      const wC = createWallet(DEMO_PRIVATE_KEYS.C, 'Caroline')
      const { eee } = createGroupChannel(wA, [wA, wB, wC], 'WHISP-001', 0)

      const pointer = await uploadJSON(eee, `whispery-eee-epoch-${eee.epoch}`)

      writeContract({
        address: BACK_ADDRESS,
        abi: BACK_ABI,
        functionName: 'setChannel',
        args: [
          CHANNEL_ID as `0x${string}`,
          pointer,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          BigInt(eee.epoch),
        ],
      })
    } catch (e: unknown) {
      setPublishError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }

  const card: React.CSSProperties = {
    background: C.raised,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '20px 24px',
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 32,
      display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Connect */}
      <div style={card}>
        <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
          Wallet
        </p>

        {!isConnected ? (
          <button
            onClick={() => connect({ connector: injected() })}
            disabled={connecting}
            style={{
              background: C.accent, color: '#fff', border: 'none',
              borderRadius: 6, padding: '10px 20px',
              ...mono, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {connecting ? 'Connecting…' : 'Connect MetaMask'}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between' }}>
            <span style={{ ...mono, color: C.blue }}>{address}</span>
            <button
              onClick={() => disconnect()}
              style={{
                background: 'transparent', color: C.muted,
                border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '6px 12px', ...mono, cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Wrong network warning */}
      {onWrongNetwork && (
        <div style={{ ...card, borderColor: C.yellow, background: '#1a1600' }}>
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between' }}>
            <span style={{ ...mono, color: C.yellow, fontWeight: 700 }}>
              ⚠ Wrong network — switch to Sepolia
            </span>
            <button
              onClick={() => switchChain({ chainId: sepolia.id })}
              style={{
                background: C.yellow, color: '#000', border: 'none',
                borderRadius: 6, padding: '6px 14px',
                ...mono, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Switch to Sepolia
            </button>
          </div>
        </div>
      )}

      {/* Membership */}
      {isConnected && !onWrongNetwork && (
        <div style={{
          ...card,
          borderColor: loadingMember ? C.border
            : isMember ? '#2a5040' : '#5a2a2a',
        }}>
          <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
            Membership · WhisperyNFT
          </p>

          {loadingMember ? (
            <span style={{ ...mono, color: C.muted }}>Checking…</span>
          ) : isMember ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...mono, fontSize: 20 }}>✓</span>
                <span style={{ ...mono, color: C.green, fontWeight: 700, fontSize: 14 }}>
                  {memberName ?? `tokenId ${tokenId}`}
                </span>
                <span style={{ ...mono, color: C.muted }}>
                  — tokenId {String(tokenId)}
                </span>
              </div>
              <span style={{ ...mono, color: C.muted, fontSize: 11 }}>
                {NFT_ADDRESS}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...mono, fontSize: 20 }}>✗</span>
              <span style={{ ...mono, color: C.red, fontWeight: 700 }}>
                Not a member — this address holds no WhisperyNFT token
              </span>
            </div>
          )}
        </div>
      )}

      {/* EEE Pointer */}
      {isMember && !onWrongNetwork && (
        <div style={card}>
          <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
            Channel state · WhisperyBackpack
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="channelId"  value={CHANNEL_ID}          color={C.accent} />
            <Row label="epoch"      value={String(eeeEpoch)}    color={C.yellow} />
            <Row
              label="eeePointer"
              value={eeePointer || '(not yet published)'}
              color={eeePointer ? C.green : C.muted}
            />
          </div>

          {!eeePointer && !txDone && (
            <div style={{ marginTop: 14, display: 'flex',
              flexDirection: 'column', gap: 8 }}>
              <button
                onClick={publishEEE}
                disabled={publishing || txPending}
                style={{
                  background: publishing || txPending ? C.dim : C.accent,
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '10px 18px', ...mono, fontWeight: 700,
                  cursor: publishing || txPending ? 'default' : 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                {publishing ? 'Uploading to IPFS…'
                  : txPending ? 'Waiting for tx…'
                  : '↑ Publish EEE to IPFS + register on-chain'}
              </button>
              {publishError && (
                <span style={{ ...mono, color: C.red, fontSize: 11 }}>
                  {publishError}
                </span>
              )}
            </div>
          )}

          {txDone && (
            <p style={{ ...mono, color: C.green, fontSize: 11, marginTop: 10 }}>
              ✓ Published — refresh to see the pointer
            </p>
          )}
        </div>
      )}

      {/* Contract reference */}
      <div style={{ ...card, background: C.surface }}>
        <p style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
          Sepolia contracts
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="WhisperyNFT"      value={NFT_ADDRESS}  color={C.blue} />
          <Row label="WhisperyBackpack" value={BACK_ADDRESS} color={C.blue} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span style={{ ...mono, color: C.muted, fontSize: 10, minWidth: 120,
        fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ ...mono, color, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

// ── Tab toggle ────────────────────────────────────────────────────────────────

type Tab = 'omnibar' | 'messenger' | 'demo'

// ── Persistent wallet pill ────────────────────────────────────────────────────

function WalletPill() {
  const { address, isConnected } = useAccount()
  const { connect, isPending }   = useConnect()
  const { disconnect }           = useDisconnect()

  if (isConnected && address) {
    const short = address.slice(0, 6) + '…' + address.slice(-4)
    return (
      <button
        onClick={() => disconnect()}
        title="Click to disconnect"
        style={{
          ...mono, fontSize: 11, fontWeight: 700,
          padding: '5px 14px', borderRadius: 9999,
          background: C.raised,
          border: `1px solid ${C.green}55`,
          color: C.green, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color 0.2s',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: C.green, display: 'inline-block', flexShrink: 0,
        }} />
        {short}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      style={{
        ...mono, fontSize: 11, fontWeight: 700,
        padding: '5px 14px', borderRadius: 9999,
        background: 'transparent',
        border: `1px solid ${C.border}`,
        color: C.muted, cursor: isPending ? 'default' : 'pointer',
        transition: 'border-color 0.2s',
      }}
    >
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </button>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('omnibar')

  function TabBtn({ id, children }: { id: Tab; children: React.ReactNode }) {
    const active = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          background: active ? C.accent : 'transparent',
          color: active ? '#fff' : C.muted,
          border: `1px solid ${active ? C.accent : C.border}`,
          borderRadius: 6, padding: '6px 16px',
          ...mono, fontWeight: 700, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh',
      fontFamily: '"IBM Plex Mono", "Fira Code", monospace', fontSize: 12 }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 28px',
        display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, color: C.accent }}>
          WHISPERY
        </span>
        <div style={{ display: 'flex', gap: 8, flex: 1 }}>
          <TabBtn id="omnibar">⬡ Omnibar</TabBtn>
          <TabBtn id="messenger">⬡ Messenger</TabBtn>
          <TabBtn id="demo">⬡ Crypto Demo</TabBtn>
        </div>
        <WalletPill />
      </div>

      {/* Body */}
      {tab === 'omnibar'   ? <Omnibar />       :
       tab === 'messenger' ? <MessengerView /> :
                             <CryptoDemo />}
    </div>
  )
}
