/**
 * @kubercoin/client — Official JavaScript client for the KuberCoin node API.
 *
 * Supports both JSON-RPC 2.0 (via POST /) and the REST API (via /api/*).
 * Works in Node.js ≥ 18 and modern browsers with native fetch.
 *
 * @example
 * ```js
 * import { KubercoinClient } from '@kubercoin/client';
 * const client = new KubercoinClient({ url: 'http://localhost:8634', apiKey: 'mykey' });
 * const height = await client.getBlockCount();
 * ```
 */

// ── Types (JSDoc only — no TypeScript runtime deps) ───────────────────────────

/**
 * @typedef {Object} ClientOptions
 * @property {string} [url='http://localhost:8634'] - Base URL of the KuberCoin node RPC endpoint.
 * @property {string} [apiKey] - Bearer API key (set via KUBERCOIN_API_KEYS on the node).
 * @property {number} [timeoutMs=30000] - Request timeout in milliseconds.
 */

/**
 * @typedef {Object} BlockchainInfo
 * @property {string} chain
 * @property {number} blocks
 * @property {string} best_block_hash
 * @property {number} difficulty
 * @property {boolean} pruned
 */

/**
 * @typedef {Object} BlockInfo
 * @property {string} hash
 * @property {number} height
 * @property {string} prev_hash
 * @property {string} merkle_root
 * @property {number} timestamp
 * @property {number} bits
 * @property {number} nonce
 * @property {string[]} txids
 */

/**
 * @typedef {Object} MempoolInfo
 * @property {number} size
 * @property {number} bytes
 */

/**
 * @typedef {Object} PeerInfo
 * @property {string} addr
 * @property {number} start_height
 * @property {boolean} inbound
 */

// ── Client ────────────────────────────────────────────────────────────────────

export class KubercoinClient {
    /**
     * @param {ClientOptions} [options]
     */
    constructor(options = {}) {
        this._url = (options.url ?? 'http://localhost:8634').replace(/\/$/, '');
        this._apiKey = options.apiKey ?? null;
        this._timeoutMs = options.timeoutMs ?? 30_000;
        this._nextId = 1;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (this._apiKey) {
            h['Authorization'] = `Bearer ${this._apiKey}`;
        }
        return h;
    }

    /**
     * Make a raw JSON-RPC call.
     * @param {string} method
     * @param {unknown[]} [params=[]]
     * @returns {Promise<unknown>}
     */
    async rpc(method, params = []) {
        const id = this._nextId++;
        const body = JSON.stringify({ jsonrpc: '2.0', method, params, id });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);

        let response;
        try {
            response = await fetch(`${this._url}/`, {
                method: 'POST',
                headers: this._authHeaders(),
                body,
                signal: controller.signal,
            });
        } catch (err) {
            throw new KubercoinError('network', `Request failed: ${err.message}`, null);
        } finally {
            clearTimeout(timer);
        }

        if (response.status === 401) {
            throw new KubercoinError('auth', 'Unauthorized — check your apiKey', 401);
        }
        if (response.status === 429) {
            throw new KubercoinError('rateLimit', 'Rate limit exceeded', 429);
        }
        if (!response.ok) {
            throw new KubercoinError('http', `HTTP ${response.status}`, response.status);
        }

