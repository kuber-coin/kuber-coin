//! Timelock script builders: CLTV, CSV, and HTLC.
//!
//! Provides convenience functions for constructing Bitcoin-compatible
//! timelocked scripts and Hash Time-Locked Contracts.

use crate::script::Script;

/// Encode a non-negative integer as a Bitcoin script number (little-endian with sign bit).
fn push_scriptnum(bytes: &mut Vec<u8>, n: i64) {
    if n == 0 {
        bytes.push(0x00); // OP_0
        return;
    }
    if n >= 1 && n <= 16 {
        bytes.push(0x50 + n as u8); // OP_1..OP_16
        return;
    }
    // Encode as minimal CScriptNum
    let negative = n < 0;
    let mut abs = if negative { -(n as i128) } else { n as i128 } as u64;
    let mut buf = Vec::new();
    while abs > 0 {
        buf.push((abs & 0xff) as u8);
        abs >>= 8;
    }
    // If the high bit is set, add a 0x00 (or 0x80 for negative) byte
    if buf.last().map_or(false, |b| b & 0x80 != 0) {
        buf.push(if negative { 0x80 } else { 0x00 });
    } else if negative {
        let last = buf.len() - 1;
        buf[last] |= 0x80;
    }
    // Push length then data
    let len = buf.len();
    assert!(len <= 75); // fits in direct push
    bytes.push(len as u8);
    bytes.extend_from_slice(&buf);
}

/// Build a CLTV (BIP-65) script that locks until `locktime`.
///
/// Script: `<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey> OP_CHECKSIG`
///
/// If `locktime <  500_000_000` it's interpreted as a block height.
/// If `locktime >= 500_000_000` it's a Unix timestamp.
pub fn build_cltv_script(locktime: u32, pubkey: &[u8]) -> Script {
    let mut bytes = Vec::new();
    push_scriptnum(&mut bytes, locktime as i64);
    bytes.push(0xb1); // OP_CHECKLOCKTIMEVERIFY
    bytes.push(0x75); // OP_DROP
    bytes.push(pubkey.len() as u8);
    bytes.extend_from_slice(pubkey);
    bytes.push(0xac); // OP_CHECKSIG
    Script::new(bytes)
}

/// Build a CSV (BIP-112) script that locks for `sequence` blocks/time.
///
/// Script: `<sequence> OP_CHECKSEQUENCEVERIFY OP_DROP <pubkey> OP_CHECKSIG`
///
/// Bit 22 selects time-based (512-second granularity) vs. block-based.
pub fn build_csv_script(sequence: u32, pubkey: &[u8]) -> Script {
    let mut bytes = Vec::new();
    push_scriptnum(&mut bytes, sequence as i64);
    bytes.push(0xb2); // OP_CHECKSEQUENCEVERIFY
    bytes.push(0x75); // OP_DROP
    bytes.push(pubkey.len() as u8);
    bytes.extend_from_slice(pubkey);
    bytes.push(0xac); // OP_CHECKSIG
    Script::new(bytes)
}

/// Build a Hash Time-Locked Contract (HTLC) redeem script.
///
/// ```text
/// OP_IF
///   OP_SHA256 <payment_hash> OP_EQUALVERIFY
///   <receiver_pubkey> OP_CHECKSIG
/// OP_ELSE
///   <timeout> OP_CHECKLOCKTIMEVERIFY OP_DROP
///   <sender_pubkey> OP_CHECKSIG
/// OP_ENDIF
/// ```
///
/// To redeem with the preimage: `<sig> <preimage> OP_TRUE`
/// To refund after timeout:      `<sig> OP_FALSE`
pub fn build_htlc_script(
    payment_hash: &[u8; 32],
    receiver_pubkey: &[u8],
    sender_pubkey: &[u8],
    timeout: u32,
) -> Script {
    let mut bytes = Vec::new();
    // OP_IF
    bytes.push(0x63);
    // OP_SHA256
    bytes.push(0xa8);
    // push 32-byte hash
    bytes.push(32);
    bytes.extend_from_slice(payment_hash);
    // OP_EQUALVERIFY
    bytes.push(0x88);
    // push receiver pubkey
    bytes.push(receiver_pubkey.len() as u8);
    bytes.extend_from_slice(receiver_pubkey);
    // OP_CHECKSIG
    bytes.push(0xac);
    // OP_ELSE
    bytes.push(0x67);
    // push timeout
    push_scriptnum(&mut bytes, timeout as i64);
    // OP_CHECKLOCKTIMEVERIFY
    bytes.push(0xb1);
    // OP_DROP
    bytes.push(0x75);
    // push sender pubkey
    bytes.push(sender_pubkey.len() as u8);
    bytes.extend_from_slice(sender_pubkey);
    // OP_CHECKSIG
    bytes.push(0xac);
    // OP_ENDIF
    bytes.push(0x68);
    Script::new(bytes)
}

/// The CSV disable flag (bit 31). When set, CSV is a NOP.
pub const SEQUENCE_LOCKTIME_DISABLE_FLAG: u32 = 1 << 31;
/// The CSV type flag (bit 22). When set, interpret as time-based (512s units).
pub const SEQUENCE_LOCKTIME_TYPE_FLAG: u32 = 1 << 22;
/// Mask for the value portion of a sequence number (lower 16 bits).
pub const SEQUENCE_LOCKTIME_MASK: u32 = 0x0000_ffff;

