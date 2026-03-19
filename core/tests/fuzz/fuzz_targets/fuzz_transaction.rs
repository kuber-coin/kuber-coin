#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz transaction deserialization.
//
// Exercises both the bincode wire format (the actual on-the-wire encoding used
// between peers and in `sendrawtransaction`) and the JSON representation.  The
// fuzzer must never panic or trigger undefined behaviour on arbitrary input.
fuzz_target!(|data: &[u8]| {
    // ── bincode wire format (primary path) ───────────────────────────
    let _ = bincode::deserialize::<tx::Transaction>(data);

    // ── JSON (accepted by the RPC interface) ─────────────────────────
    if let Ok(s) = std::str::from_utf8(data) {
        let _: Result<tx::Transaction, _> = serde_json::from_str(s);
    }
});