        const json = await response.json();
        if (json.error) {
            throw new KubercoinError('rpc', json.error.message ?? JSON.stringify(json.error), json.error.code);
        }
        return json.result;
    }

    /**
     * Make a raw REST GET call.
     * @param {string} path - Path relative to /api (e.g. '/health').
     * @returns {Promise<unknown>}
     */
    async rest(path) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);

        let response;
        try {
            response = await fetch(`${this._url}/api${path}`, {
                method: 'GET',
                headers: this._authHeaders(),
                signal: controller.signal,
            });
        } catch (err) {
            throw new KubercoinError('network', `Request failed: ${err.message}`, null);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new KubercoinError('http', `HTTP ${response.status}`, response.status);
        }
        return response.json();
    }

    // ── Blockchain methods ────────────────────────────────────────────────────

    /**
     * Returns the number of blocks in the longest chain.
     * @returns {Promise<number>}
     */
    async getBlockCount() {
        return /** @type {number} */ (await this.rpc('getblockcount'));
    }

    /**
     * Returns the hash of the best (tip) block.
     * @returns {Promise<string>}
     */
    async getBestBlockHash() {
        return /** @type {string} */ (await this.rpc('getbestblockhash'));
    }

    /**
     * Returns full blockchain info.
     * @returns {Promise<BlockchainInfo>}
     */
    async getBlockchainInfo() {
        return /** @type {BlockchainInfo} */ (await this.rpc('getblockchaininfo'));
    }

    /**
     * Returns the hash of the block at height `height`.
     * @param {number} height
     * @returns {Promise<string>}
     */
    async getBlockHash(height) {
        return /** @type {string} */ (await this.rpc('getblockhash', [height]));
    }

    /**
     * Returns block data for the given block hash.
     * @param {string} blockHash
     * @returns {Promise<BlockInfo>}
     */
    async getBlock(blockHash) {
        return /** @type {BlockInfo} */ (await this.rpc('getblock', [blockHash]));
    }

    /**
     * Convenience: fetch block data by height.
     * @param {number} height
     * @returns {Promise<BlockInfo>}
     */
    async getBlockByHeight(height) {
        const hash = await this.getBlockHash(height);
        return this.getBlock(hash);
    }

    /**
     * Returns raw transaction hex (pass `verbose=true` for decoded object).
     * @param {string} txid
     * @param {boolean} [verbose=false]
     * @returns {Promise<string|object>}
     */
    async getRawTransaction(txid, verbose = false) {
        return this.rpc('getrawtransaction', [txid, verbose]);
    }

    // ── Mempool methods ───────────────────────────────────────────────────────

    /**
     * Returns size and byte count of the mempool.
     * @returns {Promise<MempoolInfo>}
     */
    async getMempoolInfo() {
        return /** @type {MempoolInfo} */ (await this.rpc('getmempoolinfo'));
    }

    /**
     * Returns the list of txids currently in the mempool.
     * @returns {Promise<string[]>}
     */
    async getRawMempool() {
        return /** @type {string[]} */ (await this.rpc('getrawmempool'));
    }

    /**
     * Submits a raw transaction (hex-encoded) to the node.
     * @param {string} rawTxHex
     * @returns {Promise<string>} txid on success
     */
    async sendRawTransaction(rawTxHex) {
        return /** @type {string} */ (await this.rpc('sendrawtransaction', [rawTxHex]));
    }

    // ── Network methods ───────────────────────────────────────────────────────

    /**
     * Returns the number of connected peers.
     * @returns {Promise<number>}
     */
    async getConnectionCount() {
        return /** @type {number} */ (await this.rpc('getconnectioncount'));
    }

    /**
     * Returns detailed info about each connected peer.
     * @returns {Promise<PeerInfo[]>}
     */
    async getPeerInfo() {
        return /** @type {PeerInfo[]} */ (await this.rpc('getpeerinfo'));
    }

    // ── REST convenience methods ──────────────────────────────────────────────

    /**
     * Returns node health status (no auth required).
     * @returns {Promise<{status: string}>}
     */
    async health() {
        return this.rest('/health');
    }

    /**
     * Returns node info: version, network, height, peers.
     * @returns {Promise<object>}
     */
    async info() {
        return this.rest('/info');
    }

    /**
     * Returns the spendable balance for a KuberCoin address.
     * @param {string} address
     * @returns {Promise<{total: number, spendable: number, immature: number}>}
     */
    async getBalance(address) {
        return this.rest(`/balance/${encodeURIComponent(address)}`);
    }

    /**
     * Returns the list of UTXOs for an address.
     * @param {string} address
     * @returns {Promise<object[]>}
     */
    async getAddressTxs(address) {
        return this.rest(`/address/${encodeURIComponent(address)}/txs`);
    }
}

// ── Error class ───────────────────────────────────────────────────────────────

export class KubercoinError extends Error {
    /**
     * @param {'network'|'auth'|'rateLimit'|'http'|'rpc'} type
     * @param {string} message
     * @param {number|null} code
     */
    constructor(type, message, code) {
        super(message);
        this.name = 'KubercoinError';
        this.type = type;
        this.code = code;
    }
}

// ── Default export ────────────────────────────────────────────────────────────

export default KubercoinClient;
