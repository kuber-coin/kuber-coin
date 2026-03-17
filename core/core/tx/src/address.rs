use crate::{PublicKey, TxError};
use sha2::{Digest, Sha256};

/// KuberCoin mainnet P2PKH address version byte.
/// Addresses start with **'K'**.
pub const MAINNET_ADDRESS_VERSION: u8 = 0x2D;

/// KuberCoin testnet/regtest P2PKH address version byte.
/// Addresses start with **'m'** or **'n'**.
pub const TESTNET_ADDRESS_VERSION: u8 = 0x6F;

/// KuberCoin mainnet P2SH address version byte.
pub const P2SH_MAINNET_VERSION: u8 = 0x32;

/// KuberCoin testnet/regtest P2SH address version byte.
pub const P2SH_TESTNET_VERSION: u8 = 0xC4;

/// Address type — determines encoding format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressType {
    /// Pay-to-Public-Key-Hash (Base58Check, legacy)
    P2PKH,
    /// Pay-to-Script-Hash (Base58Check, BIP-16)
    P2SH,
    /// Pay-to-Witness-Public-Key-Hash (bech32, SegWit v0)
    P2WPKH,
    /// Pay-to-Witness-Script-Hash (bech32, SegWit v0, 32-byte program)
    P2WSH,
    /// Pay-to-Taproot (bech32m, SegWit v1)
    P2TR,
}

/// Address encoding/decoding (P2PKH, P2WPKH, P2TR)
pub struct Address {
    /// Public key hash (20 bytes, used for P2PKH and P2WPKH)
    pub pubkey_hash: [u8; 20],

    /// Network version byte (see [`MAINNET_ADDRESS_VERSION`], [`TESTNET_ADDRESS_VERSION`])
    pub version: u8,

    /// Address type
    pub address_type: AddressType,

    /// Taproot x-only output key (32 bytes, only set for P2TR)
    pub taproot_output_key: Option<[u8; 32]>,
}

impl Address {
    /// Create an address from a public key (mainnet by default).
    ///
    /// Uses version byte `0x2D` so KuberCoin addresses start with **'K'**.
    /// Prefer [`from_pubkey_with_version`](Self::from_pubkey_with_version)
    /// when the active network is known.
    pub fn from_pubkey(pubkey: &PublicKey) -> Self {
        Self {
            pubkey_hash: pubkey.hash(),
            version: MAINNET_ADDRESS_VERSION,
            address_type: AddressType::P2PKH,
            taproot_output_key: None,
        }
    }

    /// Create an address from a public key hash (mainnet by default).
    ///
    /// Prefer [`from_pubkey_hash_with_version`](Self::from_pubkey_hash_with_version)
    /// when the active network is known.
    pub fn from_pubkey_hash(pubkey_hash: [u8; 20]) -> Self {
        Self {
            pubkey_hash,
            version: MAINNET_ADDRESS_VERSION,
            address_type: AddressType::P2PKH,
            taproot_output_key: None,
        }
    }

    /// Create an address with an explicit network version byte.
    pub fn from_pubkey_with_version(pubkey: &PublicKey, version: u8) -> Self {
        Self {
            pubkey_hash: pubkey.hash(),
            version,
            address_type: AddressType::P2PKH,
            taproot_output_key: None,
        }
    }

    /// Create an address from a pubkey hash with an explicit network version byte.
    pub fn from_pubkey_hash_with_version(pubkey_hash: [u8; 20], version: u8) -> Self {
        Self {
            pubkey_hash,
            version,
            address_type: AddressType::P2PKH,
            taproot_output_key: None,
        }
    }

    /// Create a P2WPKH (SegWit v0) address from a public key (mainnet).
    pub fn from_pubkey_p2wpkh(pubkey: &PublicKey) -> Self {
        Self {
            pubkey_hash: pubkey.hash(),
            version: MAINNET_ADDRESS_VERSION,
            address_type: AddressType::P2WPKH,
            taproot_output_key: None,
        }
    }

