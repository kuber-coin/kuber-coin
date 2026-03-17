//! Mining-related JSON-RPC handlers (getblocktemplate, submitblock, etc.)

use std::sync::Arc;

use crate::rpc::{AppState, JsonRpcResponse};

fn resolve_coinbase_script(
    address: Option<&str>,
    coinbase_script_hex: Option<&str>,
) -> Result<Vec<u8>, String> {
    if let Some(script_hex) = coinbase_script_hex {
        return hex::decode(script_hex).map_err(|e| format!("bad script_pubkey hex: {e}"));
    }

    let address = address.unwrap_or("");
    if address.is_empty() {
        return Err("missing payout address".to_string());
    }

    tx::Address::decode(address)
        .map(|addr| addr.to_script_pubkey())
        .map_err(|e| format!("invalid payout address: {e}"))
}

fn filter_template_entries<F>(
    entries: Vec<crate::mempool::BlockTemplateEntry>,
    base_view: &chain::UtxoSet,
    next_height: u64,
    mtp_fn: &F,
) -> Vec<crate::mempool::BlockTemplateEntry>
where
    F: Fn(u64) -> u64 + Sync,
{
    let mut view = base_view.clone();
    let mut accepted = Vec::new();

    for entry in entries {
        if consensus::validator::validate_transaction_cached(
            &entry.tx,
            &view,
            next_height,
            None,
            Some(mtp_fn),
        )
        .is_err()
        {
            continue;
        }
        if view.apply_transaction(&entry.tx, next_height).is_err() {
            continue;
        }
        accepted.push(entry);
    }

    accepted
}

fn validated_template_entries(
    state: &AppState,
    max_weight: usize,
    next_height: u64,
) -> Vec<crate::mempool::BlockTemplateEntry> {
    let view = state.node.utxo_set().clone();
    let mtp_fn = |h: u64| state.node.get_mtp(h);
    filter_template_entries(state.mempool.get_block_template_entries(max_weight), &view, next_height, &mtp_fn)
}

fn evaluate_block_proposal(state: &AppState, block: &chain::Block) -> serde_json::Value {
    if !consensus::verify_pow(&block.header) {
        return serde_json::json!("high-hash");
    }

    let expected_prev = state.node.get_tip();
    if block.header.prev_hash != expected_prev {
        return serde_json::json!("inconclusive");
    }

    let expected_height = state.node.get_height() + 1;
    if block.header.height != expected_height {
        return serde_json::json!("bad-cb-height");
    }

    let expected_bits = state
        .node
        .calculate_next_bits_with_timestamp(expected_height, block.header.timestamp);
    if block.header.bits != expected_bits {
        return serde_json::json!("bad-diffbits");
    }

    let max_future_timestamp = unix_time_secs()
        .saturating_add(consensus::params::MAX_FUTURE_BLOCK_TIME_SECS);
    if block.header.timestamp > max_future_timestamp {
        return serde_json::json!("time-too-new");
    }

    let mtp_fn = |h: u64| state.node.get_mtp(h);
    let utxo_guard = state.node.utxo_set();
    match consensus::validator::validate_block_cached(block, &utxo_guard, None, Some(&mtp_fn)) {
        Ok(()) => serde_json::Value::Null,
        Err(consensus::ValidationError::InvalidMerkleRoot) => serde_json::json!("bad-txnmrklroot"),
        Err(consensus::ValidationError::InvalidCoinbasePosition)
        | Err(consensus::ValidationError::MultipleCoinbase) => serde_json::json!("bad-cb-missing"),
        Err(consensus::ValidationError::ExcessiveCoinbaseReward) => serde_json::json!("bad-cb-amount"),
        Err(consensus::ValidationError::TimestampBeforeMTP) => serde_json::json!("time-too-old"),
        Err(consensus::ValidationError::BlockTooHeavy) => serde_json::json!("bad-blk-weight"),
        Err(consensus::ValidationError::TooManySigops) => serde_json::json!("bad-blk-sigops"),
        Err(consensus::ValidationError::DuplicateTxid) => serde_json::json!("bad-txns-BIP30"),
        Err(_) => serde_json::json!("rejected"),
    }
}

