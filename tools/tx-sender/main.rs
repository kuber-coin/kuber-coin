//! End-to-end transaction sender for KuberCoin regtest.
//!
//! 1. Generates Alice & Bob P2WPKH keypairs
//! 2. Mines blocks to Alice (proper P2WPKH coinbase)
//! 3. Builds a signed P2WPKH transaction from Alice → Bob
//! 4. Submits it via `sendrawtransaction`
//! 5. Mines one more block (should include the tx)
//! 6. Verifies balances

use serde_json::json;

fn rpc(url: &str, method: &str, params: Vec<serde_json::Value>) -> serde_json::Value {
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });
    let resp: serde_json::Value = client
        .post(url)
        .json(&body)
        .send()
        .expect("RPC call failed")
        .json()
        .expect("bad JSON response");
    if let Some(err) = resp.get("error") {
        if !err.is_null() {
            panic!("RPC error on {method}: {err}");
        }
    }
    resp["result"].clone()
}

/// Mine `n` blocks with the given coinbase script_pubkey.
fn mine_blocks(url: &str, n: usize, address: &str, script_pubkey_hex: &str) {
    for _ in 0..n {
        // Get template with the exact script_pubkey
        let template = rpc(url, "getblocktemplate", vec![
            json!(address),
            json!(script_pubkey_hex),
        ]);
        let block_hex = template["block"].as_str().expect("no block in template");
        let mut block: chain::Block =
            bincode::deserialize(&hex::decode(block_hex).unwrap()).unwrap();

        // Solve PoW (regtest difficulty is trivial)
        for nonce in 0u64.. {
            block.header.nonce = nonce;
            if consensus::verify_pow(&block.header) {
                break;
            }
        }

        // Submit
        let block_bytes = bincode::serialize(&block).unwrap();
        let result = rpc(url, "submitblock", vec![json!(hex::encode(&block_bytes))]);
        assert_eq!(result.as_str(), Some("accepted"), "block not accepted");
    }
}

