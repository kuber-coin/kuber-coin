#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz address decoding.
//
// Exercises `tx::Address::decode` with arbitrary strings. Address parsing
// is an untrusted-input boundary (user-supplied wallet addresses), so it
// must handle arbitrary garbage without panicking.
fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // Must never panic, regardless of input.
        let _ = tx::Address::decode(s);
    }
});
