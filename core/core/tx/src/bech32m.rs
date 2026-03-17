// Bech32m encoding for Taproot addresses (BIP-350)
//
// Bech32m is an improved version of Bech32 (BIP-173) designed for
// witness version 1+ addresses (Taproot and future upgrades).
//
// Key differences from Bech32:
// - Uses a different constant in the checksum (0x2bc830a3 instead of 1)
// - Prevents malleability issues with witness v1+ addresses
//
// BIP-350 Reference: https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki

use std::fmt;

/// KuberCoin mainnet HRP for bech32/bech32m addresses.
pub const HRP_MAINNET: &str = "kb";
/// KuberCoin testnet HRP.
pub const HRP_TESTNET: &str = "tb";
/// KuberCoin regtest HRP.
pub const HRP_REGTEST: &str = "kbrt";

/// Bech32 constant (witness version 0, BIP-173).
const BECH32_CONST: u32 = 1;

/// Bech32m character set
const CHARSET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/// Bech32m constant
const BECH32M_CONST: u32 = 0x2bc830a3;

/// Generator values for Bech32m checksum
const GEN: [u32; 5] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

/// Encode data to Bech32m format
///
/// # Arguments
/// * `hrp` - Human-readable part (e.g., "bc" for mainnet, "tb" for testnet)
/// * `witver` - Witness version (1 for Taproot)
/// * `witprog` - Witness program (the 32-byte Taproot output key)
///
/// # Returns
/// The Bech32m-encoded address string
pub fn encode(hrp: &str, witver: u8, witprog: &[u8]) -> Result<String, Bech32mError> {
    // Validate inputs
    if witver > 16 {
        return Err(Bech32mError::InvalidWitnessVersion(witver));
    }

    if witprog.is_empty() || witprog.len() > 40 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    // Witness v0: P2WPKH (20 bytes) or P2WSH (32 bytes)
    if witver == 0 && witprog.len() != 20 && witprog.len() != 32 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    // For witness version 1+, program must be 32 bytes (Taproot) or other specific lengths
    if witver >= 1 && witprog.len() != 32 && witprog.len() != 40 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    // Convert witness program to 5-bit groups
    let mut data = vec![witver];
    data.extend(convert_bits(witprog, 8, 5, true)?);

    // Witness v0 uses bech32 (BIP-173), v1+ uses bech32m (BIP-350)
    let constant = if witver == 0 { BECH32_CONST } else { BECH32M_CONST };
    encode_bech32_inner(hrp, &data, constant)
}

/// Decode a Bech32m address
///
/// # Returns
/// (hrp, witver, witprog) tuple
pub fn decode(addr: &str) -> Result<(String, u8, Vec<u8>), Bech32mError> {
    // Decode with unknown constant first
    let (hrp, data, checksum_const) = decode_bech32_detect(addr)?;

    if data.is_empty() {
        return Err(Bech32mError::InvalidData);
    }

    let witver = data[0];
    if witver > 16 {
        return Err(Bech32mError::InvalidWitnessVersion(witver));
    }

    // Verify correct encoding variant: v0 must use bech32, v1+ must use bech32m
    let expected = if witver == 0 { BECH32_CONST } else { BECH32M_CONST };
    if checksum_const != expected {
        return Err(Bech32mError::InvalidChecksum);
    }

    // Convert from 5-bit groups to 8-bit bytes
    let witprog = convert_bits(&data[1..], 5, 8, false)?;

    if witprog.is_empty() || witprog.len() > 40 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    // v0: 20 (P2WPKH) or 32 (P2WSH) bytes
    if witver == 0 && witprog.len() != 20 && witprog.len() != 32 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    // For witness version 1+, program must be 32 or 40 bytes
    if witver >= 1 && witprog.len() != 32 && witprog.len() != 40 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    Ok((hrp, witver, witprog))
}

/// Encode a P2WPKH (witness v0) address.
///
/// # Arguments
/// * `pubkey_hash` - 20-byte HASH160 of the compressed public key
/// * `network` - "mainnet", "testnet", or "regtest"
pub fn encode_p2wpkh_address(
    pubkey_hash: &[u8; 20],
    network: &str,
) -> Result<String, Bech32mError> {
    let hrp = hrp_for_network(network)?;
    encode(hrp, 0, pubkey_hash)
}

