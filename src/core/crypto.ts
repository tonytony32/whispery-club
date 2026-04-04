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
  /**
   * Clave de firma secp256k1 derivada — NO es la clave privada de Ethereum.
   * Derivación: HKDF(sha256(siweSignature), "whispery/signing/v1")
   * Usada para sellar cada L0 Envelope (seal). Nunca expuesta directamente.
   */
  ethPrivKey: Uint8Array
  ethAddress: string          // checksummed via viem
  x25519: nacl.BoxKeyPair     // X25519 keypair derivado desde sha256(siweSignature)
  siweSignature: Uint8Array   // 65 bytes: r(32) || s(32) || v(1) — prueba de identidad in-band
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
  /**
   * Modo grupo: 32 bytes aleatorios (ephemeral key) — el remitente real viaja
   *             dentro del ciphertext cifrado con content_key.
   * Modo P2P:   clave X25519 real del emisor — necesaria para el DH en descifrado.
   */
  sender_pk: string
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

/**
 * Firma el mensaje SIWE y devuelve la firma completa de 65 bytes:
 *   r(32) || s(32) || v(1)    donde v = recovery_bit + 27 (convención Ethereum)
 *
 * Formato idéntico al que devuelve MetaMask/wagmi. Determinista via RFC 6979.
 */
function siweSign(privKey: Uint8Array, address: string): Uint8Array {
  const msg    = enc.encode(siweMessage(address))
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`)
  const hash   = keccak_256(concatBytes(prefix, msg))
  const sig    = secp256k1.sign(hash, privKey)
  return concatBytes(sig.toCompactRawBytes(), new Uint8Array([sig.recovery + 27]))
}

/**
 * Crea una wallet desde una clave privada Ethereum hex (uso en tests y demo).
 *
 * Derivación idéntica a keysFromSig, pero partiendo de la clave privada en lugar
 * de la firma MetaMask. La clave privada Ethereum solo se usa aquí internamente
 * para firmar el SIWE — no se almacena en la Wallet resultante.
 *
 *   siweSignature = secp256k1.sign(hash_SIWE, ethPrivKey)  [65 bytes]
 *   seed          = sha256(siweSignature)
 *   x25519        = nacl.box.keyPair(seed)
 *   ethPrivKey    = HKDF(seed, "whispery/signing/v1")       ← clave derivada, no ETH key
 */
export function createWallet(privKeyHex: string, label: string): Wallet {
  const rawPrivKey      = fromHex(privKeyHex)
  const address         = ethAddress(rawPrivKey)
  const siweSignature   = siweSign(rawPrivKey, address)    // 65 bytes
  const seed            = sha256(siweSignature)
  const signingKey      = derive(seed, 'whispery/signing/v1')
  return {
    label,
    ethPrivKey:     signingKey,
    ethAddress:     address,
    x25519:         nacl.box.keyPair.fromSecretKey(seed),
    siweSignature,
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
  const siweSignature = fromHex(signatureHex.replace(/^0x/, ''))  // 65 bytes
  const seed          = sha256(siweSignature)
  const x25519        = nacl.box.keyPair.fromSecretKey(seed)
  const signingKey    = derive(seed, 'whispery/signing/v1')

  return {
    label:          ethAddress.slice(0, 10) + '…',
    ethPrivKey:     signingKey,
    ethAddress:     getAddress(ethAddress),
    x25519,
    siweSignature,
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

// ── Layout del plaintext interno del grupo (cabecera fija: 150 bytes) ────────
//
//   Offset  Longitud  Campo
//   ──────  ────────  ─────
//        0        32  real_sender_pk    — clave X25519 real del emisor
//       32        33  signing_pub_key   — clave de firma secp256k1 (comprimida)
//       65        20  eth_address       — dirección Ethereum (20 bytes crudos)
//       85        65  siwe_signature    — r(32) || s(32) || v(1)
//      150      var   message_utf8      — texto del mensaje
//
// La cabecera viaja cifrada con content_key — invisible para la capa de transporte.
// El campo `sender_pk` del sobre exterior son 32 bytes aleatorios (ephemeral key)
// para no revelar la identidad del emisor a nodos Waku o a observadores.

const REAL_PK_LEN    = 32
const SIGNING_PK_LEN = 33
const ETH_ADDR_LEN   = 20
const SIWE_SIG_LEN   = 65
const INNER_HEADER   = REAL_PK_LEN + SIGNING_PK_LEN + ETH_ADDR_LEN + SIWE_SIG_LEN  // 150

const OFF_REAL_PK    = 0
const OFF_SIGNING_PK = OFF_REAL_PK    + REAL_PK_LEN     // 32
const OFF_ETH_ADDR   = OFF_SIGNING_PK + SIGNING_PK_LEN  // 65
const OFF_SIWE_SIG   = OFF_ETH_ADDR   + ETH_ADDR_LEN    // 85
const OFF_MESSAGE    = OFF_SIWE_SIG   + SIWE_SIG_LEN    // 150

/**
 * Validación 1 — SIWE: comprueba que la firma SIWE fue producida por el dueño
 * de `declaredAddress`. Usa ecrecover sobre el hash del mensaje SIWE canónico.
 * Lanza 'identidad falsa' si la dirección recuperada no coincide.
 */
function verifySiweSignature(sig: Uint8Array, declaredAddress: string): void {
  const msg    = enc.encode(siweMessage(declaredAddress))
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`)
  const hash   = keccak_256(concatBytes(prefix, msg))

  // sig = r(32) || s(32) || v(1), v = 27 o 28 (convención Ethereum)
  const recovery  = sig[64] - 27
  const recovered = secp256k1.Signature
    .fromCompact(sig.slice(0, 64))
    .addRecoveryBit(recovery)
    .recoverPublicKey(hash)

  const recoveredAddress = getAddress(
    '0x' + bytesToHex(keccak_256(recovered.toRawBytes(false).slice(1)).slice(-20)),
  )
  if (recoveredAddress !== declaredAddress) {
    throw new Error('identidad falsa — la firma SIWE no corresponde a la dirección declarada')
  }
}

