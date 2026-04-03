const PINATA_JWT    = import.meta.env.VITE_PINATA_JWT as string
const IPFS_GATEWAY  = 'https://ipfs.io/ipfs/'

/**
 * Fetch and JSON-parse an IPFS document via the public gateway.
 * Accepts both ipfs://CID and raw CID strings.
 */
export async function fetchJSON<T = unknown>(ipfsUri: string): Promise<T> {
  const cid = ipfsUri.replace(/^ipfs:\/\//, '')
  const res = await fetch(`${IPFS_GATEWAY}${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch failed ${res.status}: ${ipfsUri}`)
  return res.json() as Promise<T>
}

export async function uploadJSON(content: object, name: string): Promise<string> {
  if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT not set in .env')

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Pinata error ${res.status}: ${err}`)
  }

  const { IpfsHash } = await res.json()
  return `ipfs://${IpfsHash}` // e.g. ipfs://QmXxx...
}
