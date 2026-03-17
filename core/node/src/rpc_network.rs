//! Network-related JSON-RPC handlers (addnode, disconnectnode, setban, etc.)

use std::net::SocketAddr;
use std::sync::Arc;

use crate::network::peer::Direction;
use crate::rpc::{AppState, JsonRpcResponse};

pub(crate) fn dispatch(
    state: &Arc<AppState>,
    method: &str,
    params: &[serde_json::Value],
    id: serde_json::Value,
) -> Option<JsonRpcResponse> {
    let resp = match method {
        // ── addnode ─────────────────────────────────────────────
        "addnode" => {
            let node_addr = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing node address")),
            };
            let command = params.get(1).and_then(|v| v.as_str()).unwrap_or("add");
            let addr: SocketAddr = match node_addr.parse() {
                Ok(a) => a,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address format (expected ip:port)")),
            };
            let pm = match state.peers.as_ref() {
                Some(pm) => pm,
                None => return Some(JsonRpcResponse::err(id, -1, "p2p not active")),
            };
            match command {
                "add" => {
                    pm.add_known_addrs(std::iter::once(addr));
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                "remove" => {
                    pm.remove(&addr);
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                "onetry" => {
                    pm.add_known_addrs(std::iter::once(addr));
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                _ => JsonRpcResponse::err(id, -1, "command must be add, remove, or onetry"),
            }
        }
        // ── disconnectnode ──────────────────────────────────────
        "disconnectnode" => {
            let node_addr = match params.first().and_then(|v| v.as_str()) {
                Some(a) => a,
                None => return Some(JsonRpcResponse::err(id, -1, "missing node address")),
            };
            let addr: SocketAddr = match node_addr.parse() {
                Ok(a) => a,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid address format")),
            };
            let pm = match state.peers.as_ref() {
                Some(pm) => pm,
                None => return Some(JsonRpcResponse::err(id, -1, "p2p not active")),
            };
            pm.disconnect_peer(&addr);
            JsonRpcResponse::ok(id, serde_json::Value::Null)
        }
        // ── setban ──────────────────────────────────────────────
        "setban" => {
            let ip_str = match params.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Some(JsonRpcResponse::err(id, -1, "missing IP address")),
            };
            let command = params.get(1).and_then(|v| v.as_str()).unwrap_or("add");
            let ip: std::net::IpAddr = match ip_str.parse() {
                Ok(a) => a,
                Err(_) => return Some(JsonRpcResponse::err(id, -1, "invalid IP address")),
            };
            let pm = match state.peers.as_ref() {
                Some(pm) => pm,
                None => return Some(JsonRpcResponse::err(id, -1, "p2p not active")),
            };
            match command {
                "add" => {
                    pm.ban_ip(ip, "manual RPC ban");
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                "remove" => {
                    pm.unban_ip(&ip);
                    JsonRpcResponse::ok(id, serde_json::Value::Null)
                }
                _ => JsonRpcResponse::err(id, -1, "command must be add or remove"),
            }
        }
        // ── listbanned ──────────────────────────────────────────
        "listbanned" => {
            let pm = match state.peers.as_ref() {
                Some(pm) => pm,
                None => return Some(JsonRpcResponse::err(id, -1, "p2p not active")),
            };
            let bans: Vec<serde_json::Value> = pm.list_banned().iter().map(|(ip, ts, reason)| {
                serde_json::json!({
                    "address": ip.to_string(),
                    "ban_created": ts,
                    "ban_reason": reason.as_deref().unwrap_or(""),
                })
            }).collect();
            JsonRpcResponse::ok(id, serde_json::json!(bans))
        }
        // ── getpeerinfo ─────────────────────────────────────────
        "getpeerinfo" => {
            let peers: Vec<serde_json::Value> = if let Some(pm) = state.peers.as_ref() {
                pm.peer_summaries().iter().map(|s| serde_json::json!({
                    "addr": s.addr.to_string(),
                    "inbound": s.direction == Direction::Inbound,
                    "subver": s.user_agent.as_deref().unwrap_or(""),
                    "startingheight": s.start_height.unwrap_or(0),
                    "conntime": s.connected_secs,
                    "banscore": s.misbehaviour_score,
                })).collect()
            } else {
                Vec::new()
            };
            JsonRpcResponse::ok(id, serde_json::json!(peers))
        }
        // ── getconnectioncount ──────────────────────────────────
        "getconnectioncount" => {
            let count = state.peers.as_ref().map_or(0, |pm| pm.peer_summaries().len());
            JsonRpcResponse::ok(id, serde_json::json!(count))
        }
        // ── getnetworkinfo ──────────────────────────────────────
        "getnetworkinfo" => {
            let (total, inbound, outbound) = if let Some(pm) = state.peers.as_ref() {
                let summaries = pm.peer_summaries();
                let ib = summaries.iter().filter(|s| s.direction == Direction::Inbound).count();
                let tot = summaries.len();
                (tot, ib, tot - ib)
            } else {
                (0, 0, 0)
            };
            JsonRpcResponse::ok(id, serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "subversion": format!("/KuberCoin:{}/", env!("CARGO_PKG_VERSION")),
                "protocolversion": 70016,
                "connections": total,
                "connections_in": inbound,
                "connections_out": outbound,
                "networkactive": true,
            }))
        }

        _ => return None,
    };
    Some(resp)
}
