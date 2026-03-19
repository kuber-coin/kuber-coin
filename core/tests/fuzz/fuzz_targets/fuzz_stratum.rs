#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz the Stratum mining protocol request parser.
//
// Stratum servers accept newline-delimited JSON from untrusted mining clients
// over TCP.  Each line is parsed as a `StratumRequest`.  This target ensures
// that arbitrary input never causes a panic or undefined behaviour in the
// JSON deserialisation layer.
//
// Shadow struct mirrors the production `StratumRequest` field-for-field.

#[derive(serde::Deserialize)]
struct StratumRequest {
    #[allow(dead_code)]
    id: serde_json::Value,
    #[allow(dead_code)]
    method: String,
    #[allow(dead_code)]
    params: Vec<serde_json::Value>,
}

fuzz_target!(|data: &[u8]| {
    let _ = serde_json::from_slice::<StratumRequest>(data);
});