    /// Create a P2WPKH address with an explicit network version byte.
    pub fn from_pubkey_p2wpkh_with_version(pubkey: &PublicKey, version: u8) -> Self {
        Self {
            pubkey_hash: pubkey.hash(),
            version,
            address_type: AddressType::P2WPKH,
            taproot_output_key: None,
        }
    }

    /// Create a P2TR (Taproot, SegWit v1) address from a 32-byte x-only output key (mainnet).
    pub fn from_taproot_output_key(output_key: [u8; 32]) -> Self {
        Self {
            pubkey_hash: [0u8; 20],
            version: MAINNET_ADDRESS_VERSION,
            address_type: AddressType::P2TR,
            taproot_output_key: Some(output_key),
        }
    }

    /// Create a P2TR address with an explicit network version byte.
    pub fn from_taproot_output_key_with_version(output_key: [u8; 32], version: u8) -> Self {
        Self {
            pubkey_hash: [0u8; 20],
            version,
            address_type: AddressType::P2TR,
            taproot_output_key: Some(output_key),
        }
    }

    /// Create a P2SH address from a 20-byte script hash (mainnet).
    pub fn from_script_hash(script_hash: [u8; 20]) -> Self {
        Self {
            pubkey_hash: script_hash,
            version: P2SH_MAINNET_VERSION,
            address_type: AddressType::P2SH,
            taproot_output_key: None,
        }
    }

    /// Create a P2SH address from a 20-byte script hash with explicit version.
    pub fn from_script_hash_with_version(script_hash: [u8; 20], version: u8) -> Self {
        Self {
            pubkey_hash: script_hash,
            version,
            address_type: AddressType::P2SH,
            taproot_output_key: None,
        }
    }

    /// Encode as a string (Base58Check for P2PKH/P2SH, bech32 for P2WPKH/P2WSH, bech32m for P2TR).
    pub fn encode(&self) -> String {
        match self.address_type {
            AddressType::P2PKH | AddressType::P2SH => self.encode_base58(),
            AddressType::P2WPKH => {
                let network = version_to_network(self.version);
                crate::bech32m::encode_p2wpkh_address(&self.pubkey_hash, network)
                    .expect("valid P2WPKH encoding")
            }
            AddressType::P2WSH => {
                let witness_program = self.taproot_output_key.expect("P2WSH requires 32-byte hash");
                let network = version_to_network(self.version);
                crate::bech32m::encode(crate::bech32m::hrp_for_network_pub(network), 0, &witness_program)
                    .expect("valid P2WSH encoding")
            }
            AddressType::P2TR => {
                let output_key = self.taproot_output_key.expect("P2TR requires output key");
                let network = version_to_network(self.version);
                crate::bech32m::encode_taproot_address(&output_key, network)
                    .expect("valid P2TR encoding")
            }
        }
    }

    /// Encode as Base58Check string (P2PKH only).
    fn encode_base58(&self) -> String {
        let mut payload = Vec::new();
        payload.push(self.version);
        payload.extend_from_slice(&self.pubkey_hash);

        let checksum = self.checksum(&payload);
        payload.extend_from_slice(&checksum);

        bs58::encode(payload).into_string()
    }

    /// Decode from any supported address string (Base58Check, bech32, or bech32m).
    pub fn decode(addr: &str) -> Result<Self, TxError> {
        // Try bech32 decode (SegWit v0: P2WPKH / P2WSH)
        if let Ok((network, pubkey_hash)) = crate::bech32m::decode_p2wpkh_address(addr) {
            let version = network_to_version(&network);
            return Ok(Self {
                pubkey_hash,
                version,
                address_type: AddressType::P2WPKH,
                taproot_output_key: None,
            });
        }

        // Try bech32 P2WSH (witness v0, 32-byte program)
        if let Ok((network, witness_hash)) = crate::bech32m::decode_p2wsh_address(addr) {
            let version = network_to_version(&network);
            return Ok(Self {
                pubkey_hash: [0u8; 20],
                version,
                address_type: AddressType::P2WSH,
                taproot_output_key: Some(witness_hash),
            });
        }

        // Try bech32m P2TR (Taproot)
        if let Ok((network, output_key)) = crate::bech32m::decode_taproot_address(addr) {
            let version = network_to_version(&network);
            return Ok(Self {
                pubkey_hash: [0u8; 20],
                version,
                address_type: AddressType::P2TR,
                taproot_output_key: Some(output_key),
            });
        }

        // Fall back to Base58Check (P2PKH / P2SH)
        Self::decode_base58(addr)
    }

