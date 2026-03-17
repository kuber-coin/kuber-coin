#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 50 || data.len() > 10240 {
        return;
    }
    
    // Split data into script_sig and script_pubkey
    let mid = data.len() / 2;
    let script_sig = tx::Script::new(data[..mid].to_vec());
    let script_pubkey = tx::Script::new(data[mid..].to_vec());
    
    // Fuzz message
    let mut message = [0u8; 32];
    if data.len() >= 32 {
        message.copy_from_slice(&data[..32]);
    }
    
    // Test script verification with fuzzy inputs
    // This should not panic and should handle malformed scripts gracefully
    let _ = tx::Script::verify_p2pkh(&script_sig, &script_pubkey, &message);
});
