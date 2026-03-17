//! Chain/blockchain JSON-RPC handlers (getblock, getrawtransaction, mempool, etc.)

use std::sync::Arc;

use crate::rpc::{AppState, JsonRpcResponse};

/// Convert a transaction to verbose JSON representation (Bitcoin-compatible).
pub(crate) fn tx_to_verbose_json(
    transaction: &tx::Transaction,
    block_hash: Option<[u8; 32]>,
    block_height: Option<u64>,
    current_height: u64,
) -> serde_json::Value {
    let vin: Vec<serde_json::Value> = transaction.inputs.iter().map(|inp| {
        if inp.prev_output.is_null() {
            serde_json::json!({ "coinbase": hex::encode(&inp.script_sig), "sequence": inp.sequence })
        } else {
            serde_json::json!({
                "txid": hex::encode(inp.prev_output.txid),
                "vout": inp.prev_output.vout,
                "scriptSig": hex::encode(&inp.script_sig),
                "sequence": inp.sequence,
            })
        }
    }).collect();

    let vout: Vec<serde_json::Value> = transaction.outputs.iter().enumerate().map(|(n, out)| {
        serde_json::json!({
            "value": out.value,
            "n": n,
            "scriptPubKey": hex::encode(&out.script_pubkey),
        })
    }).collect();

    let mut result = serde_json::json!({
        "txid": hex::encode(transaction.txid()),
        "version": transaction.version,
        "locktime": transaction.lock_time,
        "vin": vin,
        "vout": vout,
        "size": bincode::serialize(transaction).map(|b| b.len()).unwrap_or(0),
        "weight": transaction.weight(),
    });
    if let (Some(bh), Some(height)) = (block_hash, block_height) {
        result["blockhash"] = serde_json::json!(hex::encode(bh));
        result["confirmations"] = serde_json::json!(current_height.saturating_sub(height) + 1);
    }
    result
}

