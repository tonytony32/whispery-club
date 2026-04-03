import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { eciesEncrypt, eciesDecrypt } from '../crypto/ecies'

describe('ecies', () => {
  it('round-trip: encrypt → decrypt returns original plaintext', () => {
    const recipient = nacl.box.keyPair()
    const plain = new TextEncoder().encode('hello whispery')

    const data = eciesEncrypt(recipient.publicKey, plain)
    const recovered = eciesDecrypt(recipient.secretKey, data)

    expect(recovered).toEqual(plain)
  })

  it('uses a different ephemeral key each time — ciphertexts differ', () => {
    const recipient = nacl.box.keyPair()
    const plain = new TextEncoder().encode('same message')

    const a = eciesEncrypt(recipient.publicKey, plain)
    const b = eciesEncrypt(recipient.publicKey, plain)

    expect(a).not.toEqual(b)
  })

  it('fails to decrypt with the wrong secret key', () => {
    const recipient = nacl.box.keyPair()
    const attacker  = nacl.box.keyPair()
    const data = eciesEncrypt(recipient.publicKey, new TextEncoder().encode('secret'))

    expect(() => eciesDecrypt(attacker.secretKey, data)).toThrow('ECIES: decryption failed')
  })

  it('fails to decrypt tampered ciphertext', () => {
    const recipient = nacl.box.keyPair()
    const data = eciesEncrypt(recipient.publicKey, new TextEncoder().encode('secret'))

    data[data.length - 1] ^= 0xff // flip last byte

    expect(() => eciesDecrypt(recipient.secretKey, data)).toThrow('ECIES: decryption failed')
  })

  it('throws on data that is too short', () => {
    const recipient = nacl.box.keyPair()
    expect(() => eciesDecrypt(recipient.secretKey, new Uint8Array(10))).toThrow('ECIES: data too short')
  })
})
