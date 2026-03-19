#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz block deserialization.
//
// Feeds arbitrary bytes into the bincode and JSON deserialisers for
// `chain::Block`, ensuring that malformed block data arriving from peers or
// via `submitblock` never panics or triggers undefined behaviour.
fuzz_target!(|data: &[u8]| {
    // ── bincode wire format (primary path) ───────────────────────────
    let _ = bincode::deserialize::<chain::Block>(data);

    // ── JSON (submitted via RPC) ──────────────────────────────────────
    if let Ok(s) = std::str::from_utf8(data) {
        let _: Result<chain::Block, _> = serde_json::from_str(s);
    }
});
