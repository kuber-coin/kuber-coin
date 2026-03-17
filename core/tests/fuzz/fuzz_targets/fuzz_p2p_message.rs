#![no_main]
use libfuzzer_sys::fuzz_target;

// Fuzz P2P network message deserialization.
//
// Feeds arbitrary bytes into bincode and serde_json deserializers for
// `protocol::Message`, ensuring that malformed wire data never panics
// or triggers undefined behaviour.
fuzz_target!(|data: &[u8]| {
    // Try bincode (the actual wire format used between peers).
    let _ = bincode::deserialize::<node::network::Message>(data);

    // Try JSON (accepted by the RPC interface).
    if let Ok(s) = std::str::from_utf8(data) {
        let _ = serde_json::from_str::<node::network::Message>(s);
    }
});
