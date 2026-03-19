#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz HD-wallet extended key and derivation-path parsers.
//
// `from_base58` implements a custom Base58Check decoder that validates the
// payload length and checksum.  `derive_path` parses a BIP-32 path string
// (e.g. "m/44'/0'/0'/0/0") from untrusted input.  Both surfaces must handle
// arbitrary garbage without panicking.
fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // ── Extended private key ──────────────────────────────────────────
        let _ = tx::hd_wallet::ExtendedPrivateKey::from_base58(s);

        // ── Extended public key ───────────────────────────────────────────
        let _ = tx::hd_wallet::ExtendedPublicKey::from_base58(s);

        // ── BIP-32 derivation path parser (requires a valid root key first)
        // We construct a deterministic well-known root to keep the path
        // parser reachable regardless of the fuzz input.
        let seed = [0u8; 64];
        if let Ok(root) = tx::hd_wallet::ExtendedPrivateKey::from_seed(&seed, false) {
            let _ = root.derive_path(s);
        }
    }
});
