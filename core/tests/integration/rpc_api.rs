// Integration Test: RPC API
//
// Tests the real axum router using tower::ServiceExt (no real TCP socket).
// All requests exercise the production routing + handler code path.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use kubercoin_node::{
    config::Network,
    rpc::AppState,
    Config, Mempool, NodeState,
};
use std::sync::Arc;
use tower::ServiceExt; // for `oneshot`

// ── Helper ────────────────────────────────────────────────────────────────────

fn make_app() -> (tempfile::TempDir, axum::Router) {
    let dir = tempfile::tempdir().unwrap();
    let config = Config {
        data_dir: dir.path().to_path_buf(),
        network: Network::Regtest,
        ..Config::default()
    };
    let node = NodeState::new(config).expect("NodeState::new");
    let mempool = Arc::new(Mempool::new(10 * 1024 * 1024));
    let wallet_mgr =
        tx::wallet::WalletManager::new(dir.path().join("wallets")).unwrap();
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
    let router = kubercoin_node::rpc::create_router(state);
    (dir, router)
}

fn rpc_body(method: &str, params: &str) -> Body {
    // JSON-RPC endpoint is POST / (root)
    let s = format!(
        r#"{{"jsonrpc":"2.0","method":"{method}","params":{params},"id":1}}"#
    );
    Body::from(s)
}

async fn rpc_call(router: axum::Router, method: &str, params: &str) -> serde_json::Value {
    let req = Request::builder()
        .method("POST")
        .uri("/")
        .header("content-type", "application/json")
        .body(rpc_body(method, params))
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK, "{method} must return HTTP 200");
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

// ── getblockcount ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_getblockcount_returns_zero_on_fresh_node() {
    let (_dir, router) = make_app();
    let req = Request::builder()
        .method("POST")
        .uri("/")
        .header("content-type", "application/json")
        .body(rpc_body("getblockcount", "[]"))
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
        .await
        .unwrap();
    let val: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(val["error"].is_null(), "getblockcount must not error");
    // Genesis block is at height 0.
    assert_eq!(val["result"], 0, "fresh node must report block count 0");
}

// ── unknown method ────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_unknown_method_returns_error() {
    let (_dir, router) = make_app();
    let req = Request::builder()
        .method("POST")
        .uri("/")
        .header("content-type", "application/json")
        .body(rpc_body("nosuchmethod_xyzzy", "[]"))
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK, "HTTP status must always be 200");
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
        .await
        .unwrap();
    let val: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(
        !val["error"].is_null(),
        "unknown RPC method must return a JSON-RPC error"
    );
}

// ── REST: /api/health ─────────────────────────────────────────────────────────

#[tokio::test]
async fn test_rest_health_endpoint_returns_ok() {
    let (_dir, router) = make_app();
    let req = Request::builder()
        .method("GET")
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK, "/api/health must return 200");
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
        .await
        .unwrap();
    let val: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(
        val["status"].as_str().unwrap_or(""),
        "ok",
        "health status must be ok"
    );
    // Height must be present (genesis = 0).
    assert!(val.get("height").is_some(), "health response must include height");
}

// ── REST 404 for unknown route ─────────────────────────────────────────────

#[tokio::test]
async fn test_unknown_rest_route_returns_404() {
    let (_dir, router) = make_app();
    let req = Request::builder()
        .method("GET")
        .uri("/api/does_not_exist_xyzzy")
        .body(Body::empty())
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "unknown route must return 404"
    );
}

// ── Malformed JSON body ───────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_malformed_json_returns_400_or_error() {
    let (_dir, router) = make_app();
    let req = Request::builder()
        .method("POST")
        .uri("/")
        .header("content-type", "application/json")
        .body(Body::from("this is not json"))
        .unwrap();
    let resp = router.oneshot(req).await.unwrap();
    // Bad JSON should be rejected with a client-error status or an error body.
    let status = resp.status();
    assert!(
        status.is_client_error() || status == StatusCode::OK,
        "malformed JSON must not return a 5xx error"
    );
}