/**
 * Validación 2 — Derivación: rederiva las claves desde la siweSignature y
 * comprueba que coinciden con las claves declaradas en el plaintext.
 * Garantiza que X25519 y signing key son hijas legítimas de esa firma SIWE.
 */
function verifyKeyDerivation(
  siweSignature: Uint8Array,
  declaredX25519Pk: Uint8Array,
  declaredSigningPk: Uint8Array,
): void {
  const seed            = sha256(siweSignature)
  const expectedX25519  = nacl.box.keyPair.fromSecretKey(seed).publicKey
  const expectedSigning = secp256k1.getPublicKey(derive(seed, 'whispery/signing/v1'), true)

  if (bytesToHex(expectedX25519) !== bytesToHex(declaredX25519Pk)) {
    throw new Error('falsificación de llaves detectada — X25519 no coincide con derivación SIWE')
  }
  if (bytesToHex(expectedSigning) !== bytesToHex(declaredSigningPk)) {
    throw new Error('falsificación de llaves detectada — signing key no coincide con derivación SIWE')
  }
}

/**
 * Un miembro autorizado cifra un mensaje para el canal.
 *
 * Privacy — Zero Metadata:
 *   El campo `sender_pk` del sobre exterior es un ephemeral key aleatorio.
 *   La identidad real del emisor viaja cifrada dentro del ciphertext.
 *
 * Anti-Spoofing — prueba SIWE in-band:
 *   El plaintext incluye la firma SIWE original del emisor (65 bytes).
 *   El receptor puede verificar (1) que la firma SIWE fue hecha por ethAddress,
 *   (2) que las claves declaradas se derivan correctamente de esa firma,
 *   (3) que la firma L0 es válida para esas claves.
 *
 *   plaintext = realPk(32) || signingPk(33) || ethAddr(20) || siweSig(65) || msg
 */
