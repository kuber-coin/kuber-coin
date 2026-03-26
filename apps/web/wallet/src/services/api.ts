/**
 * API Service Layer for KuberCoin Node RPC
 * Handles all communication with the blockchain node
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_NODE_RPC_URL || 'http://localhost:8634';
// Node API keys must never be stored in NEXT_PUBLIC_* variables — they would
// be embedded in the client bundle and visible to anyone who downloads it.
// Configure the node without api_keys for unauthenticated local use, or proxy
// requests through the server-side Next.js API routes (app/api/) which read
// KUBERCOIN_WALLET_API_KEY from the server environment.
const API_KEY = '';

interface RPCRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: any[];
}

interface RPCResponse<T = any> {
  jsonrpc: string;
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Generic RPC call function
 */
async function rpcCall<T>(method: string, params: any[] = []): Promise<T> {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: RPCResponse<T> = await response.json();

    if (data.error) {
      throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
    }

    return data.result as T;
  } catch (error) {
    console.error(`RPC call failed for ${method}:`, error);
    throw error;
  }
}

// ==================== Blockchain Info ====================

export interface BlockchainInfo {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  initialblockdownload: boolean;
  chainwork: string;
  size_on_disk: number;
  pruned: boolean;
  warnings: string;
}

export async function getBlockchainInfo(): Promise<BlockchainInfo> {
  return rpcCall<BlockchainInfo>('getblockchaininfo');
}

// ==================== Block Data ====================

export interface Block {
  hash: string;
  confirmations: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  nTx: number;
  previousblockhash?: string;
  nextblockhash?: string;
  strippedsize: number;
  size: number;
  weight: number;
  tx: string[];
}

export async function getBlock(hashOrHeight: string | number, verbosity: number = 1): Promise<Block> {
  return rpcCall<Block>('getblock', [hashOrHeight, verbosity]);
}

export async function getBlockHash(height: number): Promise<string> {
  return rpcCall<string>('getblockhash', [height]);
}

export async function getBlockCount(): Promise<number> {
  return rpcCall<number>('getblockcount');
}

export async function getBestBlockHash(): Promise<string> {
  return rpcCall<string>('getbestblockhash');
}

// ==================== Transaction Data ====================

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  sequence: number;
  txinwitness?: string[];
}

export interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    address?: string;
  };
}

export interface Transaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

export async function getRawTransaction(txid: string, verbose: boolean = true): Promise<Transaction | string> {
  return rpcCall<Transaction | string>('getrawtransaction', [txid, verbose]);
}

export async function sendRawTransaction(hexstring: string): Promise<string> {
  return rpcCall<string>('sendrawtransaction', [hexstring]);
}

export async function decodeRawTransaction(hexstring: string): Promise<Transaction> {
  return rpcCall<Transaction>('decoderawtransaction', [hexstring]);
}

// ==================== Mempool Data ====================

export interface MempoolInfo {
  loaded: boolean;
  size: number;
  bytes: number;
  usage: number;
  maxmempool: number;
  mempoolminfee: number;
  minrelaytxfee: number;
  unbroadcastcount: number;
}

export async function getMempoolInfo(): Promise<MempoolInfo> {
  return rpcCall<MempoolInfo>('getmempoolinfo');
}

export async function getRawMempool(verbose: boolean = false): Promise<string[] | Record<string, any>> {
  return rpcCall<string[] | Record<string, any>>('getrawmempool', [verbose]);
}

export interface MempoolEntry {
  vsize: number;
  weight: number;
  fee: number;
  modifiedfee: number;
  time: number;
  height: number;
  descendantcount: number;
  descendantsize: number;
  descendantfees: number;
  ancestorcount: number;
  ancestorsize: number;
  ancestorfees: number;
  wtxid: string;
  fees: {
    base: number;
    modified: number;
    ancestor: number;
    descendant: number;
  };
  depends: string[];
  spentby: string[];
  'bip125-replaceable': boolean;
  unbroadcast: boolean;
}

export async function getMempoolEntry(txid: string): Promise<MempoolEntry> {
  return rpcCall<MempoolEntry>('getmempoolentry', [txid]);
}

// ==================== Network Data ====================

export interface PeerInfo {
  id: number;
  addr: string;
  addrbind: string;
  addrlocal?: string;
  network: string;
  services: string;
  servicesnames: string[];
  relaytxes: boolean;
  lastsend: number;
  lastrecv: number;
  last_transaction: number;
  last_block: number;
  bytessent: number;
  bytesrecv: number;
  conntime: number;
  timeoffset: number;
  pingtime: number;
  minping: number;
  version: number;
  subver: string;
  inbound: boolean;
  addnode: boolean;
  startingheight: number;
  synced_headers: number;
  synced_blocks: number;
  inflight: number[];
  whitelisted: boolean;
  permissions: string[];
  minfeefilter: number;
  bytessent_per_msg: Record<string, number>;
  bytesrecv_per_msg: Record<string, number>;
  connection_type: string;
}

export async function getPeerInfo(): Promise<PeerInfo[]> {
  return rpcCall<PeerInfo[]>('getpeerinfo');
}

export interface NetworkInfo {
  version: number;
  subversion: string;
  protocolversion: number;
  localservices: string;
  localservicesnames: string[];
  localrelay: boolean;
  timeoffset: number;
  networkactive: boolean;
  connections: number;
  connections_in: number;
  connections_out: number;
  networks: Array<{
    name: string;
    limited: boolean;
    reachable: boolean;
    proxy: string;
    proxy_randomize_credentials: boolean;
  }>;
  relayfee: number;
  incrementalfee: number;
  localaddresses: Array<{
    address: string;
    port: number;
    score: number;
  }>;
  warnings: string;
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  return rpcCall<NetworkInfo>('getnetworkinfo');
}

