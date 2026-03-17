/**
 * KuberCoin JavaScript/Node.js SDK Example
 * Demonstrates how to interact with the KuberCoin RPC API
 */

import { pathToFileURL } from 'node:url';

class KuberCoinClient {
    constructor(rpcUrl = 'http://localhost:8634/') {
        this.rpcUrl = rpcUrl;
        this.requestId = 0;
    }

    /**
     * Make an RPC call
     */
    async call(method, params = []) {
        this.requestId++;
        
        const payload = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: this.requestId
        };

        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(`RPC Error: ${JSON.stringify(result.error)}`);
        }

        return result.result;
    }

    /**
     * Get current blockchain height
     */
    async getBlockCount() {
        return await this.call('getblockcount');
    }

    /**
     * Get hash of the best (tip) block
     */
    async getBestBlockHash() {
        return await this.call('getbestblockhash');
    }

    /**
     * Get block by hash
     */
    async getBlock(blockHash) {
        return await this.call('getblock', [blockHash]);
    }

    /**
     * Get block by height (resolves hash first, then fetches block)
     */
    async getBlockByHeight(height) {
        const hash = await this.call('getblockhash', [height]);
        return await this.call('getblock', [hash]);
    }

    /**
     * Get transaction by txid (verbose)
     */
    async getTransaction(txid) {
        return await this.call('getrawtransaction', [txid, true]);
    }

    /**
     * Get mempool information
     */
    async getMempoolInfo() {
        return await this.call('getmempoolinfo');
    }

    /**
     * Get connected peer information
     */
    async getPeerInfo() {
        return await this.call('getpeerinfo');
    }
}

/**
 * Example usage
 */
// Run if called directly (Node.js)
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
    console.log('KuberCoin JavaScript SDK Example');
    console.log('='.repeat(50));

    const client = new KuberCoinClient();

    try {
        // Get blockchain info
        const height = await client.getBlockCount();
        console.log(`\n📊 Blockchain Height: ${height}`);

        const bestHash = await client.getBestBlockHash();
        console.log(`🔗 Best Block Hash: ${bestHash}`);

        // Get latest block
        console.log(`\n📦 Latest Block Details:`);
        const latestBlock = await client.getBlockByHeight(height);
        console.log(`   Height: ${latestBlock.height}`);
        console.log(`   Hash: ${latestBlock.hash}`);
        console.log(`   Previous: ${latestBlock.previousblockhash}`);
        console.log(`   Transactions: ${latestBlock.tx.length}`);
        console.log(`   Nonce: ${latestBlock.nonce}`);

        // Get genesis block
        console.log(`\n🌱 Genesis Block:`);
        const genesis = await client.getBlockByHeight(0);
        console.log(`   Hash: ${genesis.hash}`);
        console.log(`   Time: ${new Date(genesis.time * 1000).toISOString()}`);

        // Get mempool info
        console.log(`\n💾 Mempool Info:`);
        const mempool = await client.getMempoolInfo();
        console.log(`   Size: ${mempool.size} transactions`);
        console.log(`   Bytes: ${mempool.bytes}`);

        // Get first transaction from latest block
        if (latestBlock.tx.length > 0) {
            const firstTx = latestBlock.tx[0];
            console.log(`\n💸 First Transaction in Block:`);
            const tx = await client.getTransaction(firstTx);
            console.log(`   TxID: ${tx.txid}`);
            console.log(`   Inputs: ${tx.vin.length}`);
            console.log(`   Outputs: ${tx.vout.length}`);
        }

        console.log('\n✅ All operations completed successfully!');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Error: ${message}`);
    }
}

// Export for use in other modules
export { KuberCoinClient };
