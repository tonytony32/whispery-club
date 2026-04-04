/**
 * mockNode — in-process Waku bus for demo mode.
 *
 * A singleton EventTarget acts as the message bus. Every L1Messenger that
 * imports this module shares the same bus, so a publish by Alice is received
 * by Betty's filter subscription without touching the network.
 *
 * The interface matches exactly what L1Messenger calls on a real LightNode:
 *   node.lightPush.send(encoder, { payload })  → returns { successes, failures }
 *   node.filter.subscribe([decoder], callback) → callback({ payload })
 *   node.stop()
 *
 * Latency: 50–150 ms random delay per message to simulate realistic timing.
 */

// Module-level singleton — shared across all imports in the same page.
const bus = new EventTarget()

export const mockNode = {
  lightPush: {
    async send(
      encoder: { contentTopic: string },
      message: { payload: Uint8Array },
    ): Promise<{ successes: Array<{ toString(): string }>; failures: [] }> {
      // Simulate network latency before delivery
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100))
      bus.dispatchEvent(
        new CustomEvent(encoder.contentTopic, { detail: message.payload }),
      )
      return { successes: [{ toString: () => 'mock-peer' }], failures: [] }
    },
  },

  filter: {
    async subscribe(
      decoders: Array<{ contentTopic: string }>,
      callback: (msg: { payload?: Uint8Array }) => void,
    ): Promise<() => void> {
      const listeners: Array<{ topic: string; fn: EventListener }> = []

      for (const decoder of decoders) {
        const fn: EventListener = (e) => {
          callback({ payload: (e as CustomEvent<Uint8Array>).detail })
        }
        bus.addEventListener(decoder.contentTopic, fn)
        listeners.push({ topic: decoder.contentTopic, fn })
      }

      // Return unsubscribe — same shape as Waku's subscription handle
      return () => {
        for (const { topic, fn } of listeners) {
          bus.removeEventListener(topic, fn)
        }
      }
    },
  },

  // Lifecycle stubs — called by cleanup paths in hooks
  async start() {},
  async stop() {},
  async waitForPeers() {},
  isStarted: () => true,
}