export async function getConnectionCount(): Promise<number> {
  return rpcCall<number>('getconnectioncount');
}

// ==================== UTXO / Address Data ====================

export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  label?: string;
  scriptPubKey: string;
  amount: number;
  confirmations: number;
  spendable: boolean;
  solvable: boolean;
  safe: boolean;
}

export async function listUnspent(
  minconf: number = 1,
  maxconf: number = 9999999,
  addresses?: string[]
): Promise<UTXO[]> {
  const params: any[] = [minconf, maxconf];
  if (addresses && addresses.length > 0) {
    params.push(addresses);
  }
  return rpcCall<UTXO[]>('listunspent', params);
}

// ==================== Mining Data ====================

export interface MiningInfo {
  blocks: number;
  currentblockweight?: number;
  currentblocktx?: number;
  difficulty: number;
  networkhashps: number;
  pooledtx: number;
  chain: string;
  warnings: string;
}

export async function getMiningInfo(): Promise<MiningInfo> {
  return rpcCall<MiningInfo>('getmininginfo');
}

export async function getNetworkHashPS(nblocks: number = 120, height: number = -1): Promise<number> {
  return rpcCall<number>('getnetworkhashps', [nblocks, height]);
}

// ==================== Utility Functions ====================

export async function estimateSmartFee(confTarget: number = 6): Promise<{
  feerate?: number;
  errors?: string[];
  blocks: number;
}> {
  return rpcCall('estimatesmartfee', [confTarget]);
}

export async function validateAddress(address: string): Promise<{
  isvalid: boolean;
  address?: string;
  scriptPubKey?: string;
  isscript?: boolean;
  iswitness?: boolean;
}> {
  return rpcCall('validateaddress', [address]);
}

export interface ChainTip {
  height: number;
  hash: string;
  branchlen: number;
  status: string;
}

export async function getChainTips(): Promise<ChainTip[]> {
  return rpcCall<ChainTip[]>('getchaintips');
}

// ==================== Wallet Transaction Listing ====================

export interface WalletTransaction {
  address?: string;
  category?: string;
  amount: number;
  fee?: number;
  confirmations: number;
  txid: string;
  time?: number;
  timereceived?: number;
  vout?: number;
}

export async function listTransactions(
  label: string = '*',
  count: number = 50,
  skip: number = 0,
  includeWatchOnly: boolean = true
): Promise<WalletTransaction[]> {
  return rpcCall<WalletTransaction[]>('listtransactions', [label, count, skip, includeWatchOnly]);
}

// ==================== Health & Metrics ====================

export async function getUptime(): Promise<number> {
  return rpcCall<number>('uptime');
}

export async function getMemoryInfo(mode: 'stats' | 'mallocinfo' = 'stats'): Promise<any> {
  return rpcCall('getmemoryinfo', [mode]);
}

// ==================== Error Handling Utilities ====================

export class RPCError extends Error {
  constructor(
    message: string,
    public code?: number,
    public method?: string
  ) {
    super(message);
    this.name = 'RPCError';
  }
}

export function isRPCError(error: any): error is RPCError {
  return error instanceof RPCError;
}

// ==================== Wallet Operations ====================

export interface CreateRawTransactionInput {
  txid: string;
  vout: number;
  sequence?: number;
}

export async function getNewAddress(label: string = ''): Promise<string> {
  return rpcCall<string>('getnewaddress', [label]);
}

export async function importPrivKey(privkey: string, label: string = '', rescan: boolean = false): Promise<void> {
  return rpcCall<void>('importprivkey', [privkey, label, rescan]);
}

export async function createRawTransaction(
  inputs: CreateRawTransactionInput[],
  outputs: Record<string, number>
): Promise<string> {
  return rpcCall<string>('createrawtransaction', [inputs, outputs]);
}

export interface SignedTransaction {
  hex: string;
  complete: boolean;
}

export async function signRawTransactionWithWallet(hexstring: string): Promise<SignedTransaction> {
  return rpcCall<SignedTransaction>('signrawtransactionwithwallet', [hexstring]);
}

export async function getWalletInfo(): Promise<any> {
  return rpcCall<any>('getwalletinfo');
}

export async function listAddressGroupings(): Promise<any> {
  return rpcCall<any>('listaddressgroupings');
}

export async function dumpPrivKey(address: string): Promise<string> {
  return rpcCall<string>('dumpprivkey', [address]);
}

// ==================== Export All ====================

export const api = {
  // Blockchain
  getBlockchainInfo,
  getBlock,
  getBlockHash,
  getBlockCount,
  getBestBlockHash,
  
  // Transactions
  getRawTransaction,
  sendRawTransaction,
  decodeRawTransaction,
  createRawTransaction,
  signRawTransactionWithWallet,
  
  // Mempool
  getMempoolInfo,
  getRawMempool,
  getMempoolEntry,
  
  // Network
  getPeerInfo,
  getNetworkInfo,
  getConnectionCount,
  
  // UTXO
  listUnspent,
  
  // Mining
  getMiningInfo,
  getNetworkHashPS,
  
  // Wallet
  getNewAddress,
  importPrivKey,
  getWalletInfo,
  listAddressGroupings,
  dumpPrivKey,
  listTransactions,
  
  // Utility
  estimateSmartFee,
  validateAddress,
  getChainTips,
  getUptime,
  getMemoryInfo,
  
  // Generic RPC
  rpcCall,
};

export default api;
