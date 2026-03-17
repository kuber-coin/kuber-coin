#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz PSBT (Partially Signed Bitcoin Transaction) parsing.
//
// Exercises both `Psbt` (v0) and `PsbtV2` deserialisers with random
// byte payloads.  The PSBT format is untrusted input from wallets and
// hardware signers, so it must never panic on malformed data.
fuzz_target!(|data: &[u8]| {
    // ── PSBT v0 ──────────────────────────────────────────────────────
    let _ = bincode::deserialize::<tx::psbt::Psbt>(data);

    if let Ok(s) = std::str::from_utf8(data) {
        let _ = serde_json::from_str::<tx::psbt::Psbt>(s);
    }

    // ── PSBT v2 ──────────────────────────────────────────────────────
    let _ = bincode::deserialize::<tx::psbt_v2::PsbtV2>(data);

    if let Ok(s) = std::str::from_utf8(data) {
        let _ = serde_json::from_str::<tx::psbt_v2::PsbtV2>(s);
    }

    // ── Individual sub-structures ────────────────────────────────────
    let _ = bincode::deserialize::<tx::psbt::PsbtInput>(data);
    let _ = bincode::deserialize::<tx::psbt::PsbtOutput>(data);
});