/// Decode a P2WPKH address and return (network, pubkey_hash).
pub fn decode_p2wpkh_address(addr: &str) -> Result<(String, [u8; 20]), Bech32mError> {
    let (hrp, witver, witprog) = decode(addr)?;
    if witver != 0 {
        return Err(Bech32mError::NotSegwitV0Address(witver));
    }
    if witprog.len() != 20 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }
    let network = network_for_hrp(&hrp)?;
    let mut hash = [0u8; 20];
    hash.copy_from_slice(&witprog);
    Ok((network, hash))
}

/// Decode a P2WSH (witness v0, 32-byte program) address.
pub fn decode_p2wsh_address(addr: &str) -> Result<(String, [u8; 32]), Bech32mError> {
    let (hrp, witver, witprog) = decode(addr)?;
    if witver != 0 {
        return Err(Bech32mError::NotSegwitV0Address(witver));
    }
    if witprog.len() != 32 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }
    let network = network_for_hrp(&hrp)?;
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&witprog);
    Ok((network, hash))
}

/// Public accessor for HRP mapping (used by address.rs for P2WSH encoding).
pub fn hrp_for_network_pub(network: &str) -> &'static str {
    hrp_for_network(network).expect("valid network")
}

/// Map a network name to the correct HRP.
fn hrp_for_network(network: &str) -> Result<&'static str, Bech32mError> {
    match network {
        "mainnet" => Ok(HRP_MAINNET),
        "testnet" | "signet" => Ok(HRP_TESTNET),
        "regtest" => Ok(HRP_REGTEST),
        _ => Err(Bech32mError::InvalidNetwork),
    }
}

/// Map an HRP back to a network name.
fn network_for_hrp(hrp: &str) -> Result<String, Bech32mError> {
    match hrp {
        h if h == HRP_MAINNET => Ok("mainnet".to_string()),
        h if h == HRP_TESTNET => Ok("testnet".to_string()),
        h if h == HRP_REGTEST => Ok("regtest".to_string()),
        _ => Err(Bech32mError::InvalidHrp),
    }
}

/// Encode with an arbitrary bech32 / bech32m constant.
fn encode_bech32_inner(hrp: &str, data: &[u8], constant: u32) -> Result<String, Bech32mError> {
    // Validate HRP
    if hrp.is_empty() || hrp.len() > 83 {
        return Err(Bech32mError::InvalidHrp);
    }

    for c in hrp.chars() {
        if !c.is_ascii() || !(33..=126).contains(&(c as u8)) {
            return Err(Bech32mError::InvalidHrp);
        }
    }

    // Create checksum with the given constant
    let checksum = create_checksum_with(hrp, data, constant)?;

    // Build result
    let mut result = String::with_capacity(hrp.len() + 1 + data.len() + 6);
    result.push_str(hrp);
    result.push('1'); // Separator

    for &d in data {
        if d >= 32 {
            return Err(Bech32mError::InvalidData);
        }
        result.push(CHARSET[d as usize] as char);
    }

    for &c in &checksum {
        result.push(CHARSET[c as usize] as char);
    }

    Ok(result)
}

/// Decode a bech32/bech32m string, returning the detected checksum constant.
fn decode_bech32_detect(s: &str) -> Result<(String, Vec<u8>, u32), Bech32mError> {
    // Check length
    if s.len() < 8 || s.len() > 90 {
        return Err(Bech32mError::InvalidLength(s.len()));
    }

    // Check case
    let has_lower = s.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = s.chars().any(|c| c.is_ascii_uppercase());
    if has_lower && has_upper {
        return Err(Bech32mError::MixedCase);
    }

    // Convert to lowercase for processing
    let s = s.to_lowercase();

    // Find separator
    let sep_pos = s.rfind('1').ok_or(Bech32mError::NoSeparator)?;
    if sep_pos == 0 {
        return Err(Bech32mError::InvalidHrp);
    }

    let hrp = &s[..sep_pos];
    let data_part = &s[sep_pos + 1..];

    // Validate HRP
    for c in hrp.chars() {
        if !c.is_ascii() || !(33..=126).contains(&(c as u8)) {
            return Err(Bech32mError::InvalidHrp);
        }
    }

    // Decode data
    let mut data = Vec::with_capacity(data_part.len());
    for c in data_part.chars() {
        let pos = CHARSET
            .iter()
            .position(|&x| x == c as u8)
            .ok_or(Bech32mError::InvalidCharacter(c))?;
        data.push(pos as u8);
    }

    // Detect which constant satisfies the checksum
    let mut values = hrp_expand(hrp)?;
    values.extend_from_slice(&data);
    let residue = polymod(&values);

    let detected = if residue == BECH32_CONST {
        BECH32_CONST
    } else if residue == BECH32M_CONST {
        BECH32M_CONST
    } else {
        return Err(Bech32mError::InvalidChecksum);
    };

    // Remove checksum (last 6 characters)
    data.truncate(data.len() - 6);

    Ok((hrp.to_string(), data, detected))
}

