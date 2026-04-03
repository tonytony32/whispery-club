import { describe, it, expect } from 'vitest'
import { macHint } from '../crypto/hints'

describe('macHint', () => {
  it('returns exactly 8 bytes', () => {
    const pubKey = new Uint8Array(32).fill(1)
    expect(macHint(pubKey)).toHaveLength(8)
  })

  it('is deterministic — same pubKey always yields same hint', () => {
    const pubKey = new Uint8Array(32).fill(42)
    const a = macHint(pubKey)
    const b = macHint(pubKey)
    expect(a).toEqual(b)
  })

  it('differs for different pubKeys', () => {
    const pkA = new Uint8Array(32).fill(1)
    const pkB = new Uint8Array(32).fill(2)
    expect(macHint(pkA)).not.toEqual(macHint(pkB))
  })
})
