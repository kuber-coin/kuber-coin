#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz PSBT (Partially Signed Bitcoin Transaction) custom binary parsers.
//
// The existing `fuzz_psbt` target exercises serde/bincode derives.  This
// target drives the hand-written `Psbt::deserialize` and `PsbtV2::deserialize`
// implementations, which contain explicit field-iteration loops and length
// bounds checks — a much richer surface for the fuzzer.
fuzz_target!(|data: &[u8]| {
    // ── PSBT v0 custom deserialiser ───────────────────────────────────────
    let _ = tx::psbt::Psbt::deserialize(data);

    // ── PSBT v2 custom deserialiser ───────────────────────────────────────
    let _ = tx::psbt_v2::PsbtV2::deserialize(data);
});
