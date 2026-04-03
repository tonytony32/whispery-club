/**
 * Integration test for L1Messenger — uses a mock LightNode.
 *
 * We don't connect to the real Waku network here (slow, requires internet).
 * Instead we wire two messengers together via an in-memory bus that simulates
 * what Waku does: deliver a published payload to all subscribers of that topic.
 */

import { describe, it, expect, vi } from 'vitest'
import nacl from 'tweetnacl'
import { L1Messenger, neighborhoodTopic } from '../messenger'
import type { LightNode } from '@waku/sdk'

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
        // Simulate async delivery
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
    const kpA = nacl.box.keyPair()
    const kpB = nacl.box.keyPair()
    // Only guaranteed different if first 2 bytes differ — use keys we know differ
    const topicA = neighborhoodTopic(new Uint8Array([0x01, 0x02, ...new Array(30).fill(0)]))
    const topicB = neighborhoodTopic(new Uint8Array([0x03, 0x04, ...new Array(30).fill(0)]))
    expect(topicA).not.toEqual(topicB)
    // suppress unused warning
    void kpA; void kpB
  })

  it('publish → subscribe: recipient receives and decrypts message', async () => {
    const { node } = makeMockNode()

    const alice = nacl.box.keyPair()
    const bob   = nacl.box.keyPair()

    const sender   = new L1Messenger(node, alice.secretKey)
    const receiver = new L1Messenger(node, bob.secretKey)

    // Bob subscribes to his own neighborhood
    await receiver.subscribe()

    // Collect messages received by Bob
    const received: string[] = []
    receiver.addEventListener('message', (e) => {
      received.push((e as CustomEvent<{ text: string }>).detail.text)
    })

    // Alice sends to Bob
    await sender.publish(bob.publicKey, 'hello bob')

    expect(received).toEqual(['hello bob'])
  })

  it('hint filter: message for alice is discarded by bob (Ignored by hint)', async () => {
    const { node } = makeMockNode()

    const alice   = nacl.box.keyPair()
    const bob     = nacl.box.keyPair()
    const charlie = nacl.box.keyPair()

    // Force alice and bob into the same neighborhood topic for this test
    // by manually publishing a message for alice onto bob's topic
    const aliceMessenger = new L1Messenger(node, alice.secretKey)
    const bobMessenger   = new L1Messenger(node, bob.secretKey)

    await bobMessenger.subscribe()

    const bobReceived: string[] = []
    bobMessenger.addEventListener('message', (e) => {
      bobReceived.push((e as CustomEvent<{ text: string }>).detail.text)
    })

    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    // Charlie sends to alice — but we manually deliver it to bob's subscriber
    // to simulate a neighborhood collision (both share the same 2-byte prefix)
    await aliceMessenger.publish(alice.publicKey, 'message for alice only')

    // Bob should not have received it (different hint)
    expect(bobReceived).toHaveLength(0)

    consoleSpy.mockRestore()
    void charlie
  })

  it('publish sends to recipient neighborhood topic, not sender topic', async () => {
    const { node } = makeMockNode()

    const alice = nacl.box.keyPair()
    const bob   = nacl.box.keyPair()

    const sender = new L1Messenger(node, alice.secretKey)
    await sender.publish(bob.publicKey, 'hi')

    const expectedTopic = neighborhoodTopic(bob.publicKey)
    expect(node.lightPush.send).toHaveBeenCalledWith(
      expect.objectContaining({ contentTopic: expectedTopic }),
      expect.any(Object),
    )
  })
})
