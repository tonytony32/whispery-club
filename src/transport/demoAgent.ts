/**
 * demoAgent — makes Betty auto-respond to incoming messages.
 *
 * Listens for 'message' events on Betty's L1Messenger and replies after a
 * realistic 0.8–2 s delay, cycling through a short set of responses.
 * Returns a cleanup function to remove the listener.
 */

import type { L1Messenger } from './messenger'

const RESPONSES = [
  'Entendido. Analizando los datos del canal.',
  'He procesado tu mensaje. ¿Necesitas más detalles?',
  'Confirmado. Ejecutando la siguiente acción.',
  'Datos recibidos. El análisis estará listo en breve.',
  'Perfecto. ¿Hay algo más en lo que pueda ayudarte?',
]

/**
 * @param messenger  Betty's L1Messenger — used only to listen for incoming messages.
 * @param send       Betty's hook send() — publishes AND records the reply as 'out'
 *                   in Betty's panel, so the flow is visible on both sides.
 */
export function startDemoAgent(
  messenger: L1Messenger,
  send: (text: string) => Promise<void>,
): () => void {
  let index = 0

  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ text: string }>).detail
    if (!detail?.text?.trim()) return

    const reply = RESPONSES[index % RESPONSES.length]
    index++

    // Delay 0.8–2 s to feel like real agent processing
    const delay = 800 + Math.random() * 1200
    setTimeout(async () => {
      try {
        await send(reply)
      } catch {
        // Demo — swallow send errors silently
      }
    }, delay)
  }

  messenger.addEventListener('message', handler)
  return () => messenger.removeEventListener('message', handler)
}