export function createGroupEnvelope(
  sender: Wallet,
  content_key: Uint8Array,
  channel_id: string,
  message: string,
  epoch = 0,
): Envelope {
  const signingPubKey = secp256k1.getPublicKey(sender.ethPrivKey, true)  // 33 bytes
  const ethAddrBytes  = fromHex(sender.ethAddress)                        // 20 bytes

  const plaintext = concatBytes(
    sender.x25519.publicKey,  // 32 — real X25519 sender identity
    signingPubKey,            // 33 — secp256k1 signing public key
    ethAddrBytes,             // 20 — Ethereum address
    sender.siweSignature,     // 65 — SIWE proof: r || s || v
    enc.encode(message),      // var — message text
  )

  const nonce      = nacl.randomBytes(nacl.secretbox.nonceLength)
  const box        = nacl.secretbox(plaintext, nonce, content_key)
  const ciphertext = toHex(concatBytes(nonce, box))

  const partial = {
    version:   1 as const,
    channel_id,
    epoch,
    sender_pk: toHex(nacl.randomBytes(32)),  // ephemeral key — no revela identidad
    ciphertext,
    mac_hint:  toHex(nonce.slice(0, 4)),
    timestamp: Date.now(),
  }
  return { ...partial, signature: seal(partial, sender.ethPrivKey) }
}

/**
 * Descifra un envelope de grupo y aplica la cadena de validación de identidad.
 *
 * Flujo de validación:
 *   1. secretbox.open  → Poly1305 garantiza integridad del ciphertext
 *   2. verifySiweSignature  → ecrecover prueba que ethAddress firmó el SIWE
 *   3. verifyKeyDerivation  → rederivación prueba que X25519 y signing key son
 *                             legítimas hijas de esa firma SIWE
 *   4. secp256k1.verify     → la firma L0 cubre todos los campos del sobre
 *
 * Cualquier fallo lanza un error explícito y descarta el mensaje.
 */
export function openGroupEnvelope(
  content_key: Uint8Array,
  envelope: Envelope,
): { text: string; realSenderPk: Uint8Array } {
  // ── Capa 3: descifrar ─────────────────────────────────────────────────────
  const raw   = fromHex(envelope.ciphertext)
  const nonce = raw.slice(0, nacl.secretbox.nonceLength)
  const box   = raw.slice(nacl.secretbox.nonceLength)
  const plain = nacl.secretbox.open(box, nonce, content_key)
  if (!plain) throw new Error('Group: fallo en descifrado')

  if (plain.length <= INNER_HEADER) {
    throw new Error('firma inválida — payload malformado, cabecera de identidad incompleta')
  }

  // ── Extraer cabecera de identidad ─────────────────────────────────────────
  const realSenderPk  = plain.slice(OFF_REAL_PK,    OFF_SIGNING_PK)
  const signingPubKey = plain.slice(OFF_SIGNING_PK, OFF_ETH_ADDR)
  const ethAddrBytes  = plain.slice(OFF_ETH_ADDR,   OFF_SIWE_SIG)
  const siweSignature = plain.slice(OFF_SIWE_SIG,   OFF_MESSAGE)
  const msgBytes      = plain.slice(OFF_MESSAGE)

  const declaredAddress = getAddress('0x' + toHex(ethAddrBytes))

  // ── Validación 1: SIWE — ethAddress firmó el mensaje SIWE canónico ────────
  verifySiweSignature(siweSignature, declaredAddress)

  // ── Validación 2: Derivación — las claves son hijas legítimas del SIWE ────
  verifyKeyDerivation(siweSignature, realSenderPk, signingPubKey)

  // ── Validación 3: Firma L0 — no repudio sobre todos los campos del sobre ──
  const hash     = sha256(enc.encode(canonicalize(envelope as Record<string, unknown>)))
  const sigBytes = fromHex(envelope.signature)
  if (!secp256k1.verify(sigBytes, hash, signingPubKey)) {
    throw new Error('firma inválida — posible impersonación o payload alterado')
  }

  return { text: dec.decode(msgBytes), realSenderPk }
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
  console.log(`\nWallet C (autorizada) descifra: "${openGroupEnvelope(ckC!, envB).text}"`)

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