// ── Chain RPC coverage ───────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_getblockhash_and_bestblockhash_match_genesis_tip() {
    let (_dir, router) = make_app();

    let blockhash = rpc_call(router.clone(), "getblockhash", "[0]").await;
    let besthash = rpc_call(router, "getbestblockhash", "[]").await;

    assert!(blockhash["error"].is_null(), "getblockhash must not error");
    assert!(besthash["error"].is_null(), "getbestblockhash must not error");
    assert_eq!(blockhash["result"], besthash["result"], "fresh node tip must be genesis");
}

#[tokio::test]
async fn test_rpc_getblock_returns_genesis_metadata() {
    let (_dir, router) = make_app();
    let besthash = rpc_call(router.clone(), "getbestblockhash", "[]").await;
    let hash = besthash["result"].as_str().unwrap();

    let block = rpc_call(router, "getblock", &format!("[\"{hash}\", 1]")).await;

    assert!(block["error"].is_null(), "getblock must not error for genesis hash");
    assert_eq!(block["result"]["height"], 0);
    assert_eq!(block["result"]["hash"], hash);
    assert!(block["result"]["tx"].is_array(), "verbose block response must include tx array");
    assert!(block["result"]["nTx"].as_u64().unwrap_or(0) >= 1, "genesis block must contain a coinbase tx");
}

#[tokio::test]
async fn test_rpc_listunspent_returns_empty_for_new_wallet_address() {
    let (_dir, router) = make_app();
    let created = rpc_call(
        router.clone(),
        "createwallet",
        r#"["coverage_wallet","test-passphrase",false,false]"#,
    )
    .await;
    assert!(created["error"].is_null(), "createwallet must succeed");

    let address = created["result"]["address"].as_str().unwrap();
    let listunspent = rpc_call(
        router,
        "listunspent",
        &format!("[0,9999999,[\"{address}\"]]"),
    )
    .await;

    assert!(listunspent["error"].is_null(), "listunspent must not error for valid address filter");
    assert_eq!(listunspent["result"], serde_json::json!([]));
}

// ── Network RPC coverage ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_network_info_reports_zero_connections_without_peer_manager() {
    let (_dir, router) = make_app();
    let info = rpc_call(router.clone(), "getnetworkinfo", "[]").await;
    let peers = rpc_call(router.clone(), "getpeerinfo", "[]").await;
    let count = rpc_call(router, "getconnectioncount", "[]").await;

    assert!(info["error"].is_null(), "getnetworkinfo must not error");
    assert!(peers["error"].is_null(), "getpeerinfo must not error");
    assert!(count["error"].is_null(), "getconnectioncount must not error");
    assert_eq!(info["result"]["connections"], 0);
    assert_eq!(info["result"]["connections_in"], 0);
    assert_eq!(info["result"]["connections_out"], 0);
    assert_eq!(count["result"], 0);
    assert_eq!(peers["result"], serde_json::json!([]));
}

// ── Wallet RPC coverage ──────────────────────────────────────────────────────

#[tokio::test]
async fn test_rpc_getnewaddress_requires_unlocked_wallet() {
    let (_dir, router) = make_app();
    let created = rpc_call(
        router.clone(),
        "createwallet",
        r#"["locked_wallet","test-passphrase",false,false]"#,
    )
    .await;
    assert!(created["error"].is_null(), "createwallet must succeed");

    let new_address = rpc_call(router, "getnewaddress", "[]").await;

    assert!(!new_address["error"].is_null(), "locked wallet must reject getnewaddress");
    assert_eq!(new_address["error"]["code"], -13);
}

#[tokio::test]
async fn test_rpc_sendtoaddress_requires_unlocked_wallet() {
    let (_dir, router) = make_app();
    let created = rpc_call(
        router.clone(),
        "createwallet",
        r#"["locked_sender","test-passphrase",false,false]"#,
    )
    .await;
    assert!(created["error"].is_null(), "createwallet must succeed");

    let address = created["result"]["address"].as_str().unwrap();
    let send = rpc_call(router, "sendtoaddress", &format!("[\"{address}\",1]")).await;

    assert!(!send["error"].is_null(), "locked wallet must reject sendtoaddress");
    assert_eq!(send["error"]["code"], -13);
}