/// Helper: build a CSV sequence for `n` blocks of relative lock.
pub fn csv_blocks(n: u16) -> u32 {
    n as u32
}

/// Helper: build a CSV sequence for `n` × 512-second intervals.
pub fn csv_time(n: u16) -> u32 {
    SEQUENCE_LOCKTIME_TYPE_FLAG | n as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_scriptnum_small() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, 0);
        assert_eq!(buf, vec![0x00]); // OP_0

        buf.clear();
        push_scriptnum(&mut buf, 1);
        assert_eq!(buf, vec![0x51]); // OP_1

        buf.clear();
        push_scriptnum(&mut buf, 16);
        assert_eq!(buf, vec![0x60]); // OP_16
    }

    #[test]
    fn test_push_scriptnum_large() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, 500_000);
        // 500000 = 0x07A120 → LE bytes [0x20, 0xA1, 0x07]
        assert_eq!(buf, vec![3, 0x20, 0xA1, 0x07]);
    }

    #[test]
    fn test_cltv_script() {
        let pubkey = [0x02u8; 33]; // compressed pubkey placeholder
        let script = build_cltv_script(650_000, &pubkey);
        // Should contain CLTV (0xb1) and CHECKSIG (0xac)
        assert!(script.bytes.contains(&0xb1));
        assert!(script.bytes.contains(&0xac));
    }

    #[test]
    fn test_csv_script() {
        let pubkey = [0x03u8; 33];
        let script = build_csv_script(csv_blocks(144), &pubkey);
        assert!(script.bytes.contains(&0xb2)); // OP_CSV
        assert!(script.bytes.contains(&0xac));
    }

    #[test]
    fn test_htlc_script() {
        let hash = [0xaa; 32];
        let receiver = [0x02; 33];
        let sender = [0x03; 33];
        let script = build_htlc_script(&hash, &receiver, &sender, 700_000);

        // OP_IF, OP_SHA256, OP_EQUALVERIFY, OP_CHECKSIG, OP_ELSE,
        // OP_CLTV, OP_DROP, OP_CHECKSIG, OP_ENDIF
        assert!(script.bytes.contains(&0x63)); // OP_IF
        assert!(script.bytes.contains(&0xa8)); // OP_SHA256
        assert!(script.bytes.contains(&0x88)); // OP_EQUALVERIFY
        assert!(script.bytes.contains(&0x67)); // OP_ELSE
        assert!(script.bytes.contains(&0xb1)); // OP_CLTV
        assert!(script.bytes.contains(&0x68)); // OP_ENDIF
        // payment hash is embedded
        assert!(script.bytes.windows(32).any(|w| w == &[0xaa; 32]));
    }

    #[test]
    fn test_csv_helpers() {
        assert_eq!(csv_blocks(144), 144);
        assert_eq!(csv_time(1), SEQUENCE_LOCKTIME_TYPE_FLAG | 1);
    }

    #[test]
    fn test_push_scriptnum_negative_one() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, -1);
        // CScriptNum encoding for -1: abs byte 0x01 with sign bit set = 0x81, prefixed by length 1
        assert_eq!(buf, vec![0x01, 0x81]);
    }

    #[test]
    fn test_cltv_script_contains_pubkey_bytes() {
        let pubkey = [0xABu8; 33];
        let script = build_cltv_script(700_000, &pubkey);
        assert!(script.bytes.windows(33).any(|w| w == pubkey), "pubkey must be embedded in CLTV script");
    }

    #[test]
    fn test_csv_script_contains_pubkey_bytes() {
        let pubkey = [0xCDu8; 33];
        let script = build_csv_script(csv_blocks(6), &pubkey);
        assert!(script.bytes.windows(33).any(|w| w == pubkey), "pubkey must be embedded in CSV script");
    }

    #[test]
    fn test_htlc_script_contains_payment_hash() {
        let payment_hash = [0x77u8; 32];
        let receiver = [0x02u8; 33];
        let sender  = [0x03u8; 33];
        let script = build_htlc_script(&payment_hash, &receiver, &sender, 800_000);
        assert!(script.bytes.windows(32).any(|w| w == payment_hash), "payment hash must be embedded");
    }

    #[test]
    fn test_csv_time_has_type_flag_bit_22() {
        let seq = csv_time(10);
        assert_ne!(seq & SEQUENCE_LOCKTIME_TYPE_FLAG, 0);
    }

    #[test]
    fn test_csv_blocks_has_no_type_flag() {
        let seq = csv_blocks(144);
        assert_eq!(seq & SEQUENCE_LOCKTIME_TYPE_FLAG, 0);
    }

    #[test]
    fn test_sequence_disable_flag_is_bit_31() {
        assert_eq!(SEQUENCE_LOCKTIME_DISABLE_FLAG, 1u32 << 31);
    }

    #[test]
    fn test_cltv_and_csv_scripts_differ() {
        let pubkey = [0x02u8; 33];
        let cltv = build_cltv_script(1000, &pubkey);
        let csv  = build_csv_script(csv_blocks(10), &pubkey);
        assert_ne!(cltv.bytes, csv.bytes, "CLTV and CSV scripts for same pubkey must differ");
    }
}