fn unix_time_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn choose_block_timestamp(now: u64, mtp: u64, parent_timestamp: u64) -> u64 {
    now.max(mtp.saturating_add(1)).max(parent_timestamp.saturating_add(1))
}

fn append_witness_commitment_if_needed(coinbase: &mut tx::Transaction, txs: &[tx::Transaction]) {
    let has_witness = txs.iter().skip(1).any(|transaction| {
        transaction.inputs.iter().any(|input| !input.witness.is_empty())
    });
    if !has_witness {
        return;
    }

    let nonce = vec![0u8; 32];
    coinbase.inputs[0].witness = tx::Witness::from_stack(vec![nonce.clone()]);

    let mut with_coinbase = Vec::with_capacity(txs.len());
    with_coinbase.push(coinbase.clone());
    with_coinbase.extend(txs.iter().skip(1).cloned());
    let witness_root = chain::Block::calculate_witness_merkle_root(&with_coinbase);

    use sha2::{Digest, Sha256};
    let mut payload = Vec::with_capacity(64);
    payload.extend_from_slice(&witness_root);
    payload.extend_from_slice(&nonce);
    let h1 = Sha256::digest(&payload);
    let commitment: [u8; 32] = Sha256::digest(h1).into();

    let mut script = vec![0x6a, 0x24, 0xaa, 0x21, 0xa9, 0xed];
    script.extend_from_slice(&commitment);
    coinbase.outputs.push(tx::TxOutput::new(0, script));
}

