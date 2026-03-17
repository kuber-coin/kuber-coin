/**
 * Simple build script: copies src/index.mjs to dist/ as both ESM and CJS.
 * No bundler dependency required.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, 'src', 'index.mjs'), 'utf8');

mkdirSync(join(__dir, 'dist'), { recursive: true });

// ESM output — identical to source but with .js extension
writeFileSync(join(__dir, 'dist', 'index.js'), src);

// CJS output — replace export statements with module.exports
const cjs = src
    .replace(/^export class (\w+)/gm, 'class $1')
    .replace(/^export default \w+;?\s*$/gm, '')
    .replace(/^export \{ ([^}]+) \};?\s*$/gm, (_, names) => {
        const pairs = names.split(',').map(n => n.trim()).map(n => `  ${n}`).join(',\n');
        return `module.exports = {\n${pairs},\n  default: KubercoinClient\n};`;
    })
    // Remove ES module import lines (unused in CJS output)
    .replace(/^import .+;?\s*$/gm, '');

writeFileSync(join(__dir, 'dist', 'index.cjs'), `'use strict';\n\n${cjs}`);

// Minimal TypeScript declaration
const dts = `
export interface ClientOptions {
  url?: string;
  apiKey?: string;
  timeoutMs?: number;
}
export interface BlockchainInfo {
  chain: string;
  blocks: number;
  best_block_hash: string;
  difficulty: number;
  pruned: boolean;
}
export interface BlockInfo {
  hash: string;
  height: number;
  prev_hash: string;
  merkle_root: string;
  timestamp: number;
  bits: number;
  nonce: number;
  txids: string[];
}
export interface MempoolInfo {
  size: number;
  bytes: number;
}
export interface PeerInfo {
  addr: string;
  start_height: number;
  inbound: boolean;
}
export declare class KubercoinError extends Error {
  type: 'network' | 'auth' | 'rateLimit' | 'http' | 'rpc';
  code: number | null;
  constructor(type: KubercoinError['type'], message: string, code: number | null);
}
export declare class KubercoinClient {
  constructor(options?: ClientOptions);
  rpc(method: string, params?: unknown[]): Promise<unknown>;
  rest(path: string): Promise<unknown>;
  getBlockCount(): Promise<number>;
  getBestBlockHash(): Promise<string>;
  getBlockchainInfo(): Promise<BlockchainInfo>;
  getBlockHash(height: number): Promise<string>;
  getBlock(blockHash: string): Promise<BlockInfo>;
  getBlockByHeight(height: number): Promise<BlockInfo>;
  getRawTransaction(txid: string, verbose?: boolean): Promise<string | object>;
  getMempoolInfo(): Promise<MempoolInfo>;
  getRawMempool(): Promise<string[]>;
  sendRawTransaction(rawTxHex: string): Promise<string>;
  getConnectionCount(): Promise<number>;
  getPeerInfo(): Promise<PeerInfo[]>;
  health(): Promise<{ status: string }>;
  info(): Promise<object>;
  getBalance(address: string): Promise<{ total: number; spendable: number; immature: number }>;
  getAddressTxs(address: string): Promise<object[]>;
}
export default KubercoinClient;
`.trimStart();

writeFileSync(join(__dir, 'dist', 'index.d.ts'), dts);

console.log('Build complete: dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts (types)');