    /// Decode from Base58Check string (P2PKH or P2SH).
    fn decode_base58(addr: &str) -> Result<Self, TxError> {
        let bytes = bs58::decode(addr)
            .into_vec()
            .map_err(|e| TxError::InvalidAddress(format!("invalid base58: {}", e)))?;

        if bytes.len() != 25 {
            return Err(TxError::InvalidAddress(format!(
                "invalid address length: {}",
                bytes.len()
            )));
        }

        let version = bytes[0];
        let pubkey_hash: [u8; 20] = bytes[1..21].try_into().unwrap();
        let checksum = &bytes[21..25];

        // Verify checksum
        let payload = &bytes[..21];
        let expected_checksum = Address::checksum_static(payload);
        if checksum != expected_checksum {
            return Err(TxError::InvalidAddress("invalid checksum".into()));
        }

        // Determine address type from version byte
        let address_type = match version {
            MAINNET_ADDRESS_VERSION | TESTNET_ADDRESS_VERSION => AddressType::P2PKH,
            P2SH_MAINNET_VERSION | P2SH_TESTNET_VERSION => AddressType::P2SH,
            _ => {
                return Err(TxError::InvalidAddress(format!(
                    "unknown version byte: 0x{:02x}",
                    version
                )));
            }
        };

        Ok(Self {
            pubkey_hash,
            version,
            address_type,
            taproot_output_key: None,
        })
    }

    /// Generate the corresponding scriptPubKey for this address.
    pub fn to_script_pubkey(&self) -> Vec<u8> {
        match self.address_type {
            AddressType::P2PKH => {
                // OP_DUP OP_HASH160 <20> <hash> OP_EQUALVERIFY OP_CHECKSIG
                let mut script = Vec::with_capacity(25);
                script.push(0x76); // OP_DUP
                script.push(0xa9); // OP_HASH160
                script.push(20);   // push 20 bytes
                script.extend_from_slice(&self.pubkey_hash);
                script.push(0x88); // OP_EQUALVERIFY
                script.push(0xac); // OP_CHECKSIG
                script
            }
            AddressType::P2SH => {
                // OP_HASH160 <20> <hash> OP_EQUAL
                let mut script = Vec::with_capacity(23);
                script.push(0xa9); // OP_HASH160
                script.push(20);
                script.extend_from_slice(&self.pubkey_hash);
                script.push(0x87); // OP_EQUAL
                script
            }
            AddressType::P2WPKH => {
                // OP_0 <20> <hash>
                let mut script = Vec::with_capacity(22);
                script.push(0x00); // OP_0 (witness v0)
                script.push(20);
                script.extend_from_slice(&self.pubkey_hash);
                script
            }
            AddressType::P2WSH => {
                // OP_0 <32> <hash>
                let hash = self.taproot_output_key.unwrap_or([0u8; 32]);
                let mut script = Vec::with_capacity(34);
                script.push(0x00); // OP_0 (witness v0)
                script.push(32);
                script.extend_from_slice(&hash);
                script
            }
            AddressType::P2TR => {
                // OP_1 <32> <output_key>
                let key = self.taproot_output_key.unwrap_or([0u8; 32]);
                let mut script = Vec::with_capacity(34);
                script.push(0x51); // OP_1 (witness v1)
                script.push(32);
                script.extend_from_slice(&key);
                script
            }
        }
    }

