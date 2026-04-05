import { useEffect, useState } from 'react'
import { verifyENSIP25, type VerificationStatus } from './ensip25'

interface Props {
  ensName:  string
  tokenId:  number    // used as agentId proxy in demo
  tooltip?: string    // overrides the default title attribute when verified
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
  fontSize: 9,
  fontWeight: 700,
}

export function ENSIP25Badge({ ensName, tokenId, tooltip }: Props) {
  const [status, setStatus]   = useState<VerificationStatus>('pending')
  const [textKey, setTextKey] = useState<string>('')

  useEffect(() => {
    verifyENSIP25(ensName, String(tokenId)).then(r => {
      setStatus(r.status)
      setTextKey(r.textKey)
    })
  }, [ensName, tokenId])

  if (status === 'pending') {
    return (
      <span style={{ ...mono, color: '#475569' }}>
        …
      </span>
    )
  }

  if (status === 'verified') {
    return (
      <span
        title={tooltip ?? textKey}
        style={{
          ...mono,
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: '#022c22', color: '#6ee7b7',
          border: '1px solid #34d39966',
          borderRadius: 3, padding: '1px 5px',
        }}
      >
        ✓ ENSIP-25
      </span>
    )
  }

  if (status === 'unverified') {
    return (
      <span
        title={`text record not set: ${textKey}`}
        style={{
          ...mono,
          background: '#1e293b', color: '#475569',
          border: '1px solid #334155',
          borderRadius: 3, padding: '1px 5px',
        }}
      >
        unverified
      </span>
    )
  }

  // error
  return (
    <span
      title="ENS RPC resolution failed"
      style={{ ...mono, color: '#ff5a5a' }}
    >
      RPC error
    </span>
  )
}
