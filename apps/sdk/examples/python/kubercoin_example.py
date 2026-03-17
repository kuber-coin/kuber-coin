#!/usr/bin/env python3
"""
KuberCoin Python SDK Example
Demonstrates how to interact with the KuberCoin RPC API
"""

from typing import Any, Dict, List, Optional
import requests


class KuberCoinRpcError(RuntimeError):
    """Raised when the RPC endpoint returns an application-level error."""


class KuberCoinClient:
    """Simple KuberCoin RPC client"""

    def __init__(self, rpc_url: str = "http://localhost:8634/"):
        self.rpc_url = rpc_url
        self.request_id = 0
        self.timeout_seconds = 10

    def _call(self, method: str, params: Optional[List[Any]] = None) -> Any:
        """Make an RPC call"""
        self.request_id += 1

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or [],
            "id": self.request_id,
        }

        response = requests.post(
            self.rpc_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()

        result = response.json()

        if "error" in result and result["error"]:
            raise KuberCoinRpcError(f"RPC Error: {result['error']}")

        return result.get("result")

    def get_block_count(self) -> int:
        """Get current blockchain height"""
        return self._call("getblockcount")

    def get_best_block_hash(self) -> str:
        """Get hash of the best (tip) block"""
        return self._call("getbestblockhash")

    def get_block(self, block_hash: str) -> Dict:
        """Get block by hash"""
        return self._call("getblock", [block_hash])

    def get_block_by_height(self, height: int) -> Dict:
        """Get block by height (resolves hash first, then fetches block)"""
        block_hash = self._call("getblockhash", [height])
        return self._call("getblock", [block_hash])

    def get_transaction(self, txid: str) -> Dict:
        """Get transaction by txid (verbose)"""
        return self._call("getrawtransaction", [txid, True])

    def get_mempool_info(self) -> Dict:
        """Get mempool information"""
        return self._call("getmempoolinfo")

    def get_peer_info(self) -> List[Dict]:
        """Get connected peer information"""
        return self._call("getpeerinfo")


def main():
    """Example usage"""
    print("KuberCoin Python SDK Example")
    print("=" * 50)

    # Initialize client
    client = KuberCoinClient()

    try:
        # Get blockchain info
        height = client.get_block_count()
        print(f"\n📊 Blockchain Height: {height}")

        best_hash = client.get_best_block_hash()
        print(f"🔗 Best Block Hash: {best_hash}")

        # Get latest block
        print("\n📦 Latest Block Details:")
        latest_block = client.get_block_by_height(height)
        latest_height = latest_block.get("height")
        latest_hash = latest_block.get("hash")
        latest_prev = latest_block.get("previousblockhash")
        latest_txs = latest_block.get("tx") or []
        latest_nonce = latest_block.get("nonce")
        print(f"   Height: {latest_height}")
        print(f"   Hash: {latest_hash}")
        print(f"   Previous: {latest_prev}")
        print(f"   Transactions: {len(latest_txs)}")
        print(f"   Nonce: {latest_nonce}")

        # Get genesis block
        print("\n🌱 Genesis Block:")
        genesis = client.get_block_by_height(0)
        genesis_hash = genesis.get("hash")
        genesis_time = genesis.get("time")
        print(f"   Hash: {genesis_hash}")
        print(f"   Time: {genesis_time}")

        # Get mempool info
        print("\n💾 Mempool Info:")
        mempool = client.get_mempool_info()
        print(f"   Size: {mempool.get('size')} transactions")
        print(f"   Bytes: {mempool.get('bytes')}")

        # Get first transaction from latest block
        if latest_block["tx"]:
            first_tx = latest_block["tx"][0]
            print("\n💸 First Transaction in Block:")
            tx = client.get_transaction(first_tx)
            print(f"   TxID: {tx.get('txid')}")
            print(f"   Inputs: {len(tx.get('vin') or [])}")
            print(f"   Outputs: {len(tx.get('vout') or [])}")

        print("\n✅ All operations completed successfully!")

    except (KuberCoinRpcError, requests.RequestException, ValueError, KeyError) as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()
