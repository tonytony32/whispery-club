/**
 * Hand-rolled protobuf codec for Envelope (see envelope.proto).
 * No build step — keeps the schema in sync with the .proto file via comments.
 *
 * Wire format (proto3):
 *   field 1 (mac_hint, bytes): tag=0x0a | varint len | bytes
 *   field 2 (data,     bytes): tag=0x12 | varint len | bytes
 */

export interface Envelope {
  macHint: Uint8Array // 8 bytes
  data: Uint8Array
}

// ── Encoder ───────────────────────────────────────────────────────────────────

function pushVarint(buf: number[], n: number): void {
  while (n > 0x7f) {
    buf.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  buf.push(n)
}

function pushBytes(buf: number[], fieldNum: number, bytes: Uint8Array): void {
  pushVarint(buf, (fieldNum << 3) | 2) // wire type 2 = length-delimited
  pushVarint(buf, bytes.length)
  for (const b of bytes) buf.push(b)
}

export function encode(env: Envelope): Uint8Array {
  const buf: number[] = []
  pushBytes(buf, 1, env.macHint)
  pushBytes(buf, 2, env.data)
  return new Uint8Array(buf)
}

// ── Decoder ───────────────────────────────────────────────────────────────────

export function decode(raw: Uint8Array): Envelope {
  let pos = 0
  let macHint: Uint8Array | undefined
  let data: Uint8Array | undefined

  function readVarint(): number {
    let n = 0
    let shift = 0
    while (pos < raw.length) {
      const b = raw[pos++]
      n |= (b & 0x7f) << shift
      if (!(b & 0x80)) return n
      shift += 7
    }
    throw new Error('Envelope: truncated varint')
  }

  while (pos < raw.length) {
    const tag = readVarint()
    const field = tag >>> 3
    const wire = tag & 0x7
    if (wire !== 2) throw new Error(`Envelope: unexpected wire type ${wire}`)
    const len = readVarint()
    const slice = raw.slice(pos, pos + len)
    pos += len
    if (field === 1) macHint = slice
    else if (field === 2) data = slice
    // unknown fields are silently ignored (proto3 forward-compat)
  }

  if (!macHint || !data) throw new Error('Envelope: missing required fields')
  return { macHint, data }
}