pub(crate) fn dispatch(
    state: &Arc<AppState>,
    method: &str,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> Option<JsonRpcResponse> {
    let resp = match method {
        // ── getinfo ─────────────────────────────────────────────
        "getinfo" => {
            let height = state.node.get_height();
            let connections = state.peers
                .as_ref()
                .map(|pm| pm.total())
                .unwrap_or(0);
            let bits = state.node.calculate_next_bits(height);
            let difficulty = consensus::bits_to_difficulty(bits);
            let is_testnet = !matches!(state.node.network(), crate::config::Network::Mainnet);
            JsonRpcResponse::ok(id, serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "protocolversion": 70015,
                "blocks": height,
                "connections": connections,
                "difficulty": difficulty,
                "testnet": is_testnet,
                "balance": 0,
            }))
        }
        "getblockcount" => JsonRpcResponse::ok(
            id,
            serde_json::json!(state.node.get_height()),
        ),
        "getblockchaininfo" => JsonRpcResponse::ok(
            id,
            serde_json::json!({
                "chain": format!("{:?}", state.node.network()),
                "blocks": state.node.get_height(),
                "bestblockhash": hex::encode(state.node.get_tip()),
                "chainwork": hex::encode(state.node.get_chainwork()),
            }),
        ),
        "getutxos" => {
            let spk_hex = params.first().and_then(|v| v.as_str()).unwrap_or("");
            let spk = match hex::decode(spk_hex) {
                Ok(b) => b,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad hex: {e}"))),
            };
            let utxo_set = state.node.utxo_set();
            let utxos: Vec<_> = utxo_set.get_utxos_by_script(&spk)
                .into_iter()
                .map(|(op, utxo)| serde_json::json!({
                    "txid": hex::encode(op.txid),
                    "vout": op.vout,
                    "value": utxo.output.value,
                    "height": utxo.height,
                    "is_coinbase": utxo.is_coinbase,
                }))
                .collect();
            JsonRpcResponse::ok(id, serde_json::json!(utxos))
        }
        "sendrawtransaction" => {
            let tx_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing tx hex")),
            };
            let tx_bytes = match hex::decode(tx_hex) {
                Ok(b) => b,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad hex: {e}"))),
            };
            let transaction: tx::Transaction = match bincode::deserialize(&tx_bytes) {
                Ok(t) => t,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad tx: {e}"))),
            };
            let txid = transaction.txid();
            if let Err(e) = state.node.validate_transaction(&transaction) {
                return Some(JsonRpcResponse::err(id, -1, format!("validation failed: {e}")));
            }
            let fee = {
                let utxo_set = state.node.utxo_set();
                let input_sum: u64 = transaction.inputs.iter().filter_map(|inp| {
                    utxo_set.get_utxo(&inp.prev_output).map(|u| u.output.value)
                }).sum();
                let output_sum: u64 = transaction.outputs.iter().map(|o| o.value).sum();
                input_sum.saturating_sub(output_sum)
            };
            match state.mempool.add_transaction_with_fee(transaction, fee) {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!(hex::encode(txid))),
                Err(e) => JsonRpcResponse::err(id, -1, format!("mempool: {e}")),
            }
        }
        // ── getrawtransaction ───────────────────────────────────
        "getrawtransaction" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let verbose = params.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid hex")),
            };
            if let Some(transaction) = state.mempool.get_transaction(&txid_bytes) {
                if verbose {
                    let ch = state.node.get_height();
                    let mut verbose_json = tx_to_verbose_json(&transaction, None, None, ch);
                    if let Some(entry) = state.mempool.get_entry(&txid_bytes) {
                        verbose_json["fee"] = serde_json::json!(entry.fee);
                    }
                    return Some(JsonRpcResponse::ok(id, verbose_json));
                } else {
                    let raw = hex::encode(bincode::serialize(&transaction).unwrap_or_default());
                    return Some(JsonRpcResponse::ok(id, serde_json::json!(raw)));
                }
            }
            let height = state.node.get_height();
            for h in (0..=height).rev() {
                if let Some(bhash) = state.node.get_block_hash(h) {
                    if let Some(block) = state.node.get_block(&bhash) {
                        for transaction in &block.transactions {
                            if transaction.txid() == txid_bytes {
                                if verbose {
                                    let ch = state.node.get_height();
                                    let mut verbose_json = tx_to_verbose_json(transaction, Some(bhash), Some(h), ch);
                                    verbose_json["time"] = serde_json::json!(block.header.timestamp);
                                    verbose_json["blocktime"] = serde_json::json!(block.header.timestamp);
                                    verbose_json["height"] = serde_json::json!(h);
                                    // Compute fee: sum(inputs) - sum(outputs)
                                    let fee = {
                                        let utxo_set = state.node.utxo_set();
                                        let in_sum: u64 = transaction.inputs.iter().filter_map(|inp| {
                                            utxo_set.get_utxo(&inp.prev_output).map(|u| u.output.value)
                                        }).sum();
                                        let out_sum: u64 = transaction.outputs.iter().map(|o| o.value).sum();
                                        in_sum.saturating_sub(out_sum)
                                    };
                                    if fee > 0 {
                                        verbose_json["fee"] = serde_json::json!(fee);
                                    }
                                    return Some(JsonRpcResponse::ok(id, verbose_json));
                                } else {
                                    let raw = hex::encode(bincode::serialize(transaction).unwrap_or_default());
                                    return Some(JsonRpcResponse::ok(id, serde_json::json!(raw)));
                                }
                            }
                        }
                    }
                }
            }
            JsonRpcResponse::err(id, -5, "transaction not found")
        }
        // ── decoderawtransaction ────────────────────────────────
        "decoderawtransaction" => {
            let tx_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing tx hex")),
            };
            let tx_bytes = match hex::decode(tx_hex) {
                Ok(b) => b,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad hex: {e}"))),
            };
            let transaction: tx::Transaction = match bincode::deserialize(&tx_bytes) {
                Ok(t) => t,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("decode failed: {e}"))),
            };
            JsonRpcResponse::ok(id, tx_to_verbose_json(&transaction, None, None, 0))
        }
        // ── gettxout ────────────────────────────────────────────
        "gettxout" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let vout = match params.get(1).and_then(|v| v.as_u64()) {
                Some(v) => v as u32,
                None => return Some(JsonRpcResponse::err(id, -1, "missing vout")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid hex")),
            };
            let outpoint = tx::OutPoint::new(txid_bytes, vout);
            let utxo_set = state.node.utxo_set();
            match utxo_set.get_utxo(&outpoint) {
                Some(utxo) => JsonRpcResponse::ok(id, serde_json::json!({
                    "bestblock": hex::encode(state.node.get_tip()),
                    "confirmations": state.node.get_height().saturating_sub(utxo.height) + 1,
                    "value": utxo.output.value,
                    "scriptPubKey": hex::encode(&utxo.output.script_pubkey),
                    "coinbase": utxo.is_coinbase,
                })),
                None => JsonRpcResponse::ok(id, serde_json::Value::Null),
            }
        }
        // ── getmempoolinfo ──────────────────────────────────────
        "getmempoolinfo" => {
            let histogram = state.mempool.fee_histogram();
            let fee_hist: Vec<_> = histogram.iter().map(|(upper, count)| {
                serde_json::json!({ "fee_rate": upper, "count": count })
            }).collect();
            JsonRpcResponse::ok(id, serde_json::json!({
                "loaded": true,
                "size": state.mempool.count(),
                "bytes": state.mempool.size_bytes(),
                "fee_histogram": fee_hist,
            }))
        }
        // ── getrawmempool ───────────────────────────────────────
        "getrawmempool" => {
            let txids: Vec<String> = state.mempool.get_txids().iter().map(hex::encode).collect();
            JsonRpcResponse::ok(id, serde_json::json!(txids))
        }
        // ── getblock (with verbosity) ───────────────────────────
        "getblock" => {
            let hash_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing blockhash")),
            };
            let verbosity = params.get(1).and_then(|v| v.as_u64()).unwrap_or(1);
            let hash_bytes = match hex::decode(hash_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid blockhash hex")),
            };
            let block = match state.node.get_block(&hash_bytes) {
                Some(b) => b,
                None => return Some(JsonRpcResponse::err(id, -5, "block not found")),
            };
            if verbosity == 0 {
                let raw = hex::encode(bincode::serialize(&block).unwrap_or_default());
                JsonRpcResponse::ok(id, serde_json::json!(raw))
            } else {
                let txs: Vec<serde_json::Value> = if verbosity >= 2 {
                    let ch = state.node.get_height();
                    block.transactions.iter().map(|t| tx_to_verbose_json(t, Some(hash_bytes), Some(block.header.height), ch)).collect()
                } else {
                    block.transactions.iter().map(|t| serde_json::json!(hex::encode(t.txid()))).collect()
                };
                let block_size = bincode::serialize(&block).map(|b| b.len()).unwrap_or(0);
                // Miner: decoded address of coinbase tx first output
                let miner_addr = block.transactions.first().and_then(|cb| {
                    cb.outputs.first().and_then(|out| {
                        let spk = &out.script_pubkey;
                        // P2WPKH: OP_0 OP_PUSH20 <20-byte-hash>
                        if spk.len() == 22 && spk[0] == 0x00 && spk[1] == 0x14 {
                            let mut hash = [0u8; 20];
                            hash.copy_from_slice(&spk[2..22]);
                            let net_str = match state.node.network() {
                                crate::config::Network::Testnet => "testnet",
                                _ => "mainnet",
                            };
                            tx::bech32m::encode_p2wpkh_address(&hash, net_str).ok()
                        } else {
                            None
                        }
                    })
                }).unwrap_or_default();
                let reward: u64 = block.transactions.first()
                    .map(|cb| cb.outputs.iter().map(|o| o.value).sum())
                    .unwrap_or(0);
                JsonRpcResponse::ok(id, serde_json::json!({
                    "hash": hex::encode(block.hash()),
                    "height": block.header.height,
                    "previousblockhash": hex::encode(block.header.prev_hash),
                    "time": block.header.timestamp,
                    "bits": format!("{:#010x}", block.header.bits),
                    "nonce": block.header.nonce,
                    "merkleroot": hex::encode(block.header.merkle_root),
                    "nTx": block.transactions.len(),
                    "tx": txs,
                    "size": block_size,
                    "miner": miner_addr,
                    "reward": reward,
                }))
            }
        }
        // ── getblockhash ────────────────────────────────────────
        "getblockhash" => {
            let height = match params.first().and_then(|v| v.as_u64()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing height")),
            };
            match state.node.get_block_hash(height) {
                Some(hash) => JsonRpcResponse::ok(id, serde_json::json!(hex::encode(hash))),
                None => JsonRpcResponse::err(id, -8, "block height out of range"),
            }
        }
        // ── validateaddress ─────────────────────────────────────
        "validateaddress" => {
            let addr = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let is_valid = tx::Address::decode(addr).is_ok();
            JsonRpcResponse::ok(id, serde_json::json!({
                "isvalid": is_valid,
                "address": addr,
            }))
        }
        // ── testmempoolaccept ───────────────────────────────────
        "testmempoolaccept" => {
            let tx_hexes: Vec<&str> = match params.first().and_then(|v| v.as_array()) {
                Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing tx array")),
            };
            let mut results = Vec::new();
            for tx_hex in tx_hexes {
                let val = (|| -> Result<serde_json::Value, String> {
                    let tx_bytes = hex::decode(tx_hex).map_err(|e| format!("bad hex: {e}"))?;
                    let transaction: tx::Transaction = bincode::deserialize(&tx_bytes).map_err(|e| format!("bad tx: {e}"))?;
                    let txid = hex::encode(transaction.txid());
                    if let Err(e) = state.node.validate_transaction(&transaction) {
                        return Ok(serde_json::json!({ "txid": txid, "allowed": false, "reject-reason": format!("{e}") }));
                    }
                    Ok(serde_json::json!({ "txid": txid, "allowed": true }))
                })();
                results.push(val.unwrap_or_else(|e| serde_json::json!({ "allowed": false, "reject-reason": e })));
            }
            JsonRpcResponse::ok(id, serde_json::json!(results))
        }
        // ── Fee estimation (Bitcoin Core compatible) ────────────
        "estimatefee" | "estimatesmartfee" => {
            let conf_target = params.first()
                .and_then(|v| v.as_u64())
                .unwrap_or(6);
            let conf_target = conf_target.max(1).min(1008);

            match state.mempool.estimate_fee_rate(conf_target) {
                Some(rate) => {
                    let fee_per_kb = rate * 1000.0 / 100_000_000.0;
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "feerate": fee_per_kb,
                        "blocks": conf_target,
                    }))
                }
                None => {
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "errors": ["Insufficient data for fee estimation"],
                        "blocks": conf_target,
                    }))
                }
            }
        }
        // ── getbestblockhash ────────────────────────────────────
        "getbestblockhash" => {
            JsonRpcResponse::ok(id, serde_json::json!(hex::encode(state.node.get_tip())))
        }
        // ── getblockheader ──────────────────────────────────────
        "getblockheader" => {
            let hash_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing blockhash")),
            };
            let verbose = params.get(1).and_then(|v| v.as_bool()).unwrap_or(true);
            let hash_bytes = match hex::decode(hash_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid blockhash hex")),
            };
            let block = match state.node.get_block(&hash_bytes) {
                Some(b) => b,
                None => return Some(JsonRpcResponse::err(id, -5, "block not found")),
            };
            if verbose {
                JsonRpcResponse::ok(id, serde_json::json!({
                    "hash": hex::encode(block.hash()),
                    "height": block.header.height,
                    "version": block.header.version,
                    "previousblockhash": hex::encode(block.header.prev_hash),
                    "merkleroot": hex::encode(block.header.merkle_root),
                    "time": block.header.timestamp,
                    "bits": format!("{:#010x}", block.header.bits),
                    "nonce": block.header.nonce,
                    "nTx": block.transactions.len(),
                }))
            } else {
                let raw = hex::encode(bincode::serialize(&block.header).unwrap_or_default());
                JsonRpcResponse::ok(id, serde_json::json!(raw))
            }
        }
        // ── getdifficulty ───────────────────────────────────────
        "getdifficulty" => {
            let height = state.node.get_height();
            let bits = state.node.calculate_next_bits(height);
            let difficulty = consensus::bits_to_difficulty(bits);
            JsonRpcResponse::ok(id, serde_json::json!(difficulty))
        }
        // ── getmempoolentry ─────────────────────────────────────
        "getmempoolentry" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid hex")),
            };
            match state.mempool.get_entry(&txid_bytes) {
                Some(entry) => {
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "fees": {
                            "base": entry.fee,
                            "ancestor": entry.ancestor_fee,
                        },
                        "vsize": entry.size,
                        "ancestor_size": entry.ancestor_size,
                        "time": entry.added_time,
                    }))
                }
                None => JsonRpcResponse::err(id, -5, "transaction not in mempool"),
            }
        }
        // ── uptime ──────────────────────────────────────────────
        "uptime" => {
            let secs = state.start_time.elapsed().as_secs();
            JsonRpcResponse::ok(id, serde_json::json!(secs))
        }
        // ── help ────────────────────────────────────────────────
        "help" => {
            let methods = vec![
                "getinfo", "getblocktemplate", "submitblock", "getblockcount", "getblockchaininfo",
                "getutxos", "sendrawtransaction", "getrawtransaction", "decoderawtransaction",
                "gettxout", "getmempoolinfo", "getrawmempool", "getblock", "getblockhash",
                "validateaddress", "testmempoolaccept", "getmininginfo", "getnetworkinfo",
                "estimatefee", "estimatesmartfee", "getbestblockhash", "getblockheader",
                "getdifficulty", "getpeerinfo", "getconnectioncount", "getmempoolentry",
                "uptime", "getblockstats", "getchaintips", "getmempoolancestors",
                "getmempooldescendants", "listunspent", "signrawtransactionwithkey",
                "getaddressinfo", "generatetoaddress", "createrawtransaction",
                "sendtoaddress", "getnewaddress", "getbalance", "listtransactions",
                "addnode", "disconnectnode", "setban", "listbanned", "verifychain",
                "importprivkey", "dumpprivkey", "backupwallet", "walletpassphrase",
                "walletlock", "encryptwallet", "createwallet", "loadwallet",
                "unloadwallet", "listwallets", "getwalletinfo", "rescanblockchain",
                "importaddress", "importdescriptors", "listdescriptors",
                "settxfee", "keypoolrefill", "getreceivedbyaddress",
                "listreceivedbyaddress", "abandontransaction", "fundrawtransaction",
                "sethdseed", "listaddressgroupings", "bumpfee", "psbtbumpfee",
                "getbalances", "walletcreatefundedpsbt", "walletprocesspsbt",
                "gettxoutsetinfo", "help",
            ];
            JsonRpcResponse::ok(id, serde_json::json!(methods))
        }
        // ── getblockstats ───────────────────────────────────────
        "getblockstats" => {
            let block = match params.first() {
                Some(serde_json::Value::Number(n)) => {
                    let h = n.as_u64().unwrap_or(0);
                    state.node.get_block_hash(h).and_then(|hash| state.node.get_block(&hash))
                }
                Some(serde_json::Value::String(s)) => {
                    match hex::decode(s) {
                        Ok(b) if b.len() == 32 => {
                            let mut arr = [0u8; 32]; arr.copy_from_slice(&b);
                            state.node.get_block(&arr)
                        }
                        _ => None,
                    }
                }
                _ => None,
            };
            let block = match block {
                Some(b) => b,
                None => return Some(JsonRpcResponse::err(id, -5, "block not found")),
            };
            let total_size: usize = block.transactions.iter()
                .filter_map(|t| bincode::serialize(t).ok())
                .map(|b| b.len())
                .sum();
            let total_weight = total_size * 4;
            let mut total_fee: u64 = 0;
            let mut min_fee = u64::MAX;
            let mut max_fee: u64 = 0;
            let mut min_feerate = f64::MAX;
            let mut max_feerate: f64 = 0.0;
            let mut total_out: u64 = 0;
            let mut _total_in: u64 = 0;
            let mut segwit_count: usize = 0;
            let subsidy = consensus::params::block_subsidy(block.header.height);

            for (i, txn) in block.transactions.iter().enumerate() {
                let out_sum: u64 = txn.outputs.iter().map(|o| o.value).sum();
                total_out += out_sum;
                if i == 0 { continue; }
                let in_sum: u64 = txn.inputs.iter()
                    .filter_map(|inp| state.node.get_utxo(&inp.prev_output.txid, inp.prev_output.vout))
                    .map(|u| u.output.value)
                    .sum();
                _total_in += in_sum;
                let fee = in_sum.saturating_sub(out_sum);
                total_fee += fee;
                min_fee = min_fee.min(fee);
                max_fee = max_fee.max(fee);
                let sz = bincode::serialize(txn).map(|b| b.len()).unwrap_or(1);
                let rate = fee as f64 / sz as f64;
                min_feerate = min_feerate.min(rate);
                max_feerate = max_feerate.max(rate);
                if txn.inputs.iter().any(|inp| !inp.witness.is_empty()) {
                    segwit_count += 1;
                }
            }
            let tx_count = block.transactions.len();
            let avg_fee = if tx_count > 1 { total_fee / (tx_count as u64 - 1) } else { 0 };
            if min_fee == u64::MAX { min_fee = 0; }
            if min_feerate == f64::MAX { min_feerate = 0.0; }

            JsonRpcResponse::ok(id, serde_json::json!({
                "height": block.header.height,
                "blockhash": hex::encode(block.hash()),
                "time": block.header.timestamp,
                "txs": tx_count,
                "total_size": total_size,
                "total_weight": total_weight,
                "totalfee": total_fee,
                "avgfee": avg_fee,
                "minfee": min_fee,
                "maxfee": max_fee,
                "minfeerate": min_feerate,
                "maxfeerate": max_feerate,
                "total_out": total_out,
                "subsidy": subsidy,
                "swtxs": segwit_count,
            }))
        }
        // ── getchaintips ────────────────────────────────────────
        "getchaintips" => {
            let active_tip = state.node.get_tip();
            let active_height = state.node.get_height();

            let tips_from_index = state.node.get_chain_tips();
            let mut tips_json: Vec<serde_json::Value> = Vec::new();

            if tips_from_index.is_empty() {
                tips_json.push(serde_json::json!({
                    "height": active_height,
                    "hash": hex::encode(active_tip),
                    "branchlen": 0,
                    "status": "active",
                }));
            } else {
                for bi in &tips_from_index {
                    let mut fork_len = 0u64;
                    let mut cursor = bi.prev_hash;
                    let is_active = bi.hash == active_tip;
                    if !is_active {
                        for _ in 0..1000 {
                            if state.node.get_block_hash(bi.height.saturating_sub(fork_len + 1)).map(|h| h == cursor).unwrap_or(false) {
                                break;
                            }
                            fork_len += 1;
                            match state.node.get_block_index(&cursor) {
                                Some(parent) => cursor = parent.prev_hash,
                                None => break,
                            }
                        }
                    }
                    let status = if is_active {
                        "active"
                    } else if bi.have_data {
                        "valid-fork"
                    } else {
                        "headers-only"
                    };
                    tips_json.push(serde_json::json!({
                        "height": bi.height,
                        "hash": hex::encode(bi.hash),
                        "branchlen": fork_len,
                        "status": status,
                    }));
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!(tips_json))
        }
        // ── getmempoolancestors ─────────────────────────────────
        "getmempoolancestors" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid hex")),
            };
            match state.mempool.get_transaction(&txid_bytes) {
                Some(txn) => {
                    let mut ancestors = Vec::new();
                    let mut stack: Vec<[u8; 32]> = txn.inputs.iter()
                        .map(|i| i.prev_output.txid)
                        .collect();
                    let mut visited = std::collections::HashSet::new();
                    while let Some(parent) = stack.pop() {
                        if !visited.insert(parent) { continue; }
                        if let Some(p) = state.mempool.get_transaction(&parent) {
                            ancestors.push(hex::encode(parent));
                            for inp in &p.inputs {
                                stack.push(inp.prev_output.txid);
                            }
                        }
                    }
                    JsonRpcResponse::ok(id, serde_json::json!(ancestors))
                }
                None => JsonRpcResponse::err(id, -5, "transaction not in mempool"),
            }
        }
        // ── getmempooldescendants ───────────────────────────────
        "getmempooldescendants" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid hex")),
            };
            if !state.mempool.contains(&txid_bytes) {
                return Some(JsonRpcResponse::err(id, -5, "transaction not in mempool"));
            }
            let all_txids = state.mempool.get_txids();
            let mut descendants = Vec::new();
            let mut visited = std::collections::HashSet::new();
            let mut stack = vec![txid_bytes];
            while let Some(current) = stack.pop() {
                if !visited.insert(current) { continue; }
                for &child_id in &all_txids {
                    if let Some(child) = state.mempool.get_transaction(&child_id) {
                        if child.inputs.iter().any(|i| i.prev_output.txid == current) {
                            descendants.push(hex::encode(child_id));
                            stack.push(child_id);
                        }
                    }
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!(descendants))
        }
        // ── listunspent ──────────────────────────────────────────
        "listunspent" => {
            let _minconf = params.first().and_then(|v| v.as_u64()).unwrap_or(1);
            let _maxconf = params.get(1).and_then(|v| v.as_u64()).unwrap_or(9_999_999);
            let addresses: Vec<&str> = match params.get(2).and_then(|v| v.as_array()) {
                Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect(),
                None => Vec::new(),
            };
            let utxo_set = state.node.utxo_set();
            let height = state.node.get_height();
            let mut results = Vec::new();
            for (outpoint, utxo) in utxo_set.iter() {
                let confs = height.saturating_sub(utxo.height) + 1;
                if confs < _minconf || confs > _maxconf { continue; }
                if !addresses.is_empty() {
                    let matches = addresses.iter().any(|a| {
                        tx::Address::decode(a)
                            .map(|addr| addr.to_script_pubkey() == utxo.output.script_pubkey)
                            .unwrap_or(false)
                    });
                    if !matches { continue; }
                }
                let spk = &utxo.output.script_pubkey;
                let addr = if spk.len() == 22 && spk[0] == 0x00 && spk[1] == 0x14 {
                    let mut hash = [0u8; 20];
                    hash.copy_from_slice(&spk[2..22]);
                    let net_str = match state.node.network() {
                        crate::config::Network::Testnet => "testnet",
                        _ => "mainnet",
                    };
                    tx::bech32m::encode_p2wpkh_address(&hash, net_str)
                        .unwrap_or_else(|_| hex::encode(spk))
                } else {
                    hex::encode(spk)
                };
                results.push(serde_json::json!({
                    "txid": hex::encode(outpoint.txid),
                    "vout": outpoint.vout,
                    "address": addr,
                    "scriptPubKey": hex::encode(&utxo.output.script_pubkey),
                    "amount": utxo.output.value,
                    "confirmations": confs,
                    "spendable": true,
                }));
            }
            JsonRpcResponse::ok(id, serde_json::json!(results))
        }
        // ── signrawtransactionwithkey ───────────────────────────
        "signrawtransactionwithkey" => {
            let tx_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing tx hex")),
            };
            let privkey_hexes: Vec<&str> = match params.get(1).and_then(|v| v.as_array()) {
                Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing privkeys array")),
            };
            let tx_bytes = match hex::decode(tx_hex) {
                Ok(b) => b,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad hex: {e}"))),
            };
            let mut transaction: tx::Transaction = match bincode::deserialize(&tx_bytes) {
                Ok(t) => t,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("bad tx: {e}"))),
            };
            let privkeys: Vec<tx::PrivateKey> = privkey_hexes.iter().filter_map(|h| {
                let bytes = hex::decode(h).ok()?;
                if bytes.len() == 32 {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    tx::PrivateKey::from_bytes(&arr).ok()
                } else {
                    None
                }
            }).collect();
            let mut signed_count = 0;
            let mut errors = Vec::new();
            for i in 0..transaction.inputs.len() {
                let is_coinbase = transaction.inputs[i].prev_output.is_null();
                if is_coinbase { continue; }
                let mut signed = false;
                for key in &privkeys {
                    if transaction.sign_input(i, key).is_ok() {
                        signed = true;
                        signed_count += 1;
                        break;
                    }
                }
                if !signed {
                    let prev = &transaction.inputs[i].prev_output;
                    errors.push(serde_json::json!({
                        "txid": hex::encode(prev.txid),
                        "vout": prev.vout,
                        "error": "Unable to sign input with provided keys",
                    }));
                }
            }
            let raw = hex::encode(bincode::serialize(&transaction).unwrap_or_default());
            let complete = errors.is_empty() && signed_count > 0;
            JsonRpcResponse::ok(id, serde_json::json!({
                "hex": raw,
                "complete": complete,
                "errors": errors,
            }))
        }
        // ── getaddressinfo ──────────────────────────────────────
        "getaddressinfo" => {
            let addr_str = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            match tx::Address::decode(addr_str) {
                Ok(addr) => {
                    let addr_type = match addr.address_type {
                        tx::AddressType::P2PKH => "p2pkh",
                        tx::AddressType::P2SH => "p2sh",
                        tx::AddressType::P2WPKH => "p2wpkh",
                        tx::AddressType::P2WSH => "p2wsh",
                        tx::AddressType::P2TR => "p2tr",
                    };
                    let is_witness = matches!(addr.address_type,
                        tx::AddressType::P2WPKH | tx::AddressType::P2WSH | tx::AddressType::P2TR);
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "address": addr_str,
                        "isvalid": true,
                        "type": addr_type,
                        "iswitness": is_witness,
                        "scriptPubKey": hex::encode(&addr.to_script_pubkey()),
                    }))
                }
                Err(_) => {
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "address": addr_str,
                        "isvalid": false,
                    }))
                }
            }
        }
        // ── createrawtransaction ────────────────────────────────
        "createrawtransaction" => {
            let inputs_arr = match params.first().and_then(|v| v.as_array()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing inputs array")),
            };
            let outputs_obj = match params.get(1).and_then(|v| v.as_object()) {
                Some(o) => o,
                None => return Some(JsonRpcResponse::err(id, -1, "missing outputs object")),
            };
            let lock_time = params.get(2).and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            let mut tx_inputs = Vec::new();
            for inp in inputs_arr {
                let txid_hex = match inp.get("txid").and_then(|v| v.as_str()) {
                    Some(h) => h,
                    None => return Some(JsonRpcResponse::err(id, -1, "input missing txid")),
                };
                let vout = match inp.get("vout").and_then(|v| v.as_u64()) {
                    Some(v) => v as u32,
                    None => return Some(JsonRpcResponse::err(id, -1, "input missing vout")),
                };
                let sequence = inp.get("sequence").and_then(|v| v.as_u64()).unwrap_or(0xffffffff) as u32;
                let txid_bytes = match hex::decode(txid_hex) {
                    Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                    _ => return Some(JsonRpcResponse::err(id, -1, "invalid input txid hex")),
                };
                let mut input = tx::TxInput::new(tx::OutPoint::new(txid_bytes, vout), Vec::new());
                input.sequence = sequence;
                tx_inputs.push(input);
            }
            let mut tx_outputs = Vec::new();
            for (addr, amount) in outputs_obj {
                let value = match amount.as_u64().or_else(|| amount.as_f64().map(|f| f as u64)) {
                    Some(v) => v,
                    None => return Some(JsonRpcResponse::err(id, -1, format!("invalid amount for {addr}"))),
                };
                let script_pubkey = match tx::Address::decode(addr) {
                    Ok(a) => a.to_script_pubkey(),
                    Err(_) => return Some(JsonRpcResponse::err(id, -1, format!("invalid address: {addr}"))),
                };
                tx_outputs.push(tx::TxOutput::new(value, script_pubkey));
            }
            let transaction = tx::Transaction::new(tx_inputs, tx_outputs, lock_time);
            let raw = hex::encode(bincode::serialize(&transaction).unwrap_or_default());
            JsonRpcResponse::ok(id, serde_json::json!(raw))
        }
        // ── verifychain ─────────────────────────────────────────
        "verifychain" => {
            let nblocks = params.get(1).and_then(|v| v.as_u64()).unwrap_or(0);
            let height = state.node.get_height();
            let check_depth = if nblocks == 0 { height } else { nblocks.min(height) };
            let start = height.saturating_sub(check_depth);
            let mut prev_hash = state.node.get_block_hash(start)
                .unwrap_or([0u8; 32]);
            let mut verified = true;
            for h in (start + 1)..=height {
                match state.node.get_block_hash(h) {
                    Some(hash) => {
                        if let Some(block) = state.node.get_block(&hash) {
                            if block.header.prev_hash != prev_hash {
                                verified = false;
                                break;
                            }
                            if !consensus::verify_pow(&block.header) {
                                verified = false;
                                break;
                            }
                            prev_hash = hash;
                        } else {
                            verified = false;
                            break;
                        }
                    }
                    None => { verified = false; break; }
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!(verified))
        }
        // ── gettxoutsetinfo ─────────────────────────────────────
        "gettxoutsetinfo" => {
            let utxo_set = state.node.utxo_set();
            let total_amount: u64 = utxo_set.iter().map(|(_, u)| u.output.value).sum();
            let txout_count = utxo_set.len();
            use sha2::{Sha256, Digest};
            let mut hasher = Sha256::new();
            let mut serialized_size = 0usize;
            for (op, u) in utxo_set.iter() {
                hasher.update(&op.txid);
                hasher.update(&op.vout.to_le_bytes());
                hasher.update(&u.output.value.to_le_bytes());
                hasher.update(&u.output.script_pubkey);
                serialized_size += 32 + 4 + 8 + u.output.script_pubkey.len();
            }
            let hash = hasher.finalize();
            let hash_hex = hex::encode(hash);
            JsonRpcResponse::ok(id, serde_json::json!({
                "height": state.node.get_height(),
                "bestblock": hex::encode(state.node.get_tip()),
                "txouts": txout_count,
                "bogosize": serialized_size,
                "hash_serialized_2": hash_hex,
                "total_amount": total_amount as f64 / 1e8,
            }))
        }

        _ => return None,
    };
    Some(resp)
}