    /// Calculate checksum (first 4 bytes of double SHA256)
    fn checksum(&self, payload: &[u8]) -> [u8; 4] {
        Self::checksum_static(payload)
    }

    fn checksum_static(payload: &[u8]) -> [u8; 4] {
        let hash1 = Sha256::digest(payload);
        let hash2 = Sha256::digest(hash1);
        [hash2[0], hash2[1], hash2[2], hash2[3]]
    }
}

impl std::fmt::Display for Address {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.encode())
    }
}

/// Map address version byte to network name for bech32 encoding.
fn version_to_network(version: u8) -> &'static str {
    match version {
        MAINNET_ADDRESS_VERSION | P2SH_MAINNET_VERSION => "mainnet",
        _ => "testnet",
    }
}

/// Map network name back to address version byte.
fn network_to_version(network: &str) -> u8 {
    match network {
        "mainnet" => MAINNET_ADDRESS_VERSION,
        _ => TESTNET_ADDRESS_VERSION,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PrivateKey;

    #[test]
    fn test_address_from_pubkey() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);

        assert_eq!(address.version, 0x2D);
        assert_eq!(address.pubkey_hash.len(), 20);
    }

    #[test]
    fn test_address_encode_decode() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);

        let encoded = address.encode();
        let decoded = Address::decode(&encoded).unwrap();

        assert_eq!(address.pubkey_hash, decoded.pubkey_hash);
        assert_eq!(address.version, decoded.version);
    }

    #[test]
    fn test_address_encode_format() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);

        let encoded = address.encode();

        // KuberCoin mainnet addresses start with 'K'
        assert!(encoded.starts_with('K'));
        assert!(encoded.len() > 26); // Typical address length
    }

    #[test]
    fn test_address_invalid_checksum() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);

        let mut encoded = address.encode();
        // Corrupt the checksum by changing last character
        encoded.pop();
        encoded.push('X');

        let result = Address::decode(&encoded);
        assert!(result.is_err());
    }

    #[test]
    fn test_address_deterministic() {
        let privkey = PrivateKey::from_bytes(&[0x01; 32]).unwrap();
        let pubkey = privkey.public_key();

        let addr1 = Address::from_pubkey(&pubkey);
        let addr2 = Address::from_pubkey(&pubkey);

        assert_eq!(addr1.encode(), addr2.encode());
    }

    #[test]
    fn test_version_constants() {
        assert_eq!(MAINNET_ADDRESS_VERSION, 0x2D);
        assert_eq!(TESTNET_ADDRESS_VERSION, 0x6F);
    }

    #[test]
    fn test_testnet_address_prefix() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey_with_version(&pubkey, TESTNET_ADDRESS_VERSION);

        let encoded = address.encode();
        assert_eq!(address.version, TESTNET_ADDRESS_VERSION);
        // Testnet addresses start with 'm' or 'n'
        assert!(
            encoded.starts_with('m') || encoded.starts_with('n'),
            "testnet address should start with 'm' or 'n', got: {}",
            encoded
        );
    }

    #[test]
    fn test_from_pubkey_hash_with_version() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let hash = pubkey.hash();

        let mainnet = Address::from_pubkey_hash_with_version(hash, MAINNET_ADDRESS_VERSION);
        let testnet = Address::from_pubkey_hash_with_version(hash, TESTNET_ADDRESS_VERSION);

        assert_eq!(mainnet.version, MAINNET_ADDRESS_VERSION);
        assert_eq!(testnet.version, TESTNET_ADDRESS_VERSION);
        assert_eq!(mainnet.pubkey_hash, testnet.pubkey_hash);
        assert_ne!(mainnet.encode(), testnet.encode());
    }

    #[test]
    fn test_p2wpkh_address_encode_decode() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey_p2wpkh(&pubkey);

        assert_eq!(address.address_type, AddressType::P2WPKH);
        let encoded = address.encode();
        assert!(encoded.starts_with("kb1"), "mainnet P2WPKH should start with kb1, got: {}", encoded);

        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.pubkey_hash, address.pubkey_hash);
        assert_eq!(decoded.address_type, AddressType::P2WPKH);
    }

    #[test]
    fn test_p2wpkh_testnet_address() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey_p2wpkh_with_version(&pubkey, TESTNET_ADDRESS_VERSION);

        let encoded = address.encode();
        assert!(encoded.starts_with("tb1"), "testnet P2WPKH should start with tb1, got: {}", encoded);
    }

    #[test]
    fn test_p2pkh_type_preserved() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);

        assert_eq!(address.address_type, AddressType::P2PKH);
        let encoded = address.encode();
        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.address_type, AddressType::P2PKH);
    }

    #[test]
    fn test_p2tr_address_encode_decode() {
        // Use a deterministic 32-byte x-only output key
        let output_key: [u8; 32] = [
            0xd6, 0x88, 0x9c, 0xb0, 0x81, 0x03, 0x6e, 0x0f,
            0xad, 0xc9, 0xb0, 0x2f, 0xf0, 0x05, 0x86, 0x22,
            0x4b, 0xb0, 0x6c, 0xbe, 0x94, 0x59, 0x96, 0xac,
            0x21, 0x1a, 0x25, 0x19, 0x4a, 0xb8, 0x24, 0x01,
        ];

        let address = Address::from_taproot_output_key(output_key);
        assert_eq!(address.address_type, AddressType::P2TR);
        assert_eq!(address.taproot_output_key.unwrap(), output_key);

        let encoded = address.encode();
        assert!(encoded.starts_with("kb1p"), "mainnet P2TR should start with kb1p, got: {}", encoded);

        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.address_type, AddressType::P2TR);
        assert_eq!(decoded.taproot_output_key.unwrap(), output_key);
    }

    #[test]
    fn test_p2tr_testnet_address() {
        let output_key = [0xaa; 32];
        let address = Address::from_taproot_output_key_with_version(output_key, TESTNET_ADDRESS_VERSION);

        let encoded = address.encode();
        assert!(encoded.starts_with("tb1p"), "testnet P2TR should start with tb1p, got: {}", encoded);

        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.address_type, AddressType::P2TR);
        assert_eq!(decoded.taproot_output_key.unwrap(), output_key);
    }

    #[test]
    fn test_p2tr_pubkey_hash_is_zeroed() {
        let output_key = [0x55; 32];
        let address = Address::from_taproot_output_key(output_key);
        assert_eq!(address.pubkey_hash, [0u8; 20], "P2TR should have zeroed pubkey_hash");
    }

    #[test]
    fn test_p2sh_address_roundtrip() {
        let script_hash = [0x42u8; 20];
        let address = Address::from_script_hash(script_hash);
        assert_eq!(address.address_type, AddressType::P2SH);
        assert_eq!(address.version, P2SH_MAINNET_VERSION);

        let encoded = address.encode();
        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.address_type, AddressType::P2SH);
        assert_eq!(decoded.pubkey_hash, script_hash);
        assert_eq!(decoded.version, P2SH_MAINNET_VERSION);
    }

    #[test]
    fn test_p2sh_testnet_address() {
        let script_hash = [0x42u8; 20];
        let address = Address::from_script_hash_with_version(script_hash, P2SH_TESTNET_VERSION);
        assert_eq!(address.address_type, AddressType::P2SH);
        let encoded = address.encode();
        let decoded = Address::decode(&encoded).unwrap();
        assert_eq!(decoded.address_type, AddressType::P2SH);
    }

    #[test]
    fn test_unknown_version_byte_rejected() {
        // Build a fake Base58Check address with version 0x00 (Bitcoin P2PKH)
        let mut payload = vec![0x00u8];
        payload.extend_from_slice(&[0xAA; 20]);
        let hash1 = Sha256::digest(&payload);
        let hash2 = Sha256::digest(hash1);
        payload.extend_from_slice(&hash2[..4]);
        let encoded = bs58::encode(&payload).into_string();

        let result = Address::decode(&encoded);
        assert!(result.is_err(), "should reject unknown version 0x00");
    }

    #[test]
    fn test_to_script_pubkey_p2pkh() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey(&pubkey);
        let script = address.to_script_pubkey();
        assert_eq!(script.len(), 25);
        assert_eq!(script[0], 0x76); // OP_DUP
        assert_eq!(script[1], 0xa9); // OP_HASH160
        assert_eq!(script[24], 0xac); // OP_CHECKSIG
    }

    #[test]
    fn test_to_script_pubkey_p2sh() {
        let address = Address::from_script_hash([0x42; 20]);
        let script = address.to_script_pubkey();
        assert_eq!(script.len(), 23);
        assert_eq!(script[0], 0xa9); // OP_HASH160
        assert_eq!(script[22], 0x87); // OP_EQUAL
    }

    #[test]
    fn test_to_script_pubkey_p2wpkh() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let address = Address::from_pubkey_p2wpkh(&pubkey);
        let script = address.to_script_pubkey();
        assert_eq!(script.len(), 22);
        assert_eq!(script[0], 0x00); // OP_0
        assert_eq!(script[1], 20);   // push 20 bytes
    }

    #[test]
    fn test_to_script_pubkey_p2tr() {
        let output_key = [0xd6; 32];
        let address = Address::from_taproot_output_key(output_key);
        let script = address.to_script_pubkey();
        assert_eq!(script.len(), 34);
        assert_eq!(script[0], 0x51); // OP_1
        assert_eq!(script[1], 32);   // push 32 bytes
        assert_eq!(&script[2..], &output_key);
    }

    #[test]
    fn test_decode_invalid_string_fails() {
        assert!(Address::decode("not_a_valid_address!!").is_err());
    }

    #[test]
    fn test_two_pubkeys_produce_different_addresses() {
        let key1 = PrivateKey::from_bytes(&[1u8; 32]).unwrap().public_key();
        let key2 = PrivateKey::from_bytes(&[2u8; 32]).unwrap().public_key();
        let addr1 = Address::from_pubkey(&key1).encode();
        let addr2 = Address::from_pubkey(&key2).encode();
        assert_ne!(addr1, addr2);
    }

    #[test]
    fn test_testnet_version_differs_from_mainnet() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let mainnet = Address::from_pubkey(&pubkey);
        let testnet = Address::from_pubkey_with_version(&pubkey, TESTNET_ADDRESS_VERSION);
        assert_ne!(mainnet.version, testnet.version);
        assert_ne!(mainnet.encode(), testnet.encode());
    }

    #[test]
    fn test_from_pubkey_hash_stores_correct_hash() {
        let hash = [0xABu8; 20];
        let address = Address::from_pubkey_hash(hash);
        assert_eq!(address.pubkey_hash, hash);
        assert_eq!(address.address_type, AddressType::P2PKH);
    }

    #[test]
    fn test_taproot_all_zeros_key_encodes_nonempty() {
        let addr = Address::from_taproot_output_key([0u8; 32]);
        assert!(!addr.encode().is_empty());
    }

    #[test]
    fn test_p2pkh_mainnet_encode_starts_with_k() {
        // KuberCoin mainnet P2PKH uses version 0x2D, which Base58Check-encodes to 'K'
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let encoded = Address::from_pubkey(&pubkey).encode();
        assert!(encoded.starts_with('K'), "mainnet P2PKH should start with 'K', got: {}", encoded);
    }

    #[test]
    fn test_encode_nonempty_for_all_address_types() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        assert!(!Address::from_pubkey(&pubkey).encode().is_empty());
        assert!(!Address::from_pubkey_p2wpkh(&pubkey).encode().is_empty());
        assert!(!Address::from_taproot_output_key([1u8; 32]).encode().is_empty());
        assert!(!Address::from_script_hash([0u8; 20]).encode().is_empty());
    }
}
