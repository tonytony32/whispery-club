# Whispery · Capa de Transporte (Level 1)

Cómo viajan los mensajes cifrados entre miembros usando Waku.

---

## El problema

En Level 0 tenemos los contratos: el NFT prueba que eres miembro, el Backpack guarda el puntero al EEE en IPFS. Pero los mensajes en sí no viven on-chain — sería demasiado caro y lento. Necesitamos una red que:

- No tenga un servidor central que pueda caerse o censurar
- Permita enviar mensajes sin revelar quién habla con quién
- Sea eficiente — no obligue a cada nodo a procesar todos los mensajes del mundo

Esa red es **Waku**.

---

## Waku: el sistema postal descentralizado

Imagina un sistema postal donde no existe una oficina central. Los carteros son miles de nodos distribuidos por internet, y los mensajes no van a una dirección exacta sino a un **barrio** (content topic).

Tú te suscribes al barrio de tu clave pública. Cuando alguien te quiere enviar un mensaje, lo deposita en tu barrio. Tú recibes todo lo que llega a ese barrio — incluyendo mensajes para otros vecinos — y decides qué abrir.

```
Alice                    Waku Network                    Bob
  │                                                       │
  │── publica en barrio de Bob ──→ /whispery/1/0xab/proto │
  │                                       │               │
  │                                       └──────────────→│
  │                                                       │ recibe, filtra, descifra
```

### Content topics y barrios

El barrio se calcula a partir de los **primeros 2 bytes** de la clave pública X25519 del destinatario:

```
/whispery/1/neighbor-0x{pubKey[0:2]}/proto
```

Con 2 bytes hay 65.536 barrios posibles. Dos nodos acaban en el mismo barrio cuando sus claves comparten el mismo prefijo — probabilidad ~1/65.536. Es suficiente para que el tráfico de cada barrio sea manejable sin revelar la identidad exacta del destinatario.

---

## El sobre: Envelope

Cada mensaje que viaja por Waku tiene exactamente dos campos, definidos en `src/transport/proto/envelope.proto`:

```proto
message Envelope {
  bytes mac_hint = 1;  // 8 bytes — filtro rápido
  bytes data     = 2;  // payload cifrado
}
```

Analogía: es el sobre físico. El sobre tiene escrito algo en el exterior que te permite decidir si abrirlo o tirarlo sin leer el contenido.

---

## mac_hint: el nombre en el exterior del sobre

Cuando recibes correo físico en un edificio de apartamentos, antes de subir al piso 7 miras si el nombre en el sobre coincide. Si no, lo devuelves sin abrir.

El `mac_hint` hace lo mismo:

```
mac_hint = HMAC-SHA256(pubKey, "SWARM_L1_HINT")[0:8]
```

Es un valor de 8 bytes derivado de tu clave pública. Cuando llega un mensaje a tu barrio:

1. Compara el `mac_hint` del mensaje con el tuyo
2. Si no coincide → descarta (log "Ignored by hint") — sin abrir el sobre
3. Si coincide → intenta descifrar

En un barrio con 65.536 posibles vecinos, el hint filtra ~99,99% de los mensajes antes de gastar CPU en criptografía. El hint **no es secreto** y no autentica — solo es una optimización de rendimiento.

---

## ECIES: el candado en el sobre

El contenido del sobre (`data`) está cifrado con **ECIES sobre X25519** — el mismo mecanismo que usa el resto del stack Whispery (nacl.box).

Funciona así:

1. El emisor genera un **keypair efímero** desechable (solo para este mensaje)
2. Hace un acuerdo de claves Diffie-Hellman: `secreto = DH(clave_efímera, pubKey_destinatario)`
3. Cifra el mensaje con ese secreto compartido
4. Envía: `clave_efímera_pública || nonce || ciphertext`

El destinatario invierte el proceso: `secreto = DH(mi_clave_privada, clave_efímera_pública)` → descifra.

```
data = ephemeralPub(32) | nonce(24) | box_output(n+16)
```