/// Create a checksum using the given constant (BECH32_CONST or BECH32M_CONST).
fn create_checksum_with(hrp: &str, data: &[u8], constant: u32) -> Result<Vec<u8>, Bech32mError> {
    let mut values = hrp_expand(hrp)?;
    values.extend_from_slice(data);
    values.extend_from_slice(&[0u8; 6]);

    let polymod = polymod(&values) ^ constant;

    let mut checksum = Vec::with_capacity(6);
    for i in 0..6 {
        checksum.push(((polymod >> (5 * (5 - i))) & 31) as u8);
    }

    Ok(checksum)
}

/// Expand HRP for checksum computation
fn hrp_expand(hrp: &str) -> Result<Vec<u8>, Bech32mError> {
    let mut result = Vec::with_capacity(hrp.len() * 2 + 1);

    // High bits
    for c in hrp.chars() {
        if !c.is_ascii() {
            return Err(Bech32mError::InvalidHrp);
        }
        result.push((c as u8) >> 5);
    }

    // Separator
    result.push(0);

    // Low bits
    for c in hrp.chars() {
        result.push((c as u8) & 31);
    }

    Ok(result)
}

/// Compute Bech32m polymod
fn polymod(values: &[u8]) -> u32 {
    let mut chk: u32 = 1;

    for &value in values {
        let top = chk >> 25;
        chk = (chk & 0x1ffffff) << 5 ^ (value as u32);

        for (i, &gen_val) in GEN.iter().enumerate() {
            if (top >> i) & 1 != 0 {
                chk ^= gen_val;
            }
        }
    }

    chk
}

/// Convert between bit groups
///
/// # Arguments
/// * `data` - Input data
/// * `frombits` - Number of bits per input element
/// * `tobits` - Number of bits per output element
/// * `pad` - Whether to pad the output
fn convert_bits(data: &[u8], frombits: u8, tobits: u8, pad: bool) -> Result<Vec<u8>, Bech32mError> {
    let mut acc: u32 = 0;
    let mut bits: u8 = 0;
    let mut result = Vec::new();
    let maxv = (1u32 << tobits) - 1;

    for &value in data {
        if (value as u32) >= (1u32 << frombits) {
            return Err(Bech32mError::InvalidData);
        }

        acc = (acc << frombits) | (value as u32);
        bits += frombits;

        while bits >= tobits {
            bits -= tobits;
            result.push(((acc >> bits) & maxv) as u8);
        }
    }

    if pad {
        if bits > 0 {
            result.push(((acc << (tobits - bits)) & maxv) as u8);
        }
    } else if bits >= frombits || ((acc << (tobits - bits)) & maxv) != 0 {
        return Err(Bech32mError::InvalidPadding);
    }

    Ok(result)
}

/// Create a Taproot address (P2TR)
///
/// # Arguments
/// * `output_key` - The 32-byte Taproot output key
/// * `network` - "mainnet", "testnet", "regtest", or "signet"
///
/// # Returns
/// Bech32m-encoded Taproot address
pub fn encode_taproot_address(
    output_key: &[u8; 32],
    network: &str,
) -> Result<String, Bech32mError> {
    let hrp = hrp_for_network(network)?;
    encode(hrp, 1, output_key)
}

