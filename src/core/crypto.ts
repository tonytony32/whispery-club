/**
 * Whispery — Level 0 | core/crypto.ts
 *
 * Ciclo criptográfico puro. Sin UI, sin framework, sin red.
 *
 * Librerías: tweetnacl · @noble/hashes · @noble/curves · viem
 *
 * ─── Escenario A: canal P2P ────────────────────────────────────────────────
 *   Wallet A y B derivan su par X25519 desde una firma SIWE determinista.
 *   A cifra un envelope para B. B lo abre.
 *
 * ─── Escenario B: canal de grupo gateado por NFT ──────────────────────────
 *   Wallet A crea el canal (tokenId → channel_id).
 *   Genera sk_group / pk_group y un content_key aleatorio.
 *   Construye una ACT con entradas para A, B y C.
 *   Wallet D intenta entrar → no está en la ACT → acceso denegado.
 *   B envía un envelope, C lo descifra.
 *
 * ─── Los 4 Retos ────────────────────────────────────────────────────────────
 *   Reto 1 – EEE: archivo de estado listo para distribución fragmentada.
 *   Reto 2 – ACT: lookup_key + access_key_decryption_key por grantee.
 *   Reto 3 – Rotación: nueva época invalida accesos anteriores, timestamps
 *            para ordenamiento secuencial y prevención de colisiones.
 *   Reto 4 – Sellado: emisor estampa timestamp + firma secp256k1 en cada
 *            envelope/EEE en el momento exacto de emisión.
 */

import nacl from 'tweetnacl'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils'
import { getAddress } from 'viem'

// ─── Utilidades ──────────────────────────────────────────────────────────────

const enc = new TextEncoder()
const dec = new TextDecoder()

export const toHex = (b: Uint8Array): string => bytesToHex(b)
export const fromHex = (h: string): Uint8Array => hexToBytes(h.replace(/^0x/, ''))

/**
 * HKDF-SHA256. Info strings distintos por contexto para evitar colisiones
 * entre materiales de clave de diferentes protocolos.
 */
function derive(ikm: Uint8Array, info: string, len = 32): Uint8Array {
  return hkdf(sha256, ikm, undefined, enc.encode(info), len)
}

/**
 * Serialización canónica para firma: claves ordenadas alfabéticamente,
 * sin el campo "signature". Garantiza determinismo entre implementaciones.
 */
function canonicalize(obj: Record<string, unknown>): string {
  const strip = ({ signature: _sig, ...rest }: Record<string, unknown>) => rest
  const sorted = Object.fromEntries(
    Object.entries(strip(obj)).sort(([a], [b]) => a.localeCompare(b))
  )
  return JSON.stringify(sorted)
}

