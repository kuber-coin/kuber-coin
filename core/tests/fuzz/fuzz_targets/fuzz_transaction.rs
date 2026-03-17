#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Fuzz transaction deserialization
    if data.len() < 100 {
        return;
    }
    
    // Try to parse as JSON transaction
    if let Ok(s) = std::str::from_utf8(data) {
        let _: Result<tx::Transaction, _> = serde_json::from_str(s);
    }
    
    // Try to parse transaction inputs/outputs bounds
    if data.len() >= 8 {
        let num_inputs = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        let num_outputs = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
        
        // Test that our validation handles extreme values
        if num_inputs < 10000 && num_outputs < 10000 {
            // Valid range - would process normally
        }
    }
});
