/**
 * Uploads WhisperyNFT metadata for Alice, Bob, and Charlie to IPFS via Pinata.
 *
 * Usage:
 *   npx tsx scripts/uploadMetadata.ts
 *
 * Requires VITE_PINATA_JWT in .env
 * Reads nft-cannes-image.jpg from the same directory.
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const PINATA_JWT = process.env.VITE_PINATA_JWT
if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT not set in .env')

// ── Upload image file ─────────────────────────────────────────────────────────

async function pinFile(filePath: string, name: string): Promise<string> {
  const fileBytes = readFileSync(filePath)
  const formData = new FormData()
  formData.append('file', new Blob([fileBytes], { type: 'image/jpeg' }), name)
  formData.append('pinataMetadata', JSON.stringify({ name }))

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  })
  if (!res.ok) throw new Error(`Pinata file upload ${res.status}: ${await res.text()}`)
  const { IpfsHash } = await res.json() as { IpfsHash: string }
  return `ipfs://${IpfsHash}`
}

// ── Upload metadata JSON ──────────────────────────────────────────────────────

async function pinJSON(content: object, name: string): Promise<string> {
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({ pinataContent: content, pinataMetadata: { name } }),
  })
  if (!res.ok) throw new Error(`Pinata JSON upload ${res.status}: ${await res.text()}`)
  const { IpfsHash } = await res.json() as { IpfsHash: string }
  return `ipfs://${IpfsHash}`
}

// ── Main ──────────────────────────────────────────────────────────────────────

const members: [number, string][] = [
  [1, 'Alice'],
  [2, 'Bob'],
  [3, 'Charlie'],
]

console.log('1/2  Uploading image to IPFS…')
const imageUri = await pinFile(join(__dir, 'nft-cannes-image.jpg'), 'whispery-nft-image')
console.log(`     image → ${imageUri}\n`)

console.log('2/2  Uploading metadata JSONs…')
const uris: string[] = []
for (const [tokenId, name] of members) {
  const metadata = {
    name: `${name} — Whispery Group Alpha`,
    description: `Membership token for Whispery Group Alpha. Holding this token proves ${name} is an active member and grants access to the encrypted group channel.`,
    image: imageUri,
    attributes: [
      { trait_type: 'Group',  value: 'Whispery Group Alpha' },
      { trait_type: 'Member', value: name },
      { trait_type: 'Level',  value: '0' },
    ],
  }
  const uri = await pinJSON(metadata, `whispery-nft-${tokenId}-${name.toLowerCase()}`)
  uris.push(uri)
  console.log(`     tokenId ${tokenId} (${name}) → ${uri}`)
}

console.log('\n── Result ───────────────────────────────────────────────')
console.log('Add to contracts/.env:\n')
members.forEach(([id], i) => {
  const cid = uris[i].replace('ipfs://', '')
  console.log(`TOKEN_URI_${id}=${cid}`)
})