fn main() {
    let url = std::env::args().nth(1).unwrap_or_else(|| "http://127.0.0.1:28332".to_string());

    println!("=== KuberCoin Transaction Sender ===");
    println!("RPC: {url}\n");

    // ── Step 1: Generate keypairs ────────────────────────────────
    let alice_key = tx::PrivateKey::new();
    let alice_pub = alice_key.public_key();
    let alice_pkh = alice_pub.hash(); // 20-byte Hash160

    let bob_key = tx::PrivateKey::new();
    let bob_pub = bob_key.public_key();
    let bob_pkh = bob_pub.hash();

    // P2WPKH script_pubkey: OP_0 <20-byte-hash>
    let alice_spk = {
        let mut s = vec![0x00, 0x14]; // OP_0 PUSH20
        s.extend_from_slice(&alice_pkh);
        s
    };
    let bob_spk = {
        let mut s = vec![0x00, 0x14];
        s.extend_from_slice(&bob_pkh);
        s
    };

    println!("Alice pubkey hash: {}", hex::encode(alice_pkh));
    println!("Alice script_pubkey: {}", hex::encode(&alice_spk));
    println!("Bob   pubkey hash: {}", hex::encode(bob_pkh));
    println!("Bob   script_pubkey: {}", hex::encode(&bob_spk));

    // ── Step 2: Mine 101 blocks to Alice ─────────────────────────
    // Coinbase maturity is 100 blocks, so we need 101 blocks before
    // the first coinbase output is spendable.
    let start_height: u64 = rpc(&url, "getblockcount", vec![])
        .as_u64()
        .expect("bad height");
    println!("\nChain height before mining: {start_height}");

    println!("Mining 101 blocks to Alice (coinbase maturity = 100)...");
    mine_blocks(&url, 101, "Alice", &hex::encode(&alice_spk));

    let height = rpc(&url, "getblockcount", vec![]).as_u64().unwrap();
    println!("Chain height after mining: {height}");

    // ── Step 3: Find Alice's spendable UTXO ─────────────────────
    let utxos = rpc(&url, "getutxos", vec![json!(hex::encode(&alice_spk))]);
    let utxos = utxos.as_array().expect("getutxos should return array");
    println!("\nAlice has {} UTXOs", utxos.len());

    // Pick the oldest coinbase UTXO (lowest height) to ensure maturity
    let utxo = utxos
        .iter()
        .min_by_key(|u| u["height"].as_u64().unwrap_or(u64::MAX))
        .expect("no UTXOs found");
    let prev_txid_hex = utxo["txid"].as_str().unwrap();
    let prev_vout = utxo["vout"].as_u64().unwrap() as u32;
    let prev_value = utxo["value"].as_u64().unwrap();

    println!(
        "Spending UTXO: txid={} vout={} value={} sat",
        &prev_txid_hex[..16],
        prev_vout,
        prev_value,
    );

    // ── Step 4: Build transaction ────────────────────────────────
    let send_amount: u64 = 10_0000_0000; // 10 KUBER
    let fee: u64 = 1000; // 1000 sat fee
    let change = prev_value - send_amount - fee;

    let mut prev_txid = [0u8; 32];
    prev_txid.copy_from_slice(&hex::decode(prev_txid_hex).unwrap());

    let outpoint = tx::OutPoint::new(prev_txid, prev_vout);
    // Start with empty witness — we'll fill it after computing sighash
    let input = tx::TxInput::new_witness(outpoint, tx::Witness::new());

    // Output 0: 10 KUBER to Bob (P2WPKH)
    let out_bob = tx::TxOutput::new(send_amount, bob_spk.clone());
    // Output 1: change back to Alice (P2WPKH)
    let out_change = tx::TxOutput::new(change, alice_spk.clone());

    let mut transaction = tx::Transaction::new(
        vec![input],
        vec![out_bob, out_change],
        0, // lock_time
    );

    // ── Step 5: Sign (BIP-143 P2WPKH) ───────────────────────────
    // Script code for P2WPKH: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
    let mut script_code = Vec::with_capacity(25);
    script_code.push(0x76); // OP_DUP
    script_code.push(0xa9); // OP_HASH160
    script_code.push(0x14); // push 20 bytes
    script_code.extend_from_slice(&alice_pkh);
    script_code.push(0x88); // OP_EQUALVERIFY
    script_code.push(0xac); // OP_CHECKSIG

    let sighash = transaction
        .segwit_v0_signature_hash(0, &script_code, prev_value)
        .expect("sighash computation failed");

    let signature = alice_key.sign(&sighash);
    let mut sig_bytes = signature.serialize_der().to_vec();
    sig_bytes.push(0x01); // SIGHASH_ALL

    let witness = tx::Witness {
        stack: vec![sig_bytes, alice_pub.to_bytes()],
    };
    transaction.inputs[0].witness = witness;

    let txid = transaction.txid();
    println!("\nTransaction built:");
    println!("  txid: {}", hex::encode(txid));
    println!("  inputs: {}", transaction.inputs.len());
    println!("  outputs: {} (Bob={} sat, change={} sat)", transaction.outputs.len(), send_amount, change);
    println!("  fee: {fee} sat");

    // ── Step 6: Submit transaction ───────────────────────────────
    let tx_bytes = bincode::serialize(&transaction).unwrap();
    let tx_hex = hex::encode(&tx_bytes);

    let result = rpc(&url, "sendrawtransaction", vec![json!(tx_hex)]);
    println!("\nSubmitted tx: {}", result);

    // Verify it's in mempool
    let info: serde_json::Value = reqwest::blocking::get(format!("{url}/api/mempool"))
        .unwrap()
        .json()
        .unwrap();
    println!("Mempool count: {}", info["count"]);

    // ── Step 7: Mine one more block (should include the tx) ──────
    println!("\nMining 1 block to confirm transaction...");
    mine_blocks(&url, 1, "Alice", &hex::encode(&alice_spk));

    let height = rpc(&url, "getblockcount", vec![]).as_u64().unwrap();
    println!("Chain height: {height}");

    // Verify mempool is empty (tx was mined)
    let info: serde_json::Value = reqwest::blocking::get(format!("{url}/api/mempool"))
        .unwrap()
        .json()
        .unwrap();
    println!("Mempool count after mining: {}", info["count"]);

    // ── Step 8: Verify block contains 2 txs ─────────────────────
    let block_info: serde_json::Value =
        reqwest::blocking::get(format!("{url}/api/block-by-height/{height}"))
            .unwrap()
            .json()
            .unwrap();
    println!(
        "Block {} tx_count: {} (expected 2: coinbase + our tx)",
        height,
        block_info["tx_count"]
    );

    // ── Step 9: Verify Bob's UTXOs ───────────────────────────────
    let bob_utxos = rpc(&url, "getutxos", vec![json!(hex::encode(&bob_spk))]);
    let bob_utxos = bob_utxos.as_array().unwrap();
    let bob_total: u64 = bob_utxos.iter().map(|u| u["value"].as_u64().unwrap()).sum();
    println!(
        "\nBob's UTXOs: {} (total: {} sat = {} KUBER)",
        bob_utxos.len(),
        bob_total,
        bob_total as f64 / 1_0000_0000.0,
    );

    assert_eq!(bob_total, send_amount, "Bob should have received exactly {send_amount} sat");
    assert_eq!(block_info["tx_count"].as_u64(), Some(2), "Block should have 2 txs");

    println!("\n✅ SUCCESS: Full transaction lifecycle verified!");
    println!("   Alice mined 102 blocks, sent 10 KUBER to Bob, confirmed in block {height}");
}