function seal(payload: Record<string, unknown>, privKey: Uint8Array): string {
  const hash = sha256(enc.encode(canonicalize(payload)))
  return toHex(secp256k1.sign(hash, privKey).toCompactRawBytes())
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Wallet {
  label: string
  ethPrivKey: Uint8Array
  ethAddress: string         // checksummed via viem
  x25519: nacl.BoxKeyPair    // derivado determinísticamente desde firma SIWE
}

/**
 * Envelope de mensaje. Reto 4: timestamp e= momento de emisión, signature
 * cubre todos los campos salvo ella misma (no-repudio).
 *
 * mac_hint: primeros 4 bytes del nonce (routing hint para filtrado en red,
 * NO para autenticación — la autenticación la provee Poly1305 dentro de box).
 */
export interface Envelope {
  version: 1
  channel_id: string
  epoch: number
  sender_pk: string          // X25519 public key (hex) del emisor
  ciphertext: string         // hex(nonce[24] || secretbox_output)
  mac_hint: string           // hex(nonce[0..3]) — routing hint
  timestamp: number          // unix ms — estampado en origen (Reto 4)
  signature: string          // secp256k1 sobre sha256(canonical JSON sin sig)
}

/**
 * Entrada de la Access Control Table.
 * lookup_key:           HKDF(DH(sk_group, pk_member), "whispery/act/lookup/…")
 * encrypted_content_key: secretbox(content_key, nonce, access_kdk)
 *                       donde access_kdk = HKDF(…, "whispery/act/access/…")
 */
export interface ACTEntry {
  lookup_key: string              // hex(32 bytes) — para localizar la entrada
  encrypted_content_key: string   // hex(nonce[24] || ciphertext[48])
}

/**
 * EEE — archivo principal de estado del canal.
 * Reto 1: preparado para distribución fragmentada (campo chunks_hint).
 * Reto 3: epoch + created_at garantizan orden secuencial.
 * Reto 4: admin firma el EEE completo en el momento de creación.
 */
export interface EEE {
  version: 1
  channel_id: string
  epoch: number
  pk_group: string           // X25519 group public key (hex)
  act: ACTEntry[]
  chunks_hint: number        // Reto 1: nº de chunks conceptuales para distribución
  created_at: number         // unix ms — timestamp de creación (Reto 3 + 4)
  admin_address: string      // dirección Ethereum del admin
  signature: string          // secp256k1 del admin sobre sha256(canonical EEE)
}

// ─── Creación de Wallets ─────────────────────────────────────────────────────

/**
 * Deriva la dirección Ethereum desde la clave privada secp256k1.
 * pubkey sin comprimir (65 bytes) → quitar prefijo 0x04 → keccak256 → últimos 20 bytes.
 */
function ethAddress(privKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privKey, false).slice(1) // 64 bytes: x || y
  return getAddress('0x' + bytesToHex(keccak_256(pub).slice(-20)))
}

/**
 * Mensaje SIWE con nonce fijo y sin issued-at.
 * NOTA: intencionalmente no-spec para derivación determinista del par X25519.
 * Un nonce variable o issued-at produciría una identidad diferente en cada sesión.
 */
export function siweMessage(address: string): string {
  return [
    'whispery.club wants you to sign in with your Ethereum account:',
    address,
    '',
    'URI: https://whispery.club',
    'Version: 1',
    'Chain ID: 1',
    'Nonce: whispery-v0-deterministic',
    'Statement: Derive my Whispery messaging keypair.',
  ].join('\n')
}

