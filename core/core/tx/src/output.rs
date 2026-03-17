use serde::{Deserialize, Serialize};

/// Transaction output (creates a new UTXO)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TxOutput {
    /// Amount in smallest unit (satoshis equivalent)
    pub value: u64,

    /// Script public key (spending conditions)
    pub script_pubkey: Vec<u8>,
}

impl TxOutput {
    /// Create a new transaction output
    pub fn new(value: u64, script_pubkey: Vec<u8>) -> Self {
        Self {
            value,
            script_pubkey,
        }
    }

    /// Create a P2PKH output (Pay-to-Public-Key-Hash)
    pub fn new_p2pkh(value: u64, pubkey_hash: [u8; 20]) -> Self {
        // Create proper P2PKH script
        use crate::Script;
        let script = Script::new_p2pkh(&pubkey_hash);
        Self {
            value,
            script_pubkey: script.bytes,
        }
    }

    /// Create a P2WPKH output (SegWit v0)
    pub fn new_p2wpkh(value: u64, pubkey_hash: [u8; 20]) -> Self {
        use crate::Script;
        let script = Script::new_p2wpkh(&pubkey_hash);
        Self {
            value,
            script_pubkey: script.bytes,
        }
    }

    /// Create a P2TR output (Taproot, SegWit v1)
    pub fn new_p2tr(value: u64, output_key: [u8; 32]) -> Self {
        use crate::Script;
        let script = Script::new_p2tr(&output_key);
        Self {
            value,
            script_pubkey: script.bytes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_creation() {
        let value = 50_000_000; // 0.5 coin
        let script_pubkey = vec![0x01, 0x02, 0x03];
        let output = TxOutput::new(value, script_pubkey.clone());

        assert_eq!(output.value, value);
        assert_eq!(output.script_pubkey, script_pubkey);
    }

    #[test]
    fn test_p2pkh_output() {
        let value = 100_000_000;
        let pubkey_hash = [0xabu8; 20];
        let output = TxOutput::new_p2pkh(value, pubkey_hash);

        assert_eq!(output.value, value);
        assert_eq!(output.script_pubkey.len(), 25); // P2PKH script length

        // Verify it's a valid P2PKH script
        let script = crate::Script::new(output.script_pubkey.clone());
        assert!(script.is_p2pkh());
        assert_eq!(script.get_p2pkh_hash().unwrap(), pubkey_hash);
    }

    #[test]
    fn test_output_equality() {
        let out1 = TxOutput::new(100, vec![0x01]);
        let out2 = TxOutput::new(100, vec![0x01]);
        let out3 = TxOutput::new(200, vec![0x01]);

        assert_eq!(out1, out2);
        assert_ne!(out1, out3);
    }

    #[test]
    fn test_p2wpkh_script_is_22_bytes() {
        let hash = [0x11u8; 20];
        let output = TxOutput::new_p2wpkh(1_000, hash);
        assert_eq!(output.script_pubkey.len(), 22);
    }

    #[test]
    fn test_p2wpkh_script_starts_with_op0() {
        let hash = [0x22u8; 20];
        let output = TxOutput::new_p2wpkh(1_000, hash);
        assert_eq!(output.script_pubkey[0], 0x00, "P2WPKH must start with OP_0");
    }

    #[test]
    fn test_p2tr_script_is_34_bytes() {
        let key = [0xFFu8; 32];
        let output = TxOutput::new_p2tr(5_000, key);
        assert_eq!(output.script_pubkey.len(), 34);
    }

    #[test]
    fn test_p2tr_script_starts_with_op1() {
        let key = [0xAAu8; 32];
        let output = TxOutput::new_p2tr(5_000, key);
        assert_eq!(output.script_pubkey[0], 0x51, "P2TR must start with OP_1");
    }

    #[test]
    fn test_zero_value_output_allowed() {
        let out = TxOutput::new(0, vec![]);
        assert_eq!(out.value, 0);
    }

    #[test]
    fn test_different_p2pkh_hashes_produce_different_scripts() {
        let out1 = TxOutput::new_p2pkh(1_000, [0x01u8; 20]);
        let out2 = TxOutput::new_p2pkh(1_000, [0x02u8; 20]);
        assert_ne!(out1.script_pubkey, out2.script_pubkey);
    }

    #[test]
    fn test_p2pkh_script_embeds_pubkey_hash() {
        let hash = [0xBBu8; 20];
        let output = TxOutput::new_p2pkh(1_000, hash);
        // P2PKH: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG
        assert_eq!(&output.script_pubkey[3..23], &hash);
    }
}
