const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string

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
