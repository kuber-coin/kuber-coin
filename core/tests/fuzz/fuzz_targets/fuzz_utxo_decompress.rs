#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz UTXO set binary decompression.
//
// The UTXO decompressors implement custom bounds-checked binary parsing used
// when loading the chain-state from disk.  Corrupt or truncated chain-state
// data must never produce panics or trigger undefined behaviour.
fuzz_target!(|data: &[u8]| {
    // ── Script-level decompressor ─────────────────────────────────────────
    let _ = chain::utxo::decompress_script(data);

    // ── Single UTXO entry decompressor ────────────────────────────────────
    let _ = chain::utxo::decompress_utxo(data);

    // ── Full UTXO-set decompressor ────────────────────────────────────────
    let _ = chain::utxo::decompress_utxo_set(data);
});
