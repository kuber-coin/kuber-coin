//! Wallet-related JSON-RPC handlers

use std::sync::Arc;

use crate::rpc::{AppState, JsonRpcResponse, LoadedWallet};

fn require_unlocked(lw: &mut LoadedWallet, id: &serde_json::Value) -> Result<(), JsonRpcResponse> {
    lw.refresh_lock_state();
    if !lw.is_unlocked() {
        return Err(JsonRpcResponse::err(
            id.clone(),
            -13,
            "wallet is locked; call walletpassphrase first",
        ));
    }
    Ok(())
}

fn persist_loaded_wallet(
    state: &Arc<AppState>,
    lw: &LoadedWallet,
    id: &serde_json::Value,
) -> Result<(), JsonRpcResponse> {
    let mgr = match state.wallet_mgr.as_ref() {
        Some(mgr) => mgr,
        None => {
            return Err(JsonRpcResponse::err(
                id.clone(),
                -1,
                "wallet manager not available",
            ));
        }
    };
    mgr.save_wallet(&lw.name, &lw.wallet, lw.password.as_deref(), lw.encrypted)
        .map_err(|e| JsonRpcResponse::err(id.clone(), -1, format!("wallet save failed: {e}")))
}

pub(crate) fn dispatch(
    state: &Arc<AppState>,
    method: &str,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> Option<JsonRpcResponse> {
    let resp = match method {
        // ── getnewaddress ───────────────────────────────────────
        "getnewaddress" => {
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded; use loadwallet or createwallet first")),
            };
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot generate keys"));
            }
            if let Err(resp) = require_unlocked(lw, &id) {
                return Some(resp);
            }
            let key = tx::PrivateKey::new();
            let pubkey = key.public_key();
            let addr = tx::Address::from_pubkey_p2wpkh(&pubkey);
            let addr_str = addr.encode();
            lw.wallet.private_keys.push(hex::encode(&*key.to_bytes()));
            lw.wallet.addresses.push(addr_str.clone());
            if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                return Some(resp);
            }
            JsonRpcResponse::ok(id, serde_json::json!({
                "address": addr_str,
            }))
        }
        // ── getbalance ──────────────────────────────────────────
        "getbalance" => {
            let address = params.first().and_then(|v| v.as_str()).unwrap_or("");
            if address.is_empty() {
                return Some(JsonRpcResponse::ok(id, serde_json::json!(0)));
            }
            let script_pubkey = match tx::Address::decode(address) {
                Ok(a) => a.to_script_pubkey(),
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address")),
            };
            let utxo_set = state.node.utxo_set();
            let balance: u64 = utxo_set.iter()
                .filter(|(_, u)| u.output.script_pubkey == script_pubkey)
                .map(|(_, u)| u.output.value)
                .sum();
            JsonRpcResponse::ok(id, serde_json::json!(balance))
        }
        // ── listtransactions ────────────────────────────────────
        "listtransactions" => {
            let address = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let count = params.get(1).and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let skip = params.get(2).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let script_pubkey = match tx::Address::decode(address) {
                Ok(a) => a.to_script_pubkey(),
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address")),
            };
            let height = state.node.get_height();
            let mut results = Vec::new();
            'outer: for h in (0..=height).rev() {
                if let Some(bhash) = state.node.get_block_hash(h) {
                    if let Some(block) = state.node.get_block(&bhash) {
                        for txn in &block.transactions {
                            let is_send = txn.inputs.iter().any(|inp| {
                                if inp.prev_output.is_null() { return false; }
                                state.node.get_utxo(&inp.prev_output.txid, inp.prev_output.vout)
                                    .map(|u| u.output.script_pubkey == script_pubkey)
                                    .unwrap_or(false)
                            });
                            let is_recv = txn.outputs.iter().any(|o| o.script_pubkey == script_pubkey);
                            if is_send || is_recv {
                                let category = if is_send { "send" } else { "receive" };
                                let amount: u64 = txn.outputs.iter()
                                    .filter(|o| o.script_pubkey == script_pubkey)
                                    .map(|o| o.value)
                                    .sum();
                                results.push(serde_json::json!({
                                    "txid": hex::encode(txn.txid()),
                                    "category": category,
                                    "amount": amount,
                                    "confirmations": height.saturating_sub(h) + 1,
                                    "blockhash": hex::encode(bhash),
                                    "blockheight": h,
                                    "time": block.header.timestamp,
                                }));
                                if results.len() >= skip + count { break 'outer; }
                            }
                        }
                    }
                }
            }
            let page: Vec<_> = results.into_iter().skip(skip).take(count).collect();
            JsonRpcResponse::ok(id, serde_json::json!(page))
        }
        // ── importprivkey ───────────────────────────────────────
        "importprivkey" => {
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            lw.refresh_lock_state();
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot import private keys"));
            }
            if lw.encrypted {
                if let Err(resp) = require_unlocked(lw, &id) {
                    return Some(resp);
                }
            }
            let key_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing private key hex")),
            };
            let key_bytes = match hex::decode(key_hex) {
                Ok(b) if b.len() == 32 => { let mut arr = [0u8; 32]; arr.copy_from_slice(&b); arr }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid private key hex (need 32 bytes)")),
            };
            let key = match tx::PrivateKey::from_bytes(&key_bytes) {
                Ok(k) => k,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("invalid key: {e}"))),
            };
            let pubkey = key.public_key();
            let addr = tx::Address::from_pubkey_p2wpkh(&pubkey);
            let stored_hex = hex::encode(&key_bytes);
            if !lw.wallet.private_keys.contains(&stored_hex) {
                lw.wallet.private_keys.push(stored_hex);
                lw.wallet.addresses.push(addr.encode());
                if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                    return Some(resp);
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!({
                "address": addr.encode(),
                "pubkey": hex::encode(pubkey.to_bytes()),
            }))
        }
        // ── dumpprivkey ─────────────────────────────────────────
        "dumpprivkey" => {
            let addr_str = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            lw.refresh_lock_state();
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet has no private keys"));
            }
            if !lw.is_unlocked() {
                return Some(JsonRpcResponse::err(id, -13, "wallet is locked; call walletpassphrase first"));
            }
            let idx = lw.wallet.addresses.iter().position(|a| a == addr_str);
            match idx {
                Some(i) if i < lw.wallet.private_keys.len() => {
                    JsonRpcResponse::ok(id, serde_json::json!(lw.wallet.private_keys[i]))
                }
                _ => JsonRpcResponse::err(id, -4, "address not found in wallet"),
            }
        }
        // ── backupwallet ────────────────────────────────────────
        "backupwallet" => {
            let dest = match params.first().and_then(|v| v.as_str()) {
                Some(d) => d,
                None => return Some(JsonRpcResponse::err(id, -1, "missing destination path")),
            };
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            lw.refresh_lock_state();
            let dest_path = std::path::Path::new(dest);
            let pw = if lw.encrypted {
                match &lw.password {
                    Some(p) => Some(p.as_str()),
                    None => return Some(JsonRpcResponse::err(id, -13, "wallet is locked; call walletpassphrase first to enable backup")),
                }
            } else {
                None
            };
            match lw.wallet.save(dest_path, pw) {
                Ok(_) => JsonRpcResponse::ok(id, serde_json::Value::Null),
                Err(e) => JsonRpcResponse::err(id, -1, format!("backup failed: {e}")),
            }
        }
        // ── walletpassphrase / walletlock ────────────────────────
        "walletpassphrase" => {
            let passphrase = match params.first().and_then(|v| v.as_str()) {
                Some(p) => p,
                None => return Some(JsonRpcResponse::err(id, -1, "missing passphrase")),
            };
            let timeout_secs = params.get(1).and_then(|v| v.as_u64()).unwrap_or(60);
            let mut guard = state.loaded_wallet.lock();
            match guard.as_mut() {
                Some(lw) => {
                    if !lw.encrypted {
                        return Some(JsonRpcResponse::err(id, -15, "wallet is not encrypted"));
                    }
                    let mgr = match state.wallet_mgr.as_ref() {
                        Some(m) => m,
                        None => return Some(JsonRpcResponse::err(id, -1, "wallet manager not available")),
                    };
                    match mgr.load_wallet(&lw.name, Some(passphrase)) {
                        Ok(wallet) => {
                            lw.wallet = wallet;
                            lw.passphrase_until = Some(
                                std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs),
                            );
                            lw.password = Some(passphrase.to_string());
                            JsonRpcResponse::ok(id, serde_json::Value::Null)
                        }
                        Err(_) => JsonRpcResponse::err(id, -14, "incorrect passphrase"),
                    }
                }
                None => JsonRpcResponse::err(id, -4, "no wallet loaded"),
            }
        }
        "walletlock" => {
            let mut guard = state.loaded_wallet.lock();
            match guard.as_mut() {
                Some(lw) => {
                    lw.lock_sensitive_state();
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                None => JsonRpcResponse::err(id, -4, "no wallet loaded"),
            }
        }
        // ── encryptwallet ───────────────────────────────────────
        "encryptwallet" => {
            let passphrase = match params.first().and_then(|v| v.as_str()) {
                Some(p) => p,
                None => return Some(JsonRpcResponse::err(id, -1, "missing passphrase")),
            };
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            if lw.encrypted {
                return Some(JsonRpcResponse::err(id, -15, "wallet is already encrypted"));
            }
            let mgr = match state.wallet_mgr.as_ref() {
                Some(m) => m,
                None => return Some(JsonRpcResponse::err(id, -1, "wallet manager not available")),
            };
            match mgr.save_wallet(&lw.name, &lw.wallet, Some(passphrase), true) {
                Ok(_) => {
                    lw.encrypted = true;
                    lw.lock_sensitive_state();
                    JsonRpcResponse::ok(id, serde_json::json!("wallet encrypted; restart to take effect"))
                }
                Err(e) => JsonRpcResponse::err(id, -1, format!("encryption failed: {e}")),
            }
        }
        // ── createwallet ────────────────────────────────────────
        "createwallet" => {
            let name = match params.first().and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing wallet name")),
            };
            let password = params.get(1).and_then(|v| v.as_str());
            if password.is_none() || password.map(|p| p.is_empty()).unwrap_or(true) {
                return Some(JsonRpcResponse::err(id, -1,
                    "passphrase is required; plaintext wallets are not allowed for security"));
            }
            let disable_private_keys = params.get(2)
                .and_then(|v| v.as_bool()).unwrap_or(false);
            let descriptor_wallet = params.get(3)
                .and_then(|v| v.as_bool()).unwrap_or(false);
            let mgr = match state.wallet_mgr.as_ref() {
                Some(m) => m,
                None => return Some(JsonRpcResponse::err(id, -1, "wallet manager not available")),
            };
            if mgr.wallet_exists(&name) {
                return Some(JsonRpcResponse::err(id, -4, "wallet already exists"));
            }
            let key = tx::PrivateKey::new();
            let pubkey = key.public_key();
            let addr = tx::Address::from_pubkey_p2wpkh(&pubkey).encode();
            let wallet = tx::wallet::WalletFile {
                label: name.clone(),
                private_keys: if disable_private_keys { vec![] } else { vec![hex::encode(&*key.to_bytes())] },
                addresses: vec![addr.clone()],
                birthday_height: state.node.get_height(),
                watch_only: disable_private_keys,
                descriptors: if descriptor_wallet {
                    vec![format!("wpkh({})", hex::encode(pubkey.to_bytes()))]
                } else {
                    vec![]
                },
                ..Default::default()
            };
            if let Err(e) = mgr.create_wallet(&name, &wallet, password) {
                return Some(JsonRpcResponse::err(id, -1, format!("create failed: {e}")));
            }
            let mut guard = state.loaded_wallet.lock();
            let mut loaded_wallet = LoadedWallet {
                name: name.clone(),
                wallet,
                passphrase_until: None,
                encrypted: true,
                password: password.map(|p| p.to_string()),
            };
            loaded_wallet.lock_sensitive_state();
            *guard = Some(loaded_wallet);
            JsonRpcResponse::ok(id, serde_json::json!({
                "name": name,
                "address": addr,
                "encrypted": true,
                "watch_only": disable_private_keys,
                "descriptor": descriptor_wallet,
            }))
        }
        // ── loadwallet ──────────────────────────────────────────
        "loadwallet" => {
            let name = match params.first().and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing wallet name")),
            };
            let password = params.get(1).and_then(|v| v.as_str());
            let mgr = match state.wallet_mgr.as_ref() {
                Some(m) => m,
                None => return Some(JsonRpcResponse::err(id, -1, "wallet manager not available")),
            };
            let storage = match mgr.wallet_storage_info(&name) {
                Ok(info) => info,
                Err(e) => return Some(JsonRpcResponse::err(id, -4, format!("load failed: {e}"))),
            };
            match mgr.load_wallet(&name, password) {
                Ok(wallet) => {
                    let mut guard = state.loaded_wallet.lock();
                    let mut loaded_wallet = LoadedWallet {
                        name: name.clone(),
                        wallet,
                        passphrase_until: None,
                        encrypted: storage.encrypted,
                        password: None,
                    };
                    if loaded_wallet.encrypted {
                        loaded_wallet.lock_sensitive_state();
                    }
                    *guard = Some(loaded_wallet);
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "name": name,
                        "encrypted": storage.encrypted,
                    }))
                }
                Err(e) => JsonRpcResponse::err(id, -4, format!("load failed: {e}")),
            }
        }
        // ── unloadwallet ────────────────────────────────────────
        "unloadwallet" => {
            let mut guard = state.loaded_wallet.lock();
            match guard.take() {
                Some(mut lw) => {
                    lw.lock_sensitive_state();
                    JsonRpcResponse::ok(id, serde_json::json!({ "name": lw.name }))
                }
                None => JsonRpcResponse::err(id, -4, "no wallet loaded"),
            }
        }
        // ── listwallets ─────────────────────────────────────────
        "listwallets" => {
            let mgr = match state.wallet_mgr.as_ref() {
                Some(m) => m,
                None => return Some(JsonRpcResponse::err(id, -1, "wallet manager not available")),
            };
            match mgr.list_wallets() {
                Ok(names) => JsonRpcResponse::ok(id, serde_json::json!(names)),
                Err(e) => JsonRpcResponse::err(id, -1, format!("list failed: {e}")),
            }
        }
        // ── getwalletinfo ───────────────────────────────────────
        "getwalletinfo" => {
            let mut guard = state.loaded_wallet.lock();
            match guard.as_mut() {
                Some(lw) => {
                    lw.refresh_lock_state();
                    let balance: u64 = {
                        let utxo_set = state.node.utxo_set();
                        let wallet_scripts: Vec<Vec<u8>> = lw.wallet.addresses.iter()
                            .filter_map(|a| tx::Address::decode(a).ok())
                            .map(|a| a.to_script_pubkey())
                            .collect();
                        utxo_set.iter()
                            .filter(|(_, u)| wallet_scripts.iter().any(|s| *s == u.output.script_pubkey))
                            .map(|(_, u)| u.output.value)
                            .sum()
                    };
                    let unlocked = lw.is_unlocked();
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "walletname": lw.name,
                        "walletversion": lw.wallet.version,
                        "balance": balance,
                        "keypoolsize": lw.wallet.private_keys.len(),
                        "address_count": lw.wallet.addresses.len(),
                        "watch_only": lw.wallet.watch_only,
                        "birthday_height": lw.wallet.birthday_height,
                        "unlocked_until": if unlocked { lw.passphrase_until.unwrap().duration_since(std::time::Instant::now()).as_secs() } else { 0 },
                    }))
                }
                None => JsonRpcResponse::err(id, -4, "no wallet loaded"),
            }
        }
        // ── rescanblockchain ────────────────────────────────────
        "rescanblockchain" => {
            let start = params.first().and_then(|v| v.as_u64()).unwrap_or(0);
            let height = state.node.get_height();
            let stop = params.get(1).and_then(|v| v.as_u64()).unwrap_or(height).min(height);
            let watch_addrs: Vec<Vec<u8>> = match params.get(2).and_then(|v| v.as_array()) {
                Some(arr) => arr.iter()
                    .filter_map(|v| v.as_str())
                    .filter_map(|a| tx::Address::decode(a).ok())
                    .map(|a| a.to_script_pubkey())
                    .collect(),
                None => Vec::new(),
            };
            if watch_addrs.is_empty() {
                return Some(JsonRpcResponse::ok(id, serde_json::json!({
                    "start_height": start,
                    "stop_height": stop,
                    "transactions": [],
                })));
            }
            let mut found_txs = Vec::new();
            for h in start..=stop {
                if let Some(bhash) = state.node.get_block_hash(h) {
                    if let Some(block) = state.node.get_block(&bhash) {
                        for txn in &block.transactions {
                            let matches = txn.outputs.iter().any(|o| {
                                watch_addrs.iter().any(|w| o.script_pubkey == *w)
                            });
                            if matches {
                                found_txs.push(serde_json::json!({
                                    "txid": hex::encode(txn.txid()),
                                    "blockheight": h,
                                    "blockhash": hex::encode(bhash),
                                }));
                            }
                        }
                    }
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!({
                "start_height": start,
                "stop_height": stop,
                "transactions": found_txs,
            }))
        }
        // ── importaddress ────────────────────────────────────────
        "importaddress" => {
            let addr_str = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a.to_string(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            if tx::Address::decode(&addr_str).is_err() {
                return Some(JsonRpcResponse::err(id, -1, "invalid address"));
            }
            let label = params.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            if lw.encrypted {
                if let Err(resp) = require_unlocked(lw, &id) {
                    return Some(resp);
                }
            }
            if !lw.wallet.addresses.contains(&addr_str) {
                lw.wallet.addresses.push(addr_str.clone());
            }
            if !label.is_empty() {
                lw.wallet.set_label(&addr_str, label);
            }
            lw.wallet.watch_only = lw.wallet.private_keys.is_empty();
            if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                return Some(resp);
            }
            JsonRpcResponse::ok(id, serde_json::json!(null))
        }
        // ── importdescriptors ────────────────────────────────────
        "importdescriptors" => {
            let descs_arr = match params.first().and_then(|v| v.as_array()) {
                Some(a) => a.clone(),
                None => return Some(JsonRpcResponse::err(id, -1, "expected array of descriptors")),
            };
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            if lw.encrypted {
                if let Err(resp) = require_unlocked(lw, &id) {
                    return Some(resp);
                }
            }
            let mut results = Vec::new();
            for item in &descs_arr {
                let desc_str = item.get("desc").and_then(|v| v.as_str()).unwrap_or("");
                let raw = desc_str.split('#').next().unwrap_or(desc_str);
                match tx::descriptors::Descriptor::parse(raw) {
                    Ok(_parsed) => {
                        if !lw.wallet.descriptors.contains(&desc_str.to_string()) {
                            lw.wallet.descriptors.push(desc_str.to_string());
                        }
                        results.push(serde_json::json!({"success": true}));
                    }
                    Err(e) => {
                        results.push(serde_json::json!({"success": false, "error": {"message": e.to_string()}}));
                    }
                }
            }
            if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                return Some(resp);
            }
            JsonRpcResponse::ok(id, serde_json::json!(results))
        }
        // ── listdescriptors ─────────────────────────────────────
        "listdescriptors" => {
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let descs: Vec<serde_json::Value> = lw.wallet.descriptors.iter().map(|d| {
                serde_json::json!({"desc": d, "active": true})
            }).collect();
            JsonRpcResponse::ok(id, serde_json::json!({
                "wallet_name": lw.name,
                "descriptors": descs,
            }))
        }
        // ── settxfee ────────────────────────────────────────────
        "settxfee" => {
            let fee_rate = match params.first().and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64))) {
                Some(f) => f,
                None => return Some(JsonRpcResponse::err(id, -1, "missing fee rate")),
            };
            let _ = fee_rate;
            JsonRpcResponse::ok(id, serde_json::json!(true))
        }
        // ── keypoolrefill ───────────────────────────────────────
        "keypoolrefill" => {
            let count = params.first().and_then(|v| v.as_u64()).unwrap_or(100) as usize;
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot generate keys"));
            }
            if let Err(resp) = require_unlocked(lw, &id) {
                return Some(resp);
            }
            let current = lw.wallet.private_keys.len();
            for _ in current..(current + count) {
                let key = tx::PrivateKey::new();
                let pubkey = key.public_key();
                let addr = tx::Address::from_pubkey_p2wpkh(&pubkey);
                lw.wallet.private_keys.push(hex::encode(&*key.to_bytes()));
                lw.wallet.addresses.push(addr.encode());
            }
            if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                return Some(resp);
            }
            JsonRpcResponse::ok(id, serde_json::json!(null))
        }
        // ── getreceivedbyaddress ────────────────────────────────
        "getreceivedbyaddress" => {
            let addr_str = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let _min_conf = params.get(1).and_then(|v| v.as_u64()).unwrap_or(1);
            let script_pubkey = match tx::Address::decode(addr_str) {
                Ok(a) => a.to_script_pubkey(),
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address")),
            };
            let mut total: u64 = 0;
            let height = state.node.get_height();
            for h in 0..=height {
                if let Some(bhash) = state.node.get_block_hash(h) {
                    if let Some(block) = state.node.get_block(&bhash) {
                        for txn in &block.transactions {
                            for out in &txn.outputs {
                                if out.script_pubkey == script_pubkey {
                                    total += out.value;
                                }
                            }
                        }
                    }
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!(total))
        }
        // ── listreceivedbyaddress ───────────────────────────────
        "listreceivedbyaddress" => {
            let _min_conf = params.first().and_then(|v| v.as_u64()).unwrap_or(1);
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let mut results = Vec::new();
            let current_height = state.node.get_height();
            for addr_str in &lw.wallet.addresses {
                if let Ok(addr) = tx::Address::decode(addr_str) {
                    let spk = addr.to_script_pubkey();
                    let mut total: u64 = 0;
                    let mut txid_strs: Vec<String> = Vec::new();
                    let mut min_block_height: Option<u64> = None;
                    for h in 0..=current_height {
                        if let Some(bhash) = state.node.get_block_hash(h) {
                            if let Some(block) = state.node.get_block(&bhash) {
                                for txn in &block.transactions {
                                    let received: u64 = txn.outputs.iter()
                                        .filter(|o| o.script_pubkey == spk)
                                        .map(|o| o.value)
                                        .sum();
                                    if received > 0 {
                                        total += received;
                                        txid_strs.push(hex::encode(txn.txid()));
                                        min_block_height = Some(min_block_height.unwrap_or(h).min(h));
                                    }
                                }
                            }
                        }
                    }
                    let confirmations = min_block_height
                        .map(|h| current_height.saturating_sub(h) + 1)
                        .unwrap_or(0);
                    let label = lw.wallet.get_label(addr_str).unwrap_or("");
                    results.push(serde_json::json!({
                        "address": addr_str,
                        "amount": total,
                        "confirmations": confirmations,
                        "label": label,
                        "txids": txid_strs,
                    }));
                }
            }
            JsonRpcResponse::ok(id, serde_json::json!(results))
        }
        // ── sendtoaddress ───────────────────────────────────────
        "sendtoaddress" => {
            let dest_addr = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a.to_string(),
                None => return Some(JsonRpcResponse::err(id, -1, "missing address")),
            };
            let amount = match params.get(1).and_then(|v| v.as_u64()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing amount")),
            };
            let dest_script = match tx::Address::decode(&dest_addr) {
                Ok(a) => a.to_script_pubkey(),
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address")),
            };
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded; use loadwallet first")),
            };
            lw.refresh_lock_state();
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot sign"));
            }
            if !lw.is_unlocked() {
                return Some(JsonRpcResponse::err(id, -13, "wallet is locked; call walletpassphrase first"));
            }
            if lw.wallet.private_keys.is_empty() {
                return Some(JsonRpcResponse::err(id, -4, "wallet has no private keys"));
            }
            let utxo_set = state.node.utxo_set();
            let current_height = state.node.get_height();
            let wallet_scripts: Vec<Vec<u8>> = lw.wallet.addresses.iter()
                .filter_map(|a| tx::Address::decode(a).ok())
                .map(|a| a.to_script_pubkey())
                .collect();
            let mut available: Vec<(tx::OutPoint, u64, usize, Vec<u8>)> = Vec::new();
            for (op, utxo) in utxo_set.iter() {
                if !utxo.is_mature(current_height) {
                    continue;
                }
                if let Some(idx) = wallet_scripts.iter().position(|s| *s == utxo.output.script_pubkey) {
                    available.push((op.clone(), utxo.output.value, idx, utxo.output.script_pubkey.clone()));
                }
            }
            available.sort_by(|a, b| b.1.cmp(&a.1));
            let mut selected = Vec::new();
            let mut total_in: u64 = 0;
            let fee: u64 = 1000;
            for item in &available {
                selected.push(item.clone());
                total_in += item.1;
                if total_in >= amount + fee { break; }
            }
            if total_in < amount + fee {
                return Some(JsonRpcResponse::err(id, -6, "insufficient funds"));
            }
            let mut inputs = Vec::new();
            for (op, _, _, _) in &selected {
                inputs.push(tx::TxInput {
                    prev_output: op.clone(),
                    script_sig: Vec::new(),
                    sequence: 0xFFFFFFFF,
                    witness: tx::Witness::new(),
                });
            }
            let mut outputs = vec![tx::TxOutput::new(amount, dest_script)];
            let change = total_in - amount - fee;
            if change > 546 {
                if let Some(change_script) = wallet_scripts.first() {
                    outputs.push(tx::TxOutput::new(change, change_script.clone()));
                }
            }
            let mut transaction = tx::Transaction::new(inputs, outputs, 0);
            for (i, (_, value, key_idx, script_pubkey)) in selected.iter().enumerate() {
                let key_hex = &lw.wallet.private_keys[*key_idx % lw.wallet.private_keys.len()];
                if let Ok(key_bytes) = hex::decode(key_hex) {
                    if key_bytes.len() == 32 {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&key_bytes);
                        if let Ok(key) = tx::PrivateKey::from_bytes(&arr) {
                            let is_p2wpkh = script_pubkey.len() == 22
                                && script_pubkey[0] == 0x00
                                && script_pubkey[1] == 0x14;
                            if is_p2wpkh {
                                let mut script_code = Vec::with_capacity(25);
                                script_code.push(0x76);
                                script_code.push(0xa9);
                                script_code.push(0x14);
                                script_code.extend_from_slice(&script_pubkey[2..22]);
                                script_code.push(0x88);
                                script_code.push(0xac);

                                let sighash = match transaction.segwit_v0_signature_hash(i, &script_code, *value) {
                                    Ok(hash) => hash,
                                    Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("segwit sighash failed: {e}"))),
                                };
                                let signature = key.sign(&sighash);
                                let mut sig_bytes = signature.serialize_der().to_vec();
                                sig_bytes.push(0x01);
                                transaction.inputs[i].witness = tx::Witness::from_stack(vec![
                                    sig_bytes,
                                    key.public_key().to_bytes(),
                                ]);
                                transaction.inputs[i].script_sig.clear();
                            } else if let Err(e) = transaction.sign_input(i, &key) {
                                return Some(JsonRpcResponse::err(id, -1, format!("signing failed: {e}")));
                            }
                        }
                    }
                }
            }
            let txid = transaction.txid();
            drop(guard);
            if let Err(e) = state.node.validate_transaction(&transaction) {
                return Some(JsonRpcResponse::err(id, -1, format!("tx validation failed: {e}")));
            }
            let fee_actual = {
                let utxo_set = state.node.utxo_set();
                let input_sum: u64 = transaction.inputs.iter().filter_map(|inp| {
                    utxo_set.get_utxo(&inp.prev_output).map(|u| u.output.value)
                }).sum();
                let output_sum: u64 = transaction.outputs.iter().map(|o| o.value).sum();
                input_sum.saturating_sub(output_sum)
            };
            match state.mempool.add_transaction_with_fee(transaction, fee_actual) {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({ "txid": hex::encode(txid) })),
                Err(e) => JsonRpcResponse::err(id, -1, format!("mempool: {e}")),
            }
        }
        // ── abandontransaction ──────────────────────────────────
        "abandontransaction" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(t) => t,
                None => return Some(JsonRpcResponse::err(id, -1, "missing txid")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&b);
                    arr
                }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid")),
            };
            let removed = state.mempool.remove_transaction(&txid_bytes).is_some();
            JsonRpcResponse::ok(id, serde_json::json!(removed))
        }
        // ── fundrawtransaction ──────────────────────────────────
        "fundrawtransaction" => {
            let raw_hex = match params.first().and_then(|v| v.as_str()) {
                Some(h) => h,
                None => return Some(JsonRpcResponse::err(id, -1, "missing hex string")),
            };
            let raw_bytes = match hex::decode(raw_hex) {
                Ok(b) => b,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid hex")),
            };
            let mut transaction: tx::Transaction = match bincode::deserialize(&raw_bytes) {
                Ok(t) => t,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid transaction")),
            };
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let opts = params.get(1);
            let fee_rate: u64 = opts.and_then(|o| o.get("feeRate")).and_then(|v| v.as_u64()).unwrap_or(1000);
            let change_position: Option<usize> = opts.and_then(|o| o.get("changePosition")).and_then(|v| v.as_u64()).map(|n| n as usize);
            let include_only: Option<Vec<String>> = opts.and_then(|o| o.get("includeOnly"))
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect());
            let exclude: Vec<String> = opts.and_then(|o| o.get("exclude"))
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let out_total: u64 = transaction.outputs.iter().map(|o| o.value).sum();
            let utxo_set = state.node.utxo_set();
            let wallet_scripts: Vec<Vec<u8>> = lw.wallet.addresses.iter()
                .filter_map(|a| tx::Address::decode(a).ok())
                .map(|a| a.to_script_pubkey())
                .collect();
            let mut available: Vec<(tx::OutPoint, u64, usize)> = Vec::new();
            for (op, utxo) in utxo_set.iter() {
                if let Some(idx) = wallet_scripts.iter().position(|s| *s == utxo.output.script_pubkey) {
                    let op_str = format!("{}:{}", hex::encode(op.txid), op.vout);
                    if exclude.iter().any(|e| *e == op_str) { continue; }
                    if let Some(ref inc) = include_only {
                        if !inc.iter().any(|i| *i == op_str) { continue; }
                    }
                    available.push((op.clone(), utxo.output.value, idx));
                }
            }
            available.sort_by(|a, b| b.1.cmp(&a.1));

            let target = out_total + fee_rate;
            let mut total_in: u64 = transaction.inputs.iter().map(|_| 0u64).sum();
            let mut new_inputs = Vec::new();
            for item in &available {
                if total_in >= target { break; }
                new_inputs.push(item.clone());
                total_in += item.1;
            }
            if total_in < target {
                return Some(JsonRpcResponse::err(id, -6, "insufficient funds for fundrawtransaction"));
            }
            for (op, _, _) in &new_inputs {
                transaction.inputs.push(tx::TxInput {
                    prev_output: op.clone(),
                    script_sig: Vec::new(),
                    sequence: 0xFFFFFFFF,
                    witness: tx::Witness::new(),
                });
            }
            let change = total_in - target;
            let change_idx = if change > 546 {
                if let Some(change_script) = wallet_scripts.first() {
                    let co = tx::TxOutput::new(change, change_script.clone());
                    match change_position {
                        Some(pos) if pos <= transaction.outputs.len() => {
                            transaction.outputs.insert(pos, co);
                            Some(pos)
                        }
                        _ => {
                            let idx = transaction.outputs.len();
                            transaction.outputs.push(co);
                            Some(idx)
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            };
            let funded_hex = hex::encode(bincode::serialize(&transaction).unwrap_or_default());
            JsonRpcResponse::ok(id, serde_json::json!({
                "hex": funded_hex,
                "fee": fee_rate,
                "changepos": change_idx.unwrap_or(usize::MAX),
            }))
        }
        // ── sethdseed ───────────────────────────────────────────
        "sethdseed" => {
            let seed_hex = params.get(1).and_then(|v| v.as_str());
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            if lw.wallet.watch_only {
                return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot set HD seed"));
            }
            if let Err(resp) = require_unlocked(lw, &id) {
                return Some(resp);
            }
            if let Some(hex_str) = seed_hex {
                lw.wallet.mnemonic = Some(hex_str.to_string());
            } else {
                let mut entropy = [0u8; 16];
                use rand::RngCore;
                rand::thread_rng().fill_bytes(&mut entropy);
                if let Ok(m) = tx::bip39::Mnemonic::from_entropy(&entropy) {
                    lw.wallet.mnemonic = Some(m.words.join(" "));
                }
            }
            if let Err(resp) = persist_loaded_wallet(state, lw, &id) {
                return Some(resp);
            }
            JsonRpcResponse::ok(id, serde_json::json!(null))
        }
        // ── listaddressgroupings ────────────────────────────────
        "listaddressgroupings" => {
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let utxo_set = state.node.utxo_set();
            let group: Vec<serde_json::Value> = lw.wallet.addresses.iter().map(|addr_str| {
                let balance = if let Ok(a) = tx::Address::decode(addr_str) {
                    let spk = a.to_script_pubkey();
                    utxo_set.iter().filter(|(_, u)| u.output.script_pubkey == spk).map(|(_, u)| u.output.value).sum::<u64>()
                } else { 0 };
                let label = lw.wallet.get_label(addr_str).unwrap_or("");
                serde_json::json!([addr_str, balance, label])
            }).collect();
            JsonRpcResponse::ok(id, serde_json::json!([group]))
        }
        // ── bumpfee ─────────────────────────────────────────────
        "bumpfee" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Some(JsonRpcResponse::err(id, -1, "usage: bumpfee <txid> [options]")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut a = [0u8; 32]; a.copy_from_slice(&b); a }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid")),
            };
            let orig_tx = match state.mempool.get_transaction(&txid_bytes) {
                Some(e) => e,
                None => return Some(JsonRpcResponse::err(id, -5, "transaction not in mempool")),
            };
            if !orig_tx.inputs.iter().any(|i| i.sequence < 0xffff_fffe) {
                return Some(JsonRpcResponse::err(id, -4, "transaction is not BIP-125 replaceable"));
            }
            let new_fee_rate = params.get(1)
                .and_then(|v| v.get("fee_rate"))
                .and_then(|v| v.as_f64())
                .unwrap_or(10.0);
            let mut new_tx = orig_tx.clone();
            for inp in &mut new_tx.inputs {
                inp.sequence = 0xffff_fffd;
            }
            let vsize = std::cmp::max(new_tx.weight() / 4, 1) as f64;
            let target_fee = (new_fee_rate * vsize) as u64;
            let orig_fee = state.mempool.get_entry(&txid_bytes).map(|e| e.fee).unwrap_or(0);
            let fee_delta = target_fee.saturating_sub(orig_fee);
            if fee_delta == 0 {
                return Some(JsonRpcResponse::err(id, -4, "new fee rate not higher than original"));
            }
            if let Some(last_out) = new_tx.outputs.last_mut() {
                if last_out.value < fee_delta + 546 {
                    return Some(JsonRpcResponse::err(id, -6, "insufficient funds to bump fee"));
                }
                last_out.value -= fee_delta;
            }
            let new_txid = hex::encode(new_tx.txid());
            match state.mempool.add_transaction_with_fee(new_tx, target_fee) {
                Ok(()) => {}
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("mempool: {e}"))),
            }
            JsonRpcResponse::ok(id, serde_json::json!({
                "txid": new_txid,
                "origfee": orig_fee as f64 / 1e8,
                "fee": target_fee as f64 / 1e8,
                "errors": []
            }))
        }
        // ── psbtbumpfee ─────────────────────────────────────────
        "psbtbumpfee" => {
            let txid_hex = match params.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Some(JsonRpcResponse::err(id, -1, "usage: psbtbumpfee <txid> [options]")),
            };
            let txid_bytes = match hex::decode(txid_hex) {
                Ok(b) if b.len() == 32 => { let mut a = [0u8; 32]; a.copy_from_slice(&b); a }
                _ => return Some(JsonRpcResponse::err(id, -1, "invalid txid")),
            };
            let orig_tx = match state.mempool.get_transaction(&txid_bytes) {
                Some(e) => e,
                None => return Some(JsonRpcResponse::err(id, -5, "transaction not in mempool")),
            };
            if !orig_tx.inputs.iter().any(|i| i.sequence < 0xffff_fffe) {
                return Some(JsonRpcResponse::err(id, -4, "transaction is not BIP-125 replaceable"));
            }
            let new_fee_rate = params.get(1)
                .and_then(|v| v.get("fee_rate"))
                .and_then(|v| v.as_f64())
                .unwrap_or(10.0);
            let mut bump_tx = orig_tx.clone();
            for inp in &mut bump_tx.inputs { inp.sequence = 0xffff_fffd; }
            for inp in &mut bump_tx.inputs {
                inp.script_sig = vec![];
                inp.witness = tx::Witness::default();
            }
            let vsize = std::cmp::max(bump_tx.weight() / 4, 1) as f64;
            let target_fee = (new_fee_rate * vsize) as u64;
            let orig_fee = state.mempool.get_entry(&txid_bytes).map(|e| e.fee).unwrap_or(0);
            let fee_delta = target_fee.saturating_sub(orig_fee);
            if let Some(last_out) = bump_tx.outputs.last_mut() {
                if last_out.value < fee_delta + 546 {
                    return Some(JsonRpcResponse::err(id, -6, "insufficient funds to bump fee"));
                }
                last_out.value -= fee_delta;
            }
            match tx::psbt::Psbt::new(bump_tx) {
                Ok(psbt) => {
                    let psbt_bytes = psbt.serialize();
                    use base64::Engine;
                    let psbt_b64 = base64::engine::general_purpose::STANDARD.encode(&psbt_bytes);
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "psbt": psbt_b64,
                        "origfee": orig_fee as f64 / 1e8,
                        "fee": target_fee as f64 / 1e8,
                        "errors": []
                    }))
                }
                Err(e) => JsonRpcResponse::err(id, -1, format!("PSBT creation failed: {e}")),
            }
        }
        // ── getbalances ─────────────────────────────────────────
        "getbalances" => {
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let utxo_set = state.node.utxo_set();
            let height = state.node.get_height();
            let mut trusted = 0u64;
            let mut untrusted_pending = 0u64;
            let mut immature = 0u64;
            for addr_str in &lw.wallet.addresses {
                if let Ok(a) = tx::Address::decode(addr_str) {
                    let spk = a.to_script_pubkey();
                    for (_, u) in utxo_set.iter().filter(|(_, u)| u.output.script_pubkey == spk) {
                        if u.is_coinbase {
                            if height.saturating_sub(u.height) < 100 {
                                immature += u.output.value;
                            } else {
                                trusted += u.output.value;
                            }
                        } else {
                            if u.height > 0 {
                                trusted += u.output.value;
                            } else {
                                untrusted_pending += u.output.value;
                            }
                        }
                    }
                }
            }
            let watch_only = lw.wallet.watch_only;
            let mine = if !watch_only {
                serde_json::json!({
                    "trusted": trusted as f64 / 1e8,
                    "untrusted_pending": untrusted_pending as f64 / 1e8,
                    "immature": immature as f64 / 1e8,
                })
            } else { serde_json::json!({}) };
            let wo = if watch_only {
                serde_json::json!({
                    "trusted": trusted as f64 / 1e8,
                    "untrusted_pending": untrusted_pending as f64 / 1e8,
                    "immature": immature as f64 / 1e8,
                })
            } else { serde_json::json!({}) };
            JsonRpcResponse::ok(id, serde_json::json!({
                "mine": mine,
                "watchonly": wo,
            }))
        }
        // ── walletcreatefundedpsbt ──────────────────────────────
        "walletcreatefundedpsbt" => {
            let guard = state.loaded_wallet.lock();
            let lw = match guard.as_ref() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            let outputs = match params.get(1) {
                Some(o) => o,
                None => return Some(JsonRpcResponse::err(id, -1, "usage: walletcreatefundedpsbt [inputs] {outputs} [locktime] [options]")),
            };
            let locktime = params.get(2).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let mut tx_outputs = Vec::new();
            if let Some(obj) = outputs.as_object() {
                for (addr_str, val) in obj {
                    let amount = match val.as_f64() {
                        Some(a) => (a * 1e8) as u64,
                        None => return Some(JsonRpcResponse::err(id, -1, "invalid amount")),
                    };
                    match tx::Address::decode(addr_str) {
                        Ok(a) => tx_outputs.push(tx::TxOutput { value: amount, script_pubkey: a.to_script_pubkey() }),
                        Err(_) => return Some(JsonRpcResponse::err(id, -1, format!("invalid address: {addr_str}"))),
                    }
                }
            }
            let utxo_set = state.node.utxo_set();
            let total_needed: u64 = tx_outputs.iter().map(|o| o.value).sum();
            let mut selected_inputs = Vec::new();
            let mut input_sum = 0u64;
            for addr_str in &lw.wallet.addresses {
                if input_sum >= total_needed + 1000 { break; }
                if let Ok(a) = tx::Address::decode(addr_str) {
                    let spk = a.to_script_pubkey();
                    for (op, u) in utxo_set.iter().filter(|(_, u)| u.output.script_pubkey == spk) {
                        selected_inputs.push(tx::TxInput {
                            prev_output: *op,
                            script_sig: vec![],
                            sequence: 0xffff_fffd,
                            witness: tx::Witness::default(),
                        });
                        input_sum += u.output.value;
                        if input_sum >= total_needed + 1000 { break; }
                    }
                }
            }
            if input_sum < total_needed {
                return Some(JsonRpcResponse::err(id, -6, "insufficient funds"));
            }
            let fee_estimate = 500u64;
            let change = input_sum.saturating_sub(total_needed + fee_estimate);
            if change > 546 {
                if let Some(chg_addr) = lw.wallet.addresses.first() {
                    if let Ok(a) = tx::Address::decode(chg_addr) {
                        tx_outputs.push(tx::TxOutput { value: change, script_pubkey: a.to_script_pubkey() });
                    }
                }
            }
            let unsigned_tx = tx::Transaction {
                version: 2,
                inputs: selected_inputs,
                outputs: tx_outputs,
                lock_time: locktime,
            };
            let actual_fee = input_sum.saturating_sub(unsigned_tx.outputs.iter().map(|o| o.value).sum::<u64>());
            match tx::psbt::Psbt::new(unsigned_tx) {
                Ok(psbt) => {
                    let psbt_bytes = psbt.serialize();
                    use base64::Engine;
                    let psbt_b64 = base64::engine::general_purpose::STANDARD.encode(&psbt_bytes);
                    JsonRpcResponse::ok(id, serde_json::json!({
                        "psbt": psbt_b64,
                        "fee": actual_fee as f64 / 1e8,
                        "changepos": if change > 546 { psbt.unsigned_tx.outputs.len() as i64 - 1 } else { -1 },
                    }))
                }
                Err(e) => JsonRpcResponse::err(id, -1, format!("PSBT creation failed: {e}")),
            }
        }
        // ── walletprocesspsbt ───────────────────────────────────
        "walletprocesspsbt" => {
            let mut guard = state.loaded_wallet.lock();
            let lw = match guard.as_mut() {
                Some(w) => w,
                None => return Some(JsonRpcResponse::err(id, -4, "no wallet loaded")),
            };
            lw.refresh_lock_state();
            let psbt_b64 = match params.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Some(JsonRpcResponse::err(id, -1, "usage: walletprocesspsbt <psbt_base64> [sign] [sighashtype]")),
            };
            let sign = params.get(1).and_then(|v| v.as_bool()).unwrap_or(true);
            if sign {
                if lw.wallet.watch_only {
                    return Some(JsonRpcResponse::err(id, -4, "watch-only wallet cannot sign"));
                }
                if let Err(resp) = require_unlocked(lw, &id) {
                    return Some(resp);
                }
            }
            use base64::Engine;
            let psbt_bytes = match base64::engine::general_purpose::STANDARD.decode(psbt_b64) {
                Ok(b) => b,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid base64")),
            };
            let mut psbt = match tx::psbt::Psbt::deserialize(&psbt_bytes) {
                Ok(p) => p,
                Err(e) => return Some(JsonRpcResponse::err(id, -1, format!("PSBT parse error: {e}"))),
            };
            if sign {
                for key_hex in &lw.wallet.private_keys {
                    if let Ok(key_bytes) = hex::decode(key_hex) {
                        if key_bytes.len() == 32 {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(&key_bytes);
                            if let Ok(privkey) = tx::PrivateKey::from_bytes(&arr) {
                                for i in 0..psbt.unsigned_tx.inputs.len() {
                                    let _ = psbt.sign_input(i, &privkey);
                                }
                            }
                        }
                    }
                }
            }
            let complete = psbt.is_complete();
            let out_bytes = psbt.serialize();
            let out_b64 = base64::engine::general_purpose::STANDARD.encode(&out_bytes);
            JsonRpcResponse::ok(id, serde_json::json!({
                "psbt": out_b64,
                "complete": complete,
            }))
        }

        _ => return None,
    };
    Some(resp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mempool::Mempool;
    use crate::rpc::AppState;
    use crate::state::NodeState;
    use serde_json::json;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn test_state() -> (TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        let config = crate::Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let node = NodeState::new(config).unwrap();
        let mempool = Arc::new(Mempool::new(10 * 1024 * 1024));
        let wallet_mgr = tx::wallet::WalletManager::new(dir.path().join("wallets")).unwrap();
        let state = Arc::new(AppState {
            node,
            mempool,
            peers: None,
            start_time: std::time::Instant::now(),
            template_notify: Arc::new(tokio::sync::Notify::new()),
            wallet_mgr: Some(wallet_mgr),
            loaded_wallet: parking_lot::Mutex::new(None),
            api_keys: vec![],
        });
        (dir, state)
    }

    fn response_json(resp: JsonRpcResponse) -> serde_json::Value {
        serde_json::to_value(resp).unwrap()
    }

    fn wallet_with_private_key(label: &str) -> tx::wallet::WalletFile {
        let key = tx::PrivateKey::new();
        let pubkey = key.public_key();
        tx::wallet::WalletFile {
            label: label.to_string(),
            private_keys: vec![hex::encode(&*key.to_bytes())],
            addresses: vec![tx::Address::from_pubkey_p2wpkh(&pubkey).encode()],
            mnemonic: Some("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string()),
            ..Default::default()
        }
    }

    fn set_loaded_wallet(state: &Arc<AppState>, loaded_wallet: LoadedWallet) {
        *state.loaded_wallet.lock() = Some(loaded_wallet);
    }

    #[test]
    fn test_loadwallet_reports_actual_plaintext_encryption_state() {
        let (_dir, state) = test_state();
        let mgr = state.wallet_mgr.as_ref().unwrap();
        let wallet = wallet_with_private_key("plain");
        mgr.create_wallet("plain", &wallet, None).unwrap();

        let resp = dispatch(&state, "loadwallet", &[json!("plain"), json!("ignored")], json!(1)).unwrap();
        let body = response_json(resp);

        assert_eq!(body["result"]["encrypted"], json!(false));
        let guard = state.loaded_wallet.lock();
        let loaded = guard.as_ref().unwrap();
        assert!(!loaded.encrypted);
        assert_eq!(loaded.name, "plain");
    }

    #[test]
    fn test_walletlock_clears_sensitive_state() {
        let (_dir, state) = test_state();
        let mgr = state.wallet_mgr.as_ref().unwrap();
        let wallet = wallet_with_private_key("vault");
        mgr.create_wallet("vault", &wallet, Some("strong_pw_12345")).unwrap();

        let loaded_wallet = LoadedWallet {
            name: "vault".to_string(),
            wallet: mgr.load_wallet("vault", Some("strong_pw_12345")).unwrap(),
            passphrase_until: Some(std::time::Instant::now() + std::time::Duration::from_secs(60)),
            encrypted: true,
            password: Some("strong_pw_12345".to_string()),
        };
        set_loaded_wallet(&state, loaded_wallet);

        let resp = dispatch(&state, "walletlock", &[], json!(1)).unwrap();
        let body = response_json(resp);
        assert!(body["error"].is_null());

        let guard = state.loaded_wallet.lock();
        let loaded = guard.as_ref().unwrap();
        assert!(loaded.password.is_none());
        assert!(loaded.wallet.private_keys.is_empty());
        assert!(loaded.wallet.mnemonic.is_none());
        assert!(!loaded.is_unlocked());
    }

    #[test]
    fn test_importprivkey_rejects_locked_encrypted_wallet() {
        let (_dir, state) = test_state();
        let mgr = state.wallet_mgr.as_ref().unwrap();
        let wallet = wallet_with_private_key("locked_import");
        mgr.create_wallet("locked_import", &wallet, Some("strong_pw_12345")).unwrap();

        let mut loaded_wallet = LoadedWallet {
            name: "locked_import".to_string(),
            wallet: mgr.load_wallet("locked_import", Some("strong_pw_12345")).unwrap(),
            passphrase_until: None,
            encrypted: true,
            password: None,
        };
        loaded_wallet.lock_sensitive_state();
        set_loaded_wallet(&state, loaded_wallet);

        let key_hex = hex::encode(tx::PrivateKey::new().to_bytes());
        let resp = dispatch(&state, "importprivkey", &[json!(key_hex)], json!(1)).unwrap();
        let body = response_json(resp);

        assert_eq!(body["error"]["code"], json!(-13));
    }

    #[test]
    fn test_walletprocesspsbt_requires_unlock_for_signing() {
        let (_dir, state) = test_state();
        let mgr = state.wallet_mgr.as_ref().unwrap();
        let wallet = wallet_with_private_key("locked_psbt");
        mgr.create_wallet("locked_psbt", &wallet, Some("strong_pw_12345")).unwrap();

        let mut loaded_wallet = LoadedWallet {
            name: "locked_psbt".to_string(),
            wallet: mgr.load_wallet("locked_psbt", Some("strong_pw_12345")).unwrap(),
            passphrase_until: None,
            encrypted: true,
            password: None,
        };
        loaded_wallet.lock_sensitive_state();
        set_loaded_wallet(&state, loaded_wallet);

        let resp = dispatch(&state, "walletprocesspsbt", &[json!("placeholder"), json!(true)], json!(1)).unwrap();
        let body = response_json(resp);

        assert_eq!(body["error"]["code"], json!(-13));
    }

    #[test]
    fn test_encryptwallet_removes_plaintext_sidecar() {
        let (_dir, state) = test_state();
        let mgr = state.wallet_mgr.as_ref().unwrap();
        let wallet = wallet_with_private_key("plain_encrypt");
        mgr.create_wallet("plain_encrypt", &wallet, None).unwrap();

        let loaded_wallet = LoadedWallet {
            name: "plain_encrypt".to_string(),
            wallet: mgr.load_wallet("plain_encrypt", None).unwrap(),
            passphrase_until: None,
            encrypted: false,
            password: None,
        };
        set_loaded_wallet(&state, loaded_wallet);

        let resp = dispatch(&state, "encryptwallet", &[json!("new_strong_pw_12345")], json!(1)).unwrap();
        let body = response_json(resp);
        assert!(body["error"].is_null());

        let storage = mgr.wallet_storage_info("plain_encrypt").unwrap();
        assert!(storage.encrypted);
        assert!(storage.path.ends_with("plain_encrypt.dat"));
        assert!(!storage.path.with_extension("json").exists());

        let guard = state.loaded_wallet.lock();
        let loaded = guard.as_ref().unwrap();
        assert!(loaded.encrypted);
        assert!(loaded.password.is_none());
        assert!(loaded.wallet.private_keys.is_empty());
    }
}
