#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz the output descriptor parser.
//
// `Descriptor::parse` accepts untrusted string input (from wallet files,
// user-provided descriptors, and hardware signer exports).  It performs
// recursive grammar parsing and checksum validation — an excellent target
// for the fuzzer to explore edge cases in the string-processing logic.
fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // Must never panic regardless of input.
        let _ = tx::descriptors::Descriptor::parse(s);
    }
});
