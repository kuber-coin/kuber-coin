// Type definitions for KuberCoin API responses

export interface Block {
  height: number
  hash: string
  previous_hash: string
  timestamp: number
  nonce: number
  difficulty: number
  transactions: Transaction[]
  merkle_root?: string
}

export interface Transaction {
  txid: string
  version: number
  inputs: TxInput[]
  outputs: TxOutput[]
  locktime: number
  size: number
  timestamp?: number
  confirmations?: number
}

export interface TxInput {
  txid: string
  vout: number
  script_sig: string
  sequence: number
}

export interface TxOutput {
  value: number
  script_pubkey: string
  address?: string
}

export interface UTXO {
  txid: string
  vout: number
  value: number
  address: string
  confirmations: number
}

export interface AddressInfo {
  address: string
  balance: number
  received: number
  spent: number
  tx_count: number
  utxos: UTXO[]
}

export interface MempoolInfo {
  size: number
  bytes: number
  usage: number
  total_fee: number
  min_fee: number
  max_fee: number
}

export interface NodeInfo {
  version: string
  protocol_version: number
  blocks: number
  connections: number
  difficulty: number
  hashrate: number
  network: string
  uptime: number
}

export interface Peer {
  id: string
  addr: string
  version: number
  subver: string
  inbound: boolean
  startingheight: number
  synced_headers: number
  synced_blocks: number
  ping: number
}

export interface ChainStats {
  blocks: number
  bestblockhash: string
  difficulty: number
  mediantime: number
  verificationprogress: number
  chainwork: string
  size_on_disk: number
  pruned: boolean
}

export interface WalletInfo {
  address: string
  balance: number
  unconfirmed_balance: number
  txs: Transaction[]
}
