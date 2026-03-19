#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz JSON-RPC request parsing.
//
// The node's HTTP RPC endpoint accepts raw bodies from any caller.  It
// attempts to parse the body as a JSON array (batch) and falls back to a
// single-object parse.  This target exercises both code paths, ensuring
// that arbitrary HTTP bodies cannot cause panics or undefined behaviour.
//
// Shadow structs mirror the production `JsonRpcRequest` field-for-field so
// that serde generates identical deserialization code without requiring
// visibility changes to the node crate.

#[derive(serde::Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    #[allow(dead_code)]
    method: String,
    #[serde(default)]
    #[allow(dead_code)]
    params: Vec<serde_json::Value>,
    #[allow(dead_code)]
    id: serde_json::Value,
}

fuzz_target!(|data: &[u8]| {
    // ── Batch (array of requests) ─────────────────────────────────────────
    let _ = serde_json::from_slice::<Vec<JsonRpcRequest>>(data);

    // ── Single request ────────────────────────────────────────────────────
    let _ = serde_json::from_slice::<JsonRpcRequest>(data);
});