function siweSign(privKey: Uint8Array, address: string): Uint8Array {
  const msg = enc.encode(siweMessage(address))
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`)
  const hash = keccak_256(concatBytes(prefix, msg))
  return secp256k1.sign(hash, privKey).toCompactRawBytes()
}

/**
 * Crea una wallet desde una clave privada Ethereum hex.
 * El par X25519 se deriva deterministamente: SIWE → firma → sha256 → seed.
 */
export function createWallet(privKeyHex: string, label: string): Wallet {
  const ethPrivKey = fromHex(privKeyHex)
  const address = ethAddress(ethPrivKey)
  const seed = sha256(siweSign(ethPrivKey, address))
  return {
    label,
    ethPrivKey,
    ethAddress: address,
    x25519: nacl.box.keyPair.fromSecretKey(seed),
  }
}

/**
 * Deriva un keypair X25519 y una clave de firma secp256k1 desde la firma SIWE
 * obtenida vía MetaMask. Un solo popup → dos claves deterministas:
 *
 *   seed        = sha256(siwe_signature)
 *   x25519      = nacl.box.keyPair(seed)               — cifrado de mensajes
 *   signingKey  = hkdf(seed, "whispery/signing/v1")     — firma de envelopes L0
 *
 * La signingKey NO es la clave privada de Ethereum de Alice — es una clave
 * derivada, vinculada a su wallet de forma determinista. Permite firmar
 * cada mensaje Whispery sin popups adicionales en MetaMask.
 *
 * @param signatureHex  Firma hex (0x…, 65 bytes) devuelta por wagmi signMessage.
 * @param ethAddress    Dirección Ethereum real del usuario (de wagmi useAccount).
 */
export function keysFromSig(signatureHex: string, ethAddress: string): Wallet {
  const seed       = sha256(fromHex(signatureHex.replace(/^0x/, '')))
  const x25519     = nacl.box.keyPair.fromSecretKey(seed)
  const signingKey = derive(seed, 'whispery/signing/v1')

  return {
    label:      ethAddress.slice(0, 10) + '…',
    ethPrivKey: signingKey,        // clave de firma derivada (no la clave ETH real)
    ethAddress: getAddress(ethAddress),
    x25519,
  }
}

// ─── Escenario A: Canal P2P ──────────────────────────────────────────────────

/**
 * channel_id P2P: sha256 de las dos claves X25519 ordenadas lexicográficamente.
 * Determinista y simétrico — mismo resultado desde ambos lados.
 */
export function p2pChannelId(pkA: Uint8Array, pkB: Uint8Array): string {
  const [lo, hi] = [toHex(pkA), toHex(pkB)].sort()
  return toHex(sha256(concatBytes(fromHex(lo), fromHex(hi))))
}

/**
 * Escenario A — Wallet A cifra un mensaje para Wallet B.
 *
 * Flujo:
 *   shared_secret = X25519_DH(sk_A, pk_B)
 *   msg_key       = HKDF(shared_secret, "whispery/p2p/msg/…/epoch/…")
 *   ciphertext    = secretbox(message, nonce, msg_key)
 *   signature     = secp256k1(sha256(canonical_envelope))   ← Reto 4
 */
export function createP2PEnvelope(
  sender: Wallet,
  recipientPk: Uint8Array,
  message: string,
  epoch = 0,
): Envelope {
  const channel_id = p2pChannelId(sender.x25519.publicKey, recipientPk)
  const dh = nacl.scalarMult(sender.x25519.secretKey, recipientPk)
  const msgKey = derive(dh, `whispery/p2p/msg/${channel_id}/epoch/${epoch}`)

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const box = nacl.secretbox(enc.encode(message), nonce, msgKey)
  const ciphertext = toHex(concatBytes(nonce, box))

  const partial = {
    version: 1 as const,
    channel_id,
    epoch,
    sender_pk: toHex(sender.x25519.publicKey),
    ciphertext,
    mac_hint: toHex(nonce.slice(0, 4)),
    timestamp: Date.now(),       // Reto 4: estampado en el momento de emisión
  }
  return { ...partial, signature: seal(partial, sender.ethPrivKey) }
}

/**
 * Escenario A — Wallet B descifra el envelope de A.
 */
export function openP2PEnvelope(
  recipient: Wallet,
  senderPk: Uint8Array,
  envelope: Envelope,
): string {
  const dh = nacl.scalarMult(recipient.x25519.secretKey, senderPk)
  const msgKey = derive(dh, `whispery/p2p/msg/${envelope.channel_id}/epoch/${envelope.epoch}`)

  const raw = fromHex(envelope.ciphertext)
  const nonce = raw.slice(0, nacl.secretbox.nonceLength)
  const box = raw.slice(nacl.secretbox.nonceLength)

  const plain = nacl.secretbox.open(box, nonce, msgKey)
  if (!plain) throw new Error('P2P: fallo en descifrado — clave incorrecta o ciphertext alterado')
  return dec.decode(plain)
}

// ─── Escenario B: Canal de Grupo Gateado por NFT ────────────────────────────

/**
 * Construye una ACT entry para un grantee.
 *
 * Reto 2 — flujo de autorización:
 *   session_key  = DH(sk_group, pk_grantee)
 *   lookup_key   = HKDF(session_key, "whispery/act/lookup/…")   [32 bytes]
 *   access_kdk   = HKDF(session_key, "whispery/act/access/…")   [32 bytes]
 *   enc_key      = secretbox(content_key, nonce, access_kdk)
 */
function buildACTEntry(
  sk_group: Uint8Array,
  grantee: Wallet,
  content_key: Uint8Array,
  channel_id: string,
): ACTEntry {
  const session_key = nacl.scalarMult(sk_group, grantee.x25519.publicKey)
  const lookup_key = derive(session_key, `whispery/act/lookup/${channel_id}`)
  const access_kdk = derive(session_key, `whispery/act/access/${channel_id}`)

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const encrypted = nacl.secretbox(content_key, nonce, access_kdk)

  return {
    lookup_key: toHex(lookup_key),
    encrypted_content_key: toHex(concatBytes(nonce, encrypted)),
  }
}

/**
 * Crea el EEE y retorna el sk_group (solo el admin lo guarda) y el content_key.
 *
 * Reto 1: chunks_hint = ceil(act.length / 3) — señaliza fragmentación conceptual.
 * Reto 3: epoch=0, created_at=Date.now() — primer estado del canal.
 * Reto 4: admin sella el EEE con firma secp256k1 en el momento de creación.
 */
export function createGroupChannel(
  admin: Wallet,
  members: Wallet[],
  tokenId: string,
  epoch = 0,
): { eee: EEE; sk_group: Uint8Array; content_key: Uint8Array } {
  const groupKP = nacl.box.keyPair()
  const content_key = nacl.randomBytes(32)
  const channel_id = toHex(sha256(enc.encode(`whispery/nft/${tokenId}`)))

  const act = members.map(m => buildACTEntry(groupKP.secretKey, m, content_key, channel_id))

  const partial = {
    version: 1 as const,
    channel_id,
    epoch,
    pk_group: toHex(groupKP.publicKey),
    act,
    chunks_hint: Math.ceil(act.length / 3) || 1,  // Reto 1
    created_at: Date.now(),                         // Reto 3 + 4
    admin_address: admin.ethAddress,
  }
  const eee: EEE = { ...partial, signature: seal(partial as Record<string, unknown>, admin.ethPrivKey) }
  return { eee, sk_group: groupKP.secretKey, content_key }
}

/**
 * Un miembro intenta acceder al canal.
 *
 * Reto 2 — el grantee reconstruye su lookup_key:
 *   session_key = DH(sk_member, pk_group)   ← simétrico al del admin
 *   lookup_key  = HKDF(session_key, "whispery/act/lookup/…")
 *   Busca en la ACT. Si está → descifra content_key. Si no → null.
 *
 * Returns content_key si autorizado, null si no.
 */
export function accessGroupChannel(member: Wallet, eee: EEE): Uint8Array | null {
  const pk_group = fromHex(eee.pk_group)
  const session_key = nacl.scalarMult(member.x25519.secretKey, pk_group)
  const lookup_key = derive(session_key, `whispery/act/lookup/${eee.channel_id}`)
  const access_kdk = derive(session_key, `whispery/act/access/${eee.channel_id}`)

  const entry = eee.act.find(e => e.lookup_key === toHex(lookup_key))
  if (!entry) return null  // Wallet D: no está en la ACT

  const raw = fromHex(entry.encrypted_content_key)
  const nonce = raw.slice(0, nacl.secretbox.nonceLength)
  const box = raw.slice(nacl.secretbox.nonceLength)
  return nacl.secretbox.open(box, nonce, access_kdk)  // null si alterado
}

// Longitud fija de la clave pública secp256k1 comprimida (formato 02/03 + 32 bytes X).
const SIGNING_PK_LEN = 33

/**
 * Un miembro autorizado cifra un mensaje para el canal.
 * Usa el content_key compartido (obtenido vía accessGroupChannel).
 *
 * Verificación in-band (Reto 4 extendido):
 *   El plaintext que se cifra con content_key lleva la clave pública de firma
 *   secp256k1 del emisor como prefijo de 33 bytes (comprimida):
 *
 *     plaintext = signingPubKey[33] || message_utf8
 *
 *   Al descifrar, openGroupEnvelope extrae esos 33 bytes y los usa directamente
 *   para verificar la firma de la Capa 5. No se necesita ningún registro externo:
 *   la identidad viaja dentro del ciphertext, invisible para la capa de transporte.
 */
export function createGroupEnvelope(
  sender: Wallet,
  content_key: Uint8Array,
  channel_id: string,
  message: string,
  epoch = 0,
): Envelope {
  const signingPubKey = secp256k1.getPublicKey(sender.ethPrivKey, true) // 33 bytes, comprimida
  const plaintext     = concatBytes(signingPubKey, enc.encode(message))

  const nonce      = nacl.randomBytes(nacl.secretbox.nonceLength)
  const box        = nacl.secretbox(plaintext, nonce, content_key)
  const ciphertext = toHex(concatBytes(nonce, box))

  const partial = {
    version: 1 as const,
    channel_id,
    epoch,
    sender_pk: toHex(sender.x25519.publicKey),
    ciphertext,
    mac_hint: toHex(nonce.slice(0, 4)),
    timestamp: Date.now(),
  }
  return { ...partial, signature: seal(partial, sender.ethPrivKey) }
}

/**
 * Descifra un envelope de grupo y verifica la firma secp256k1 del emisor.
 *
 * Flujo:
 *   1. secretbox.open(ciphertext, nonce, content_key) → plaintext
 *      Falla si el ciphertext fue alterado (Poly1305 lo detecta).
 *   2. signingPubKey = plaintext[0:33]   ← clave pública de firma in-band
 *      message       = plaintext[33:]    ← texto del mensaje
 *   3. hash = sha256(canonical_JSON_sin_signature)
 *      secp256k1.verify(envelope.signature, hash, signingPubKey)
 *      → false ⟹ lanza 'firma inválida'
 *
 * @param content_key  Clave compartida del canal (via accessGroupChannel).
 * @param envelope     L0 Envelope recibido del transporte.
 */
export function openGroupEnvelope(content_key: Uint8Array, envelope: Envelope): string {
  // ── Capa 3: descifrar con content_key ─────────────────────────────────────
  const raw   = fromHex(envelope.ciphertext)
  const nonce = raw.slice(0, nacl.secretbox.nonceLength)
  const box   = raw.slice(nacl.secretbox.nonceLength)
  const plain = nacl.secretbox.open(box, nonce, content_key)
  if (!plain) throw new Error('Group: fallo en descifrado')

  // ── Extraer clave de firma in-band ────────────────────────────────────────
  if (plain.length <= SIGNING_PK_LEN) {
    throw new Error('firma inválida — payload malformado, falta clave de firma in-band')
  }
  const signingPubKey = plain.slice(0, SIGNING_PK_LEN)
  const msgBytes      = plain.slice(SIGNING_PK_LEN)

  // ── Capa 5: verificar firma de no repudio ─────────────────────────────────
  const hash     = sha256(enc.encode(canonicalize(envelope as Record<string, unknown>)))
  const sigBytes = fromHex(envelope.signature)
  if (!secp256k1.verify(sigBytes, hash, signingPubKey)) {
    throw new Error('firma inválida — posible impersonación o payload alterado')
  }

  return dec.decode(msgBytes)
}

// ─── Rotación de Claves — Reto 3 ─────────────────────────────────────────────

/**
 * Rota el EEE: nueva época, nuevos sk_group/pk_group, nuevo content_key.
 * Invalida todos los accesos de la época anterior.
 *
 * Reto 3:
 *   - Inclusión: el nuevo miembro ejecuta la rotación → aparece en newMembers.
 *   - Expulsión: el admin ejecuta la rotación → el expulsado no está en newMembers.
 *   - created_at > epoch_anterior.created_at → orden secuencial garantizado.
 */
export function rotateGroupChannel(
  executor: Wallet,
  currentEEE: EEE,
  newMembers: Wallet[],
): { eee: EEE; sk_group: Uint8Array; content_key: Uint8Array } {
  const groupKP = nacl.box.keyPair()
  const content_key = nacl.randomBytes(32)
  const newEpoch = currentEEE.epoch + 1
  const channel_id = currentEEE.channel_id

  const act = newMembers.map(m => buildACTEntry(groupKP.secretKey, m, content_key, channel_id))

  const partial = {
    version: 1 as const,
    channel_id,
    epoch: newEpoch,
    pk_group: toHex(groupKP.publicKey),
    act,
    chunks_hint: Math.ceil(act.length / 3) || 1,
    created_at: Date.now(),  // timestamp > época anterior → previene colisiones
    admin_address: executor.ethAddress,
  }
  const eee: EEE = { ...partial, signature: seal(partial as Record<string, unknown>, executor.ethPrivKey) }
  return { eee, sk_group: groupKP.secretKey, content_key }
}

// ─── Demo: claves hardcodeadas (Hardhat/Anvil defaults) ──────────────────────

export const DEMO_PRIVATE_KEYS = {
  A: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  B: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  C: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  D: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
}

// ─── Punto de entrada: demo en consola ───────────────────────────────────────

function runDemo() {
  const walletA = createWallet(DEMO_PRIVATE_KEYS.A, 'Wallet A')
  const walletB = createWallet(DEMO_PRIVATE_KEYS.B, 'Wallet B')
  const walletC = createWallet(DEMO_PRIVATE_KEYS.C, 'Wallet C')
  const walletD = createWallet(DEMO_PRIVATE_KEYS.D, 'Wallet D')

  // ── Escenario A: P2P ────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════')
  console.log('  ESCENARIO A: Canal P2P — Wallet A → Wallet B')
  console.log('════════════════════════════════════════════════════\n')

  const envA = createP2PEnvelope(walletA, walletB.x25519.publicKey, 'Hola Bob, esto es privado.', 0)
  console.log('Envelope (JSON):')
  console.log(JSON.stringify(envA, null, 2))

  const decryptedA = openP2PEnvelope(walletB, walletA.x25519.publicKey, envA)
  console.log(`\nWallet B descifra: "${decryptedA}"`)

  // ── Escenario B: Grupo Gateado por NFT ────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════')
  console.log('  ESCENARIO B: Canal de Grupo NFT (tokenId: WHISP-001)')
  console.log('════════════════════════════════════════════════════\n')

  const { eee, content_key } = createGroupChannel(
    walletA,
    [walletA, walletB, walletC],
    'WHISP-001',
    0,
  )

  console.log('EEE (JSON):')
  console.log(JSON.stringify(eee, null, 2))

  // Wallet B envía un mensaje
  const envB = createGroupEnvelope(walletB, content_key, eee.channel_id, 'Mensaje secreto del grupo.', 0)
  console.log('\nEnvelope de B (JSON):')
  console.log(JSON.stringify(envB, null, 2))

  // Wallet C lo descifra
  const ckC = accessGroupChannel(walletC, eee)
  console.log(`\nWallet C (autorizada) descifra: "${openGroupEnvelope(ckC!, envB)}"`)

  // Wallet D intenta acceder
  const ckD = accessGroupChannel(walletD, eee)
  console.log(`Wallet D (no autorizada): ${ckD === null ? '✗ ACCESO DENEGADO — no está en la ACT' : '✓ OK'}`)

  // Rotación (Reto 3): expulsamos a Wallet C
  console.log('\n── Rotación de época: expulsando Wallet C ──────────')
  const { eee: eee2 } = rotateGroupChannel(walletA, eee, [walletA, walletB])
  const ckC2 = accessGroupChannel(walletC, eee2)
  console.log(`Wallet C tras rotación (epoch ${eee2.epoch}): ${ckC2 === null ? '✗ ACCESO REVOCADO' : '✓ OK'}`)
}

// Ejecutar solo si se llama directamente (npx tsx src/core/crypto.ts)
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('crypto.ts')) {
  runDemo()
}