pub(crate) async fn dispatch(
    state: &Arc<AppState>,
    method: &str,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> Option<JsonRpcResponse> {
    let resp = match method {
        "getblocktemplate" => handle_getblocktemplate(state, params, id),
        "getblocktemplate_longpoll" => {
            handle_getblocktemplate_longpoll(state, params, id).await
        }
        "submitblock" => handle_submitblock(state, params, id),
        // ── startmining / stopmining / setgenerate ───────────────
        // These stubs acknowledge the command from native mining UIs.
        // Actual CPU mining is driven externally via getblocktemplate/submitblock.
        "startmining" | "setgenerate" => {
            JsonRpcResponse::ok(id, serde_json::json!(null))
        }
        "stopmining" => {
            JsonRpcResponse::ok(id, serde_json::json!(null))
        }
        // ── getmininginfo ───────────────────────────────────────
        "getmininginfo" => {
            let height = state.node.get_height();
            let bits = state.node.calculate_next_bits(height + 1);
            let net = match state.node.network() {
                crate::config::Network::Testnet => testnet::Network::Testnet,
                crate::config::Network::Regtest => testnet::Network::Regtest,
                _ => testnet::Network::Mainnet,
            };
            let reward = testnet::NetworkParams::for_network(net).block_reward(height + 1);
            JsonRpcResponse::ok(id, serde_json::json!({
                "blocks": height,
                "difficulty": bits,
                "networkhashps": 0,
                "chain": format!("{:?}", state.node.network()),
                "reward": reward,
            }))
        }
        // ── generatetoaddress (regtest/testnet mining) ──────────
        "generatetoaddress" => {
            let nblocks = match params.first().and_then(|v| v.as_u64()) {
                Some(n) => n,
                None => return Some(JsonRpcResponse::err(id, -1, "missing nblocks")),
            };
            let address = match params.get(1).and_then(|v| v.as_str()) {
                Some(a) => a.to_string(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let net = state.node.network();
            if net == crate::config::Network::Mainnet {
                return Some(JsonRpcResponse::err(id, -1, "generatetoaddress only on testnet/regtest"));
            }
            let mut hashes = Vec::new();
            for _ in 0..nblocks.min(500) {
                let height = state.node.get_height() + 1;
                let prev_hash = state.node.get_tip();
                let now = unix_time_secs();
                let mtp = state.node.get_mtp(height);
                let parent_timestamp = state
                    .node
                    .get_block(&prev_hash)
                    .map(|block| block.header.timestamp)
                    .unwrap_or(0);
                let timestamp = choose_block_timestamp(now, mtp, parent_timestamp);
                let bits = state.node.calculate_next_bits_with_timestamp(height, timestamp);
                let script_pubkey = match resolve_coinbase_script(Some(&address), None) {
                    Ok(script) => script,
                    Err(e) => return Some(JsonRpcResponse::err(id, -1, e)),
                };
                let mut coinbase = tx::Transaction::new_coinbase(
                    height, consensus::params::block_subsidy(height), script_pubkey,
                );
                let txs = {
                    let mempool_txs = validated_template_entries(state, 4_000_000, height)
                        .into_iter()
                        .map(|entry| entry.tx)
                        .collect::<Vec<_>>();
                    let mut all = vec![coinbase.clone()];
                    all.extend(mempool_txs.clone());
                    append_witness_commitment_if_needed(&mut coinbase, &all);
                    let mut all = vec![coinbase];
                    all.extend(mempool_txs);
                    all
                };
                let merkle_root = chain::Block::calculate_merkle_root(&txs);
                let header = chain::BlockHeader {
                    version: 0x2000_0000,
                    height,
                    prev_hash,
                    merkle_root,
                    timestamp,
                    bits,
                    nonce: 0,
                };
                let mut block = chain::Block::new(header, txs);
                for nonce in 0..u64::MAX {
                    block.header.nonce = nonce;
                    if consensus::verify_pow(&block.header) {
                        break;
                    }
                }
                let hash = block.hash();
                if let Err(e) = state.node.add_block(&block) {
                    return Some(JsonRpcResponse::err(id, -1, format!("block rejected: {e}")));
                }
                state.mempool.remove_block_transactions(&block);
                hashes.push(hex::encode(hash));
            }
            JsonRpcResponse::ok(id, serde_json::json!(hashes))
        }

        _ => return None,
    };
    Some(resp)
}

// ── Mining helpers ──────────────────────────────────────────

fn handle_getblocktemplate(
    state: &AppState,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> JsonRpcResponse {
    let (mode, address, coinbase_script_hex) = if let Some(obj) = params.first().and_then(|v| v.as_object()) {
        let mode = obj
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("template");
        let addr = obj.get("address").and_then(|v| v.as_str()).unwrap_or("");
        let spk = obj
            .get("coinbase_script")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        (mode, addr.to_string(), spk)
    } else {
        let addr = params.first().and_then(|v| v.as_str()).unwrap_or("");
        let spk = params.get(1).and_then(|v| v.as_str()).map(|s| s.to_string());
        ("template", addr.to_string(), spk)
    };

    if mode == "proposal" {
        let block_hex = params
            .get(1)
            .and_then(|v| v.as_str())
            .or_else(|| {
                params
                    .first()
                    .and_then(|v| v.as_object())
                    .and_then(|o| o.get("data"))
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("");
        let block_bytes = match hex::decode(block_hex) {
            Ok(b) => b,
            Err(e) => return JsonRpcResponse::err(id, -1, format!("bad block hex: {e}")),
        };
        let block: chain::Block = match bincode::deserialize(&block_bytes) {
            Ok(b) => b,
            Err(e) => return JsonRpcResponse::err(id, -1, format!("bad block data: {e}")),
        };
        return JsonRpcResponse::ok(id, evaluate_block_proposal(state, &block));
    }

    let height = state.node.get_height() + 1;
    let prev_hash = state.node.get_tip();
    let coinbase_script = match resolve_coinbase_script(
        Some(&address),
        coinbase_script_hex.as_deref(),
    ) {
        Ok(script) => script,
        Err(e) => return JsonRpcResponse::err(id, -1, e),
    };

    let net = match state.node.network() {
        crate::config::Network::Testnet => testnet::Network::Testnet,
        crate::config::Network::Regtest => testnet::Network::Regtest,
        _ => testnet::Network::Mainnet,
    };
    let params_net = testnet::NetworkParams::for_network(net);
    let reward = params_net.block_reward(height);

    let max_weight: usize = 4_000_000;
    let template_entries = validated_template_entries(state, max_weight, height);
    let total_fees: u64 = template_entries.iter().map(|e| e.fee).sum();
    let total_sigops: usize = template_entries.iter().map(|e| e.sigops).sum();
    let total_weight: usize = template_entries.iter().map(|e| e.weight).sum();

    let tx_json: Vec<serde_json::Value> = template_entries.iter().map(|e| {
        let tx_bytes = bincode::serialize(&e.tx).unwrap_or_default();
        serde_json::json!({
            "data": hex::encode(&tx_bytes),
            "txid": hex::encode(e.txid),
            "fee": e.fee,
            "sigops": e.sigops,
            "weight": e.weight,
            "depends": e.depends,
        })
    }).collect();

    let mut coinbase_tx = tx::Transaction::new_coinbase(
        height,
        reward.saturating_add(total_fees),
        coinbase_script,
    );

    let mut preview_txs = vec![coinbase_tx.clone()];
    preview_txs.extend(template_entries.iter().map(|e| e.tx.clone()));
    append_witness_commitment_if_needed(&mut coinbase_tx, &preview_txs);

    let mut all_txs = vec![coinbase_tx.clone()];
    all_txs.extend(template_entries.iter().map(|e| e.tx.clone()));

    let merkle_root = chain::Block::calculate_merkle_root(&all_txs);
    let now = unix_time_secs();
    let mtp = state.node.get_mtp(height);
    let parent_timestamp = state
        .node
        .get_block(&prev_hash)
        .map(|block| block.header.timestamp)
        .unwrap_or(0);
    let timestamp = choose_block_timestamp(now, mtp, parent_timestamp);
    let bits = state.node.calculate_next_bits_with_timestamp(height, timestamp);
    let min_timestamp = mtp.saturating_add(1).max(parent_timestamp.saturating_add(1));

    let header = chain::BlockHeader::with_height(prev_hash, merkle_root, timestamp, bits, 0, height);
    let block = chain::Block::new(header, all_txs);

    let block_bytes = match bincode::serialize(&block) {
        Ok(b) => b,
        Err(e) => return JsonRpcResponse::err(id, -1, format!("block serialization failed: {e}")),
    };
    let block_hex = hex::encode(&block_bytes);

    let target = consensus::bits_to_target(bits);
    let coinbase_bytes = bincode::serialize(&coinbase_tx).unwrap_or_default();

    JsonRpcResponse::ok(
        id,
        serde_json::json!({
            "block": block_hex,
            "version": block.header.version,
            "previousblockhash": hex::encode(prev_hash),
            "transactions": tx_json,
            "coinbasevalue": reward.saturating_add(total_fees),
            "coinbasetxn": hex::encode(&coinbase_bytes),
            "target": hex::encode(target),
            "bits": format!("{bits:#010x}"),
            "height": height,
            "curtime": timestamp,
            "mintime": min_timestamp,
            "mutable": ["time", "transactions/add", "prevblock", "coinbase/append"],
            "capabilities": ["proposal", "longpoll"],
            "longpollid": make_longpollid(&prev_hash, template_entries.len()),
            "sigoplimit": 80_000,
            "sizelimit": 4_000_000,
            "weightlimit": 4_000_000,
            "totalfee": total_fees,
            "totalsigops": total_sigops,
            "totalweight": total_weight,
            "txcount": template_entries.len(),
        }),
    )
}

fn make_longpollid(tip: &[u8; 32], mempool_count: usize) -> String {
    format!("{}:{}", hex::encode(tip), mempool_count)
}

fn parse_longpollid(id: &str) -> Option<(String, usize)> {
    let (tip_hex, count_str) = id.rsplit_once(':')?;
    let count = count_str.parse().ok()?;
    Some((tip_hex.to_string(), count))
}

async fn handle_getblocktemplate_longpoll(
    state: &Arc<AppState>,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> JsonRpcResponse {
    let longpollid = params.get(2).and_then(|v| v.as_str());

    if let Some(lpid) = longpollid {
        if let Some((old_tip_hex, old_count)) = parse_longpollid(lpid) {
            let current_tip = hex::encode(state.node.get_tip());
            let current_count = state.mempool.count();
            if current_tip == old_tip_hex && current_count == old_count {
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    state.template_notify.notified(),
                )
                .await;
            }
        }
    }

    handle_getblocktemplate(state, params, id)
}

fn handle_submitblock(
    state: &AppState,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> JsonRpcResponse {
    let block_hex = match params.first().and_then(|v| v.as_str()) {
        Some(h) => h,
        None => return JsonRpcResponse::err(id, -1, "missing block hex"),
    };

    let block_bytes = match hex::decode(block_hex) {
        Ok(b) => b,
        Err(e) => return JsonRpcResponse::err(id, -1, format!("invalid hex: {e}")),
    };

    let block: chain::Block = match bincode::deserialize(&block_bytes) {
        Ok(b) => b,
        Err(e) => return JsonRpcResponse::err(id, -1, format!("invalid block: {e}")),
    };

    if !consensus::verify_pow(&block.header) {
        return JsonRpcResponse::err(id, -1, "PoW check failed");
    }

    match state.node.add_block(&block) {
        Ok(()) => {
            state.mempool.remove_block_transactions(&block);
            tracing::info!(
                height = block.header.height,
                hash = %hex::encode(block.hash()),
                txs = block.transactions.len(),
                "Accepted mined block"
            );
            JsonRpcResponse::ok(id, serde_json::json!("accepted"))
        }
        Err(e) => JsonRpcResponse::err(id, -1, format!("block rejected: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        choose_block_timestamp, evaluate_block_proposal, filter_template_entries,
        resolve_coinbase_script,
    };
    use crate::{mempool::Mempool, rpc::AppState, state::NodeState};
    use chain::{UTXO, UtxoSet};
    use tx::{OutPoint, PrivateKey, Transaction, TxInput, TxOutput};
    use std::sync::Arc;
    use tempfile::TempDir;

    #[test]
    fn choose_block_timestamp_respects_mtp_and_parent() {
        assert_eq!(choose_block_timestamp(100, 150, 125), 151);
        assert_eq!(choose_block_timestamp(200, 150, 225), 226);
        assert_eq!(choose_block_timestamp(300, 150, 225), 300);
    }

    #[test]
    fn choose_block_timestamp_saturates_at_u64_max() {
        assert_eq!(choose_block_timestamp(1, u64::MAX, 0), u64::MAX);
        assert_eq!(choose_block_timestamp(1, 0, u64::MAX), u64::MAX);
    }

    #[test]
    fn resolve_coinbase_script_rejects_invalid_address_without_fallback() {
        let result = resolve_coinbase_script(Some("not-a-real-address"), None);
        assert!(result.is_err());
    }

    #[test]
    fn resolve_coinbase_script_accepts_explicit_script_hex() {
        let result = resolve_coinbase_script(Some("not-a-real-address"), Some("51")).unwrap();
        assert_eq!(result, vec![0x51]);
    }

    fn mining_test_state() -> (TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        let config = crate::Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };
        let node = NodeState::new(config).unwrap();
        let state = Arc::new(AppState {
            node,
            mempool: Arc::new(Mempool::new(10 * 1024 * 1024)),
            peers: None,
            start_time: std::time::Instant::now(),
            template_notify: Arc::new(tokio::sync::Notify::new()),
            wallet_mgr: None,
            loaded_wallet: parking_lot::Mutex::new(None),
            api_keys: vec![],
        });
        (dir, state)
    }

    fn mine_header(header: &mut chain::BlockHeader) {
        for nonce in 0..u64::MAX {
            header.nonce = nonce;
            if consensus::verify_pow(header) {
                return;
            }
        }
        panic!("failed to mine test header");
    }

    fn build_candidate_block(state: &AppState) -> chain::Block {
        let height = state.node.get_height() + 1;
        let prev_hash = state.node.get_tip();
        let bits = state.node.calculate_next_bits(height);
        let reward = testnet::NetworkParams::for_network(testnet::Network::Regtest).block_reward(height);
        let coinbase = Transaction::new_coinbase(height, reward, vec![0x51]);
        let merkle_root = chain::Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let parent_timestamp = state
            .node
            .get_block(&prev_hash)
            .map(|block| block.header.timestamp)
            .unwrap_or(0);
        let timestamp = choose_block_timestamp(super::unix_time_secs(), state.node.get_mtp(height), parent_timestamp);
        let mut header = chain::BlockHeader::with_height(prev_hash, merkle_root, timestamp, bits, 0, height);
        mine_header(&mut header);
        chain::Block::new(header, vec![coinbase])
    }

    #[test]
    fn filter_template_entries_drops_chain_conflict_and_keeps_valid_package() {
        let mut utxo_set = UtxoSet::new();
        let shared_prev = OutPoint::new([0x11; 32], 0);
        let privkey = PrivateKey::new();
        let pubkey_hash = privkey.public_key().hash();
        let child_privkey = PrivateKey::new();
        let child_pubkey_hash = child_privkey.public_key().hash();
        utxo_set.add_utxo(
            shared_prev,
            UTXO::new(TxOutput::new_p2pkh(10_000, pubkey_hash), 1, false),
        );

        let mut valid_parent = Transaction::new(
            vec![TxInput::new(shared_prev, vec![])],
            vec![TxOutput::new_p2pkh(8_000, child_pubkey_hash)],
            0,
        );
        valid_parent.sign_input(0, &privkey).unwrap();

        let mut invalid_conflict = Transaction::new(
            vec![TxInput::new(shared_prev, vec![])],
            vec![TxOutput::new(7_000, vec![0x51])],
            0,
        );
        invalid_conflict.sign_input(0, &privkey).unwrap();

        let mut valid_child = Transaction::new(
            vec![TxInput::new(OutPoint::new(valid_parent.txid(), 0), vec![])],
            vec![TxOutput::new(6_000, vec![0x51])],
            0,
        );
        valid_child.sign_input(0, &child_privkey).unwrap();

        let entries = vec![
            crate::mempool::BlockTemplateEntry {
                tx: valid_parent.clone(),
                txid: valid_parent.txid(),
                fee: 1_000,
                sigops: 0,
                weight: 400,
                depends: vec![],
            },
            crate::mempool::BlockTemplateEntry {
                tx: invalid_conflict.clone(),
                txid: invalid_conflict.txid(),
                fee: 2_000,
                sigops: 0,
                weight: 400,
                depends: vec![],
            },
            crate::mempool::BlockTemplateEntry {
                tx: valid_child.clone(),
                txid: valid_child.txid(),
                fee: 500,
                sigops: 0,
                weight: 400,
                depends: vec![0],
            },
        ];

        let filtered = filter_template_entries(entries, &utxo_set, 2, &|_| 0);

        assert_eq!(filtered.len(), 2);
        assert_eq!(filtered[0].txid, valid_parent.txid());
        assert_eq!(filtered[1].txid, valid_child.txid());
    }

    #[test]
    fn evaluate_block_proposal_accepts_valid_tip_extension() {
        let (_dir, state) = mining_test_state();
        let block = build_candidate_block(&state);

        assert_eq!(evaluate_block_proposal(&state, &block), serde_json::Value::Null);
    }

    #[test]
    fn evaluate_block_proposal_rejects_unexpected_bits() {
        let (_dir, state) = mining_test_state();
        let mut block = build_candidate_block(&state);
        block.header.bits ^= 1;
        mine_header(&mut block.header);

        assert_eq!(evaluate_block_proposal(&state, &block), serde_json::json!("bad-diffbits"));
    }

    #[test]
    fn evaluate_block_proposal_rejects_bad_merkle_root() {
        let (_dir, state) = mining_test_state();
        let mut block = build_candidate_block(&state);
        block.header.merkle_root = [0x55; 32];
        mine_header(&mut block.header);

        assert_eq!(evaluate_block_proposal(&state, &block), serde_json::json!("bad-txnmrklroot"));
    }
}
