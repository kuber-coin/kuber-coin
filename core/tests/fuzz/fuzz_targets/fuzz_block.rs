#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Fuzz block header parsing
    if data.len() < 80 {
        return;
    }
    
    // Try to construct block header from fuzzy data
    if data.len() >= 80 {
        let mut prev_hash = [0u8; 32];
        let mut merkle_root = [0u8; 32];
        
        prev_hash.copy_from_slice(&data[0..32]);
        merkle_root.copy_from_slice(&data[32..64]);
        
        let timestamp = u64::from_le_bytes([
            data[64], data[65], data[66], data[67],
            data[68], data[69], data[70], data[71],
        ]);
        
        let bits = u32::from_le_bytes([data[72], data[73], data[74], data[75]]);
        let nonce = u64::from_le_bytes([
            data[76], data[77], data[78], data[79],
            0, 0, 0, 0, // Pad to u64
        ]);
        
        // Test that block creation handles these values safely
        let _block = chain::Block::from_params(0, prev_hash, merkle_root, timestamp, bits, nonce, vec![]);
    }
});
