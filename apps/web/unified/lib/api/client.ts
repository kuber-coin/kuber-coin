import type { Block, Transaction, AddressInfo, MempoolInfo, NodeInfo, Peer, ChainStats } from '../types'

const API_URL = process.env.NEXT_PUBLIC_KUBERCOIN_API_URL || 'http://localhost:8634'
const RPC_URL = process.env.NEXT_PUBLIC_KUBERCOIN_RPC_URL || 'http://localhost:8634'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(id)
  }
}

// RPC call helper
async function callRPC(method: string, params: any[] = []) {
  try {
    const data = await apiFetch<{ result: any }>(`${RPC_URL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    })
    return data.result
  } catch (error) {
    console.error(`RPC call failed: ${method}`, error)
    throw error
  }
}

// Block Explorer API
export const explorerAPI = {
  async getBlock(heightOrHash: number | string): Promise<Block> {
    if (typeof heightOrHash === 'number') {
      return apiFetch<Block>(`${API_URL}/api/block-by-height/${heightOrHash}`)
    }
    return apiFetch<Block>(`${API_URL}/api/block/${heightOrHash}`)
  },

  async getLatestBlocks(count: number = 10): Promise<Block[]> {
    const info = await apiFetch<{ height?: number }>(`${API_URL}/api/info`)
    const height: number = info.height ?? 0
    const start = Math.max(0, height - count + 1)
    const heights = Array.from({ length: height - start + 1 }, (_, i) => start + i).reverse()
    return Promise.all(heights.map(h => this.getBlock(h)))
  },

  async getTransaction(txid: string): Promise<Transaction> {
    return apiFetch<Transaction>(`${API_URL}/api/tx/${txid}`)
  },

  async getAddress(address: string): Promise<AddressInfo> {
    return apiFetch<AddressInfo>(`${API_URL}/api/address/${address}/txs`)
  },

  async getMempoolInfo(): Promise<MempoolInfo> {
    return callRPC('getmempoolinfo')
  },

  async getRawMempool(): Promise<string[]> {
    return callRPC('getrawmempool')
  },
}

// Node Status API
export const nodeAPI = {
  async getInfo(): Promise<NodeInfo> {
    return callRPC('getinfo')
  },

  async getPeerInfo(): Promise<Peer[]> {
    return callRPC('getpeerinfo')
  },

  async getChainStats(): Promise<ChainStats> {
    return callRPC('getchaintips')
  },

  async getBlockchainInfo() {
    return callRPC('getblockchaininfo')
  },

  async getNetworkInfo() {
    return callRPC('getnetworkinfo')
  },

  async getMiningInfo() {
    return callRPC('getmininginfo')
  },
}

// Wallet API
export const walletAPI = {
  async createWallet(name: string) {
    return callRPC('createwallet', [name])
  },

  async getBalance(address: string): Promise<number> {
    const data = await apiFetch<{ balance: number }>(`${API_URL}/api/balance/${address}`)
    return data.balance
  },

  async sendTransaction(tx: any) {
    return callRPC('sendrawtransaction', [tx])
  },

  async listTransactions(address: string, count: number = 10): Promise<any[]> {
    return apiFetch<any[]>(`${API_URL}/api/address/${address}/txs?limit=${count}`)
  },
}

export default {
  explorer: explorerAPI,
  node: nodeAPI,
  wallet: walletAPI,
}