Analogía: es un candado de combinación que el emisor fabrica en el momento, calibrado específicamente para la cerradura del destinatario, y luego tira la llave. Solo el destinatario puede abrirlo.

El emisor es anónimo a nivel de wire — no hay firma del emisor en el sobre.

---

## Identidad: SIWE en lugar de clave privada

Para participar en el messenger, cada usuario necesita un keypair X25519 propio. El problema: no podemos pedirle a MetaMask la clave privada de Ethereum.

La solución es el patrón **SIWE** (Sign-In With Ethereum):

1. Construimos un mensaje determinista (siempre el mismo para la misma wallet):
   ```
   whispery.club wants you to sign in with your Ethereum account:
   0x50b8...
   ...
   Nonce: whispery-v0-deterministic
   Statement: Derive my Whispery messaging keypair.
   ```
2. MetaMask firma el mensaje con la clave privada de Ethereum (EIP-191)
3. La firma es determinista — RFC6979 garantiza que la misma clave + mensaje siempre produce la misma firma
4. `seed = sha256(firma)` → `keypair = X25519(seed)`

Resultado: el keypair X25519 es único por wallet, reproducible en cualquier momento, y nunca exponemos la clave privada de Ethereum.

```
MetaMask  ──sign(SIWE)──→  firma(65 bytes)
                              │
                          sha256(firma)
                              │
                          nacl.box.keyPair(seed)  →  X25519 keypair
```

---

## El flujo completo

```
Usuario pulsa "Connect to Waku"
  │
  ├─ MetaMask: sign(SIWE) → firma
  ├─ sha256(firma) → seed → X25519 keypair
  │
  ├─ createLightNode({ defaultBootstrap: true })
  ├─ node.waitForPeers([LightPush, Filter])
  │
  ├─ new L1Messenger(node, secretKey)
  └─ messenger.subscribe()  →  escucha /whispery/1/neighbor-0x{myPrefix}/proto

Usuario envía "hola" a Bob
  │
  ├─ topic    = /whispery/1/neighbor-0x{bobPrefix}/proto
  ├─ hint     = HMAC-SHA256(bobPubKey, "SWARM_L1_HINT")[0:8]
  ├─ data     = eciesEncrypt(bobPubKey, "hola")
  ├─ payload  = encode({ macHint: hint, data })
  └─ node.lightPush.send(encoder, { payload })

Bob recibe un mensaje en su barrio
  │
  ├─ decode(payload) → { macHint, data }
  ├─ macHint == myHint?  →  No  →  "Ignored by hint"
  │                      →  Sí  →  eciesDecrypt(mySecretKey, data)
  └─ emit 'message' event  →  UI
```

---

## Estructura de archivos

```
src/transport/
  proto/
    envelope.proto    schema protobuf canónico
    envelope.ts       codec manual (sin build step)
  crypto/
    hints.ts          mac_hint: HMAC-SHA256(pubKey, domain)[0:8]
    ecies.ts          encrypt/decrypt: X25519 + XSalsa20-Poly1305
  messenger.ts        L1Messenger: publish + subscribe + hint filter
  node.ts             createWakuNode: lifecycle, defaultBootstrap, onStatus
  useMessenger.ts     React hook: SIWE → X25519 → Waku
  __tests__/
    hints.test.ts
    ecies.test.ts
    envelope.test.ts
    messenger.test.ts
```

---

## Lo que no está (todavía)

- **Key registry**: para que Alice conozca la X25519 pubkey de Bob necesita que Bob la haya publicado en algún sitio (on-chain, IPFS, o intercambio manual). Actualmente la demo usa claves hardcodeadas de Anvil como sustituto.
- **Store protocol**: los mensajes enviados cuando estás offline se pierden. Waku tiene un protocolo Store para recuperar mensajes históricos.
- **Firma del emisor**: los mensajes actuales son anónimos. Se podría añadir una firma secp256k1 del emisor dentro del payload cifrado para autenticación.
- **Rotación de claves**: si el usuario borra MetaMask y reinstala, la firma SIWE será distinta y tendrá un keypair nuevo.
