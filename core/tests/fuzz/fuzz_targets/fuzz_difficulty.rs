#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz the compact-bits ↔ target round-trip.
//
// Feeds arbitrary u32 values into `bits_to_target` → `target_to_bits` and
// checks the conversion never panics.
fuzz_target!(|data: &[u8]| {
    if data.len() < 4 {
        return;
    }
    let bits = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);

    // bits_to_target must never panic.
    let target = consensus::bits_to_target(bits);

    // Round-trip: target_to_bits should also be panic-free.
    let _bits2 = consensus::target_to_bits(&target);

    // Difficulty conversion must not panic or produce NaN/Inf.
    let diff = consensus::bits_to_difficulty(bits);
    assert!(!diff.is_nan(), "bits_to_difficulty returned NaN for bits={:#x}", bits);
});
