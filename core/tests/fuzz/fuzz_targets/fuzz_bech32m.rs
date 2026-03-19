#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz Bech32 / Bech32m address decoders at the byte level.
//
// The existing `fuzz_address` target exercises `Address::decode`, which
// dispatches across multiple format parsers.  This target drills directly
// into the lower-level `tx::bech32m` functions, reaching the polymod
// checksum verifier, witness-version extractor, and Taproot-specific
// decode path with minimal wrapper overhead.
fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // Generic Bech32/Bech32m decode (hrp + witness program).
        let _ = tx::bech32m::decode(s);

        // Typed address-format decoders.
        let _ = tx::bech32m::decode_p2wpkh_address(s);
        let _ = tx::bech32m::decode_p2wsh_address(s);
        let _ = tx::bech32m::decode_taproot_address(s);
    }
});
