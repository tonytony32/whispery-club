import { describe, it, expect } from 'vitest'
import { encode, decode } from '../proto/envelope'

describe('envelope codec', () => {
  it('round-trip: encode → decode returns original fields', () => {
    const macHint = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const data    = new Uint8Array([9, 10, 11, 12])

    const recovered = decode(encode({ macHint, data }))

    expect(recovered.macHint).toEqual(macHint)
    expect(recovered.data).toEqual(data)
  })

  it('handles empty data field', () => {
    const env = { macHint: new Uint8Array(8).fill(0), data: new Uint8Array(0) }
    const recovered = decode(encode(env))
    expect(recovered.data).toEqual(env.data)
  })

  it('throws on missing fields', () => {
    expect(() => decode(new Uint8Array(0))).toThrow('missing required fields')
  })

  it('throws on unexpected wire type', () => {
    // tag 0x08 = field 1, wire type 0 (varint) — should be wire type 2
    expect(() => decode(new Uint8Array([0x08, 0x01]))).toThrow('unexpected wire type')
  })
})