/// Decode a Taproot address
///
/// # Returns
/// (network, output_key) tuple
pub fn decode_taproot_address(addr: &str) -> Result<(String, [u8; 32]), Bech32mError> {
    let (hrp, witver, witprog) = decode(addr)?;

    // Verify witness version is 1 (Taproot)
    if witver != 1 {
        return Err(Bech32mError::NotTaprootAddress(witver));
    }

    // Verify witness program is 32 bytes
    if witprog.len() != 32 {
        return Err(Bech32mError::InvalidWitnessProgramLength(witprog.len()));
    }

    let network = network_for_hrp(&hrp)?;

    let mut output_key = [0u8; 32];
    output_key.copy_from_slice(&witprog);

    Ok((network, output_key))
}

/// Bech32m encoding errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Bech32mError {
    /// Invalid HRP
    InvalidHrp,
    /// Invalid witness version
    InvalidWitnessVersion(u8),
    /// Invalid witness program length
    InvalidWitnessProgramLength(usize),
    /// Invalid data
    InvalidData,
    /// Invalid length
    InvalidLength(usize),
    /// Mixed case in address
    MixedCase,
    /// No separator found
    NoSeparator,
    /// Invalid character
    InvalidCharacter(char),
    /// Invalid checksum
    InvalidChecksum,
    /// Invalid padding
    InvalidPadding,
    /// Invalid network
    InvalidNetwork,
    /// Not a Taproot address
    NotTaprootAddress(u8),
    /// Not a SegWit v0 address
    NotSegwitV0Address(u8),
}

impl fmt::Display for Bech32mError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Bech32mError::InvalidHrp => write!(f, "Invalid HRP"),
            Bech32mError::InvalidWitnessVersion(v) => {
                write!(f, "Invalid witness version: {} (must be 0-16)", v)
            }
            Bech32mError::InvalidWitnessProgramLength(len) => {
                write!(f, "Invalid witness program length: {} bytes", len)
            }
            Bech32mError::InvalidData => write!(f, "Invalid Bech32m data"),
            Bech32mError::InvalidLength(len) => {
                write!(f, "Invalid Bech32m length: {} (must be 8-90)", len)
            }
            Bech32mError::MixedCase => write!(f, "Mixed case in Bech32m string"),
            Bech32mError::NoSeparator => write!(f, "No separator '1' found"),
            Bech32mError::InvalidCharacter(c) => {
                write!(f, "Invalid Bech32m character: '{}'", c)
            }
            Bech32mError::InvalidChecksum => write!(f, "Invalid Bech32m checksum"),
            Bech32mError::InvalidPadding => write!(f, "Invalid Bech32m padding"),
            Bech32mError::InvalidNetwork => write!(f, "Invalid network"),
            Bech32mError::NotTaprootAddress(v) => {
                write!(
                    f,
                    "Not a Taproot address (witness version {} instead of 1)",
                    v
                )
            }
            Bech32mError::NotSegwitV0Address(v) => {
                write!(
                    f,
                    "Not a SegWit v0 address (witness version {} instead of 0)",
                    v
                )
            }
        }
    }
}

impl std::error::Error for Bech32mError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_bech32m() {
        let hrp = HRP_MAINNET;
        let witver = 1;
        let witprog = [0x42u8; 32];

        let addr = encode(hrp, witver, &witprog).unwrap();
        assert!(addr.starts_with(&format!("{}1p", HRP_MAINNET)));

