/**
 * Integration test for L1Messenger — uses a mock LightNode.
 *
 * We don't connect to the real Waku network here (slow, requires internet).
 * Instead we wire two messengers together via an in-memory bus that simulates
 * what Waku does: deliver a published payload to all subscribers of that topic.
 */

import { describe, it, expect, vi } from 'vitest'
import nacl from 'tweetnacl'
import { L1Messenger, neighborhoodTopic, channelTopic } from '../messenger'
import { createWallet, createGroupChannel, accessGroupChannel, DEMO_PRIVATE_KEYS } from '../../core/crypto'
import type { LightNode } from '@waku/sdk'

// ── Helpers ───────────────────────────────────────────────────────────────────

const walletAlice   = createWallet(DEMO_PRIVATE_KEYS.A, 'Alice')
const walletBob     = createWallet(DEMO_PRIVATE_KEYS.B, 'Bob')
const walletCharlie = createWallet(DEMO_PRIVATE_KEYS.C, 'Charlie')

// ── In-memory Waku bus ────────────────────────────────────────────────────────

type Callback = (msg: { payload: Uint8Array }) => void

function makeMockNode(): {
  node: LightNode
  deliver: (topic: string, payload: Uint8Array) => void
} {
  const subscribers = new Map<string, Callback[]>()

  function deliver(topic: string, payload: Uint8Array) {
    subscribers.get(topic)?.forEach(cb => cb({ payload }))
  }

  const node = {
    lightPush: {
      send: vi.fn(async (_encoder: { contentTopic: string }, msg: { payload: Uint8Array }) => {
        deliver(_encoder.contentTopic, msg.payload)
        return { failures: [] }
      }),
    },
    filter: {
      subscribe: vi.fn(async (decoders: Array<{ contentTopic: string }>, cb: Callback) => {
        for (const d of decoders) {
          const list = subscribers.get(d.contentTopic) ?? []
          list.push(cb)
          subscribers.set(d.contentTopic, list)
        }
      }),
    },
  } as unknown as LightNode

  return { node, deliver }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('L1Messenger', () => {
  it('neighborhoodTopic: two nodes with different pubkeys get different topics', () => {
    const topicA = neighborhoodTopic(new Uint8Array([0x01, 0x02, ...new Array(30).fill(0)]))
    const topicB = neighborhoodTopic(new Uint8Array([0x03, 0x04, ...new Array(30).fill(0)]))
    expect(topicA).not.toEqual(topicB)
  })

  it('publish → subscribe: recipient receives and decrypts message with L0 envelope', async () => {
    const { node } = makeMockNode()

    const sender   = new L1Messenger(node, walletAlice)
    const receiver = new L1Messenger(node, walletBob)

    await receiver.subscribe()

    const received: string[] = []
    receiver.addEventListener('message', (e) => {
      received.push((e as CustomEvent<{ text: string }>).detail.text)
    })

    await sender.publish(walletBob.x25519.publicKey, 'hello bob')

    expect(received).toEqual(['hello bob'])
  })

  it('received message includes sender_pk from L0 envelope', async () => {
    const { node } = makeMockNode()

    const sender   = new L1Messenger(node, walletAlice)
    const receiver = new L1Messenger(node, walletBob)

    await receiver.subscribe()

    const events: CustomEvent<{ text: string; senderPk: string }>[] = []
    receiver.addEventListener('message', (e) => {
      events.push(e as CustomEvent<{ text: string; senderPk: string }>)
    })

    await sender.publish(walletBob.x25519.publicKey, 'signed message')

    expect(events).toHaveLength(1)
    // senderPk in L0 envelope matches Alice's X25519 pubkey
    const { bytesToHex } = await import('@noble/hashes/utils')
    expect(events[0].detail.senderPk).toBe(bytesToHex(walletAlice.x25519.publicKey))
  })

  it('hint filter: message for alice is discarded by bob', async () => {
    const { node } = makeMockNode()

    const aliceMessenger = new L1Messenger(node, walletAlice)
    const bobMessenger   = new L1Messenger(node, walletBob)

    await bobMessenger.subscribe()

    const bobReceived: string[] = []
    bobMessenger.addEventListener('message', (e) => {
      bobReceived.push((e as CustomEvent<{ text: string }>).detail.text)
    })

    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    // Alice sends to herself — Bob should discard it (different hint)
    await aliceMessenger.publish(walletAlice.x25519.publicKey, 'message for alice only')

    expect(bobReceived).toHaveLength(0)

    consoleSpy.mockRestore()
    void walletCharlie
  })

  it('publish sends to recipient neighborhood topic, not sender topic', async () => {
    const { node } = makeMockNode()

    const sender = new L1Messenger(node, walletAlice)
    await sender.publish(walletBob.x25519.publicKey, 'hi')

    const expectedTopic = neighborhoodTopic(walletBob.x25519.publicKey)
    expect(node.lightPush.send).toHaveBeenCalledWith(
      expect.objectContaining({ contentTopic: expectedTopic }),
      expect.any(Object),
    )
  })
})

// ── Group tests ───────────────────────────────────────────────────────────────

describe('L1Messenger group', () => {
  it('channelTopic: different channelIds yield different topics', () => {
    const topicA = channelTopic('aabbccdd' + '0'.repeat(56))
    const topicB = channelTopic('11223344' + '0'.repeat(56))
    expect(topicA).not.toEqual(topicB)
  })

  it('channelTopic: consistent with 0x-prefixed and bare hex', () => {
    const id = 'aabbccdd' + '0'.repeat(56)
    expect(channelTopic(id)).toEqual(channelTopic('0x' + id))
  })

  it('publishGroup → subscribeGroup: recipient decrypts with content_key', async () => {
    const { node } = makeMockNode()

    const { eee, content_key } = createGroupChannel(
      walletAlice,
      [walletAlice, walletBob, walletCharlie],
      'TEST-001',
      0,
    )

    const aliceMessenger = new L1Messenger(node, walletAlice)
    const bobMessenger   = new L1Messenger(node, walletBob)

    const ckBob = accessGroupChannel(walletBob, eee)!
    await bobMessenger.subscribeGroup(eee.channel_id, ckBob)

    const received: string[] = []
    bobMessenger.addEventListener('message', (e) => {
      received.push((e as CustomEvent<{ text: string }>).detail.text)
    })

    await aliceMessenger.publishGroup(content_key, eee.channel_id, eee.epoch, 'hello group')

    expect(received).toEqual(['hello group'])
  })

  it('publishGroup → subscribeGroup: all three members receive the message', async () => {
    const { node } = makeMockNode()

    const { eee, content_key } = createGroupChannel(
      walletAlice,
      [walletAlice, walletBob, walletCharlie],
      'TEST-002',
      0,
    )

    const aliceM   = new L1Messenger(node, walletAlice)
    const bobM     = new L1Messenger(node, walletBob)
    const charlieM = new L1Messenger(node, walletCharlie)

    const ckBob     = accessGroupChannel(walletBob, eee)!
    const ckCharlie = accessGroupChannel(walletCharlie, eee)!

    await bobM.subscribeGroup(eee.channel_id, ckBob)
    await charlieM.subscribeGroup(eee.channel_id, ckCharlie)

    const bobReceived:     string[] = []
    const charlieReceived: string[] = []
    bobM.addEventListener('message',     e => bobReceived.push((e as CustomEvent<{ text: string }>).detail.text))
    charlieM.addEventListener('message', e => charlieReceived.push((e as CustomEvent<{ text: string }>).detail.text))

    await aliceM.publishGroup(content_key, eee.channel_id, eee.epoch, 'broadcast')

    expect(bobReceived).toEqual(['broadcast'])
    expect(charlieReceived).toEqual(['broadcast'])
  })

  it('publishGroup sends to channel topic, not neighborhood topic', async () => {
    const { node } = makeMockNode()

    const { eee, content_key } = createGroupChannel(
      walletAlice, [walletAlice, walletBob], 'TEST-003', 0,
    )

    const sender = new L1Messenger(node, walletAlice)
    await sender.publishGroup(content_key, eee.channel_id, eee.epoch, 'hi')

    const expectedTopic = channelTopic(eee.channel_id)
    expect(node.lightPush.send).toHaveBeenCalledWith(
      expect.objectContaining({ contentTopic: expectedTopic }),
      expect.any(Object),
    )
    // Must NOT send to a neighborhood topic
    expect(node.lightPush.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ contentTopic: expect.stringContaining('/neighbor-') }),
      expect.any(Object),
    )
  })
})
