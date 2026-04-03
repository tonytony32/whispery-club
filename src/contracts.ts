import { keccak256, toBytes } from 'viem'

// Deployed on Sepolia — see docs/contracts_deployed.md
export const NFT_ADDRESS  = '0x59804B5A7b61E469F148Dbd86eE95EEC3F6dc06a' as const
export const BACK_ADDRESS = '0x227A6991c3702C227A1ea4beB867DF522183f5CC' as const

// On-chain key used to store/retrieve the EEE pointer in WhisperyBackpack.
// keccak256("whispery/nft/1") — matches the tokenId 1 minted in Deploy.s.sol.
export const CHANNEL_ID = keccak256(toBytes('whispery/nft/1'))

export const NFT_ABI = [
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '',        type: 'bool'    }],
  },
  {
    name: 'tokenIdOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address'  }],
    outputs: [{ name: '',        type: 'uint256'  }],
  },
] as const

export const BACK_ABI = [
  {
    name: 'getEEE',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'channelId', type: 'bytes32' }],
    outputs: [
      { name: 'eeePointer', type: 'string'  },
      { name: 'epoch',      type: 'uint256' },
    ],
  },
  {
    name: 'setChannel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'channelId',    type: 'bytes32' },
      { name: 'eeePointer',   type: 'string'  },
      { name: 'swarmOverlay', type: 'bytes32' },
      { name: 'epoch',        type: 'uint256' },
    ],
    outputs: [],
  },
] as const

// tokenId → member name (matches mint order in Deploy.s.sol)
export const TOKEN_NAMES: Record<number, string> = {
  1: 'Alice',
  2: 'Bob',
  3: 'Charlie',
}