        let (decoded_hrp, decoded_witver, decoded_witprog) = decode(&addr).unwrap();
        assert_eq!(decoded_hrp, hrp);
        assert_eq!(decoded_witver, witver);
        assert_eq!(decoded_witprog, witprog);
    }

    #[test]
    fn test_taproot_address_mainnet() {
        let output_key = [0x79u8; 32];

        let addr = encode_taproot_address(&output_key, "mainnet").unwrap();
        assert!(addr.starts_with(&format!("{}1p", HRP_MAINNET)));

        let (network, decoded_key) = decode_taproot_address(&addr).unwrap();
        assert_eq!(network, "mainnet");
        assert_eq!(decoded_key, output_key);
    }

    #[test]
    fn test_taproot_address_testnet() {
        let output_key = [0xABu8; 32];

        let addr = encode_taproot_address(&output_key, "testnet").unwrap();
        assert!(addr.starts_with("tb1p"));

        let (network, decoded_key) = decode_taproot_address(&addr).unwrap();
        assert_eq!(network, "testnet");
        assert_eq!(decoded_key, output_key);
    }

    #[test]
    fn test_taproot_address_regtest() {
        let output_key = [0x11u8; 32];

        let addr = encode_taproot_address(&output_key, "regtest").unwrap();
        assert!(addr.starts_with(&format!("{}1p", HRP_REGTEST)));

        let (network, decoded_key) = decode_taproot_address(&addr).unwrap();
        assert_eq!(network, "regtest");
        assert_eq!(decoded_key, output_key);
    }

    #[test]
    fn test_invalid_witness_version() {
        let hrp = HRP_MAINNET;
        let witprog = [0u8; 32];

        // Version > 16 should fail
        assert!(encode(hrp, 17, &witprog).is_err());
    }

    #[test]
    fn test_invalid_witness_program_length() {
        let hrp = HRP_MAINNET;
        let witver = 1;

        // Empty program
        assert!(encode(hrp, witver, &[]).is_err());

        // Too long
        assert!(encode(hrp, witver, &[0u8; 41]).is_err());

        // Wrong length for witness v1 (must be 32 or 40)
        assert!(encode(hrp, witver, &[0u8; 20]).is_err());
    }

    #[test]
    fn test_mixed_case_rejection() {
        // Mixed case should be rejected
        let addr = "bc1pAAAAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        assert!(matches!(decode(addr), Err(Bech32mError::MixedCase)));
    }

    #[test]
    fn test_invalid_characters() {
        // 'b' is actually in the charset, so let's use a character that isn't
        // 'o' is not in the Bech32 character set
        let addr = "bc1pooooooooooooooooooooooooooooooooooooooooooooooooooooo";
        assert!(decode(addr).is_err());
    }

    #[test]
    fn test_p2wpkh_roundtrip() {
        let pubkey_hash = [0xABu8; 20];
        let addr = encode_p2wpkh_address(&pubkey_hash, "mainnet").unwrap();
        assert!(addr.starts_with(&format!("{}1q", HRP_MAINNET)));

        let (network, decoded_hash) = decode_p2wpkh_address(&addr).unwrap();
        assert_eq!(network, "mainnet");
        assert_eq!(decoded_hash, pubkey_hash);
    }

    #[test]
    fn test_no_separator() {
        let addr = "bcpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
        assert!(matches!(decode(addr), Err(Bech32mError::NoSeparator)));
    }

    #[test]
    fn test_invalid_length() {
        // Too short
        let addr = "bc1p";
        assert!(decode(addr).is_err());

        // Too long
        let addr = format!("bc1p{}", "q".repeat(100));
        assert!(decode(&addr).is_err());
    }

    #[test]
    fn test_polymod() {
        // Test polymod with known values
        let values = vec![3, 3, 0, 2, 3];
        let result = polymod(&values);
        assert!(result != 0); // Just verify it computes something
    }

    #[test]
    fn test_hrp_expand() {
        let hrp = "bc";
        let expanded = hrp_expand(hrp).unwrap();

        // Should be: [high bits] + [0] + [low bits]
        // 'b' = 98 = 0b01100010 -> high=3, low=2
        // 'c' = 99 = 0b01100011 -> high=3, low=3
        assert_eq!(expanded, vec![3, 3, 0, 2, 3]);
    }

    #[test]
    fn test_convert_bits() {
        // Convert from 8-bit to 5-bit
        let data = vec![0xFF, 0xAA];
        let result = convert_bits(&data, 8, 5, true).unwrap();
        assert!(!result.is_empty());

        // All values should be < 32
        for &val in &result {
            assert!(val < 32);
        }
    }

    #[test]
    fn test_bech32m_vs_bech32_const() {
        // Verify we're using the correct Bech32m constant
        assert_eq!(BECH32M_CONST, 0x2bc830a3);
        assert_ne!(BECH32M_CONST, 1); // Bech32 uses 1
    }

    #[test]
    fn test_decode_non_taproot_address() {
        // Create a witness v0 address (SegWit, not Taproot)
        let addr = encode("bc", 0, &[0u8; 20]).unwrap();

        // Should fail when decoded as Taproot
        assert!(matches!(
            decode_taproot_address(&addr),
            Err(Bech32mError::NotTaprootAddress(0))
        ));
    }
}
