use crate::difficulty::bits_to_target;
use chain::BlockHeader;

/// Compute SHA-256d hash of a block header
pub fn hash_header(header: &BlockHeader) -> [u8; 32] {
    header.hash()
}

/// Verify that a block header satisfies the Proof-of-Work requirement
/// Returns true if hash(header) <= target (Bitcoin consensus)
pub fn verify_pow(header: &BlockHeader) -> bool {
    let hash = hash_header(header);
    let target = bits_to_target(header.bits);

    // Compare hash to target (both as big-endian byte arrays)
    hash <= target
}

/// Check if a hash meets a target (hash <= target)
pub fn hash_meets_target(hash: &[u8; 32], target: &[u8; 32]) -> bool {
    hash <= target
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_header(nonce: u64, bits: u32) -> BlockHeader {
        BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, bits, nonce)
    }

    #[test]
    fn test_hash_header_deterministic() {
        let header = create_test_header(12345, 0x1d00ffff);

        let hash1 = hash_header(&header);
        let hash2 = hash_header(&header);

        assert_eq!(hash1, hash2, "Header hash must be deterministic");
    }

    #[test]
    fn test_hash_changes_with_nonce() {
        let header1 = create_test_header(0, 0x1d00ffff);
        let header2 = create_test_header(1, 0x1d00ffff);

        let hash1 = hash_header(&header1);
        let hash2 = hash_header(&header2);

        assert_ne!(hash1, hash2, "Different nonce must produce different hash");
    }

    #[test]
    fn test_verify_pow_with_max_difficulty() {
        // Very high difficulty (easy target) - most hashes should pass
        // Note: This test may rarely fail due to probabilistic nature
        let header = create_test_header(0, 0x20ffffff); // Easier target than 0x1fffffff
                                                        // Just verify the function runs without panic
        let _ = verify_pow(&header);
    }

    #[test]
    fn test_verify_pow_with_min_difficulty() {
        // Min difficulty = minimum target (almost no hash passes)
        let header = create_test_header(0, 0x01000000);
        // This will almost certainly fail (which is correct)
        // We just verify the function runs
        let _ = verify_pow(&header);
    }

    #[test]
    fn test_hash_meets_target() {
        let low_hash = [
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ];

        let high_hash = [
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff,
        ];

        let target = [
            0x00, 0x00, 0x00, 0x0f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff,
        ];

        assert!(
            hash_meets_target(&low_hash, &target),
            "Low hash should meet target"
        );
        assert!(
            !hash_meets_target(&high_hash, &target),
            "High hash should not meet target"
        );
    }

    #[test]
    fn test_hash_header_returns_32_bytes() {
        let header = create_test_header(0, 0x1d00ffff);
        let h = hash_header(&header);
        assert_eq!(h.len(), 32);
    }

    #[test]
    fn test_hash_meets_target_equal_hash_and_target() {
        let val = [0x00, 0x00, 0x00, 0x10u8, 0x00, 0x00, 0x00, 0x00,
                   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // hash == target should meet the target (<=)
        assert!(hash_meets_target(&val, &val));
    }

    #[test]
    fn test_all_zeros_hash_meets_any_target() {
        let zero_hash = [0u8; 32];
        let any_target = [0xFFu8; 32];
        assert!(hash_meets_target(&zero_hash, &any_target));
    }

    #[test]
    fn test_all_ff_hash_does_not_meet_typical_target() {
        let ff_hash = [0xFFu8; 32];
        let typical_target = [
            0x00, 0x00, 0x00, 0x0f, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        ];
        assert!(!hash_meets_target(&ff_hash, &typical_target));
    }

    #[test]
    fn test_hash_header_differs_with_different_prev_hash() {
        let h1 = create_test_header(0, 0x1d00ffff);
        let mut h2 = h1.clone();
        h2.prev_hash[0] ^= 0xFF;
        assert_ne!(hash_header(&h1), hash_header(&h2));
    }

    #[test]
    fn test_verify_pow_does_not_panic_on_easy_target() {
        // bits = 0x207fffff is the standard regtest genesis difficulty
        let header = create_test_header(0, 0x207fffff);
        let _ = verify_pow(&header);
    }

    // ── Principle 6: H(block + nonce) < target ──

    #[test]
    fn test_different_nonce_different_hash() {
        let h1 = hash_header(&create_test_header(0, 0x1d00ffff));
        let h2 = hash_header(&create_test_header(1, 0x1d00ffff));
        assert_ne!(h1, h2, "changing nonce must change hash");
    }

    #[test]
    fn test_hash_meets_target_boundary_one_above() {
        let mut target = [0u8; 32];
        target[31] = 0x05;
        let mut hash = [0u8; 32];
        hash[31] = 0x06; // one above
        assert!(!hash_meets_target(&hash, &target));
    }

    #[test]
    fn test_hash_meets_target_boundary_one_below() {
        let mut target = [0u8; 32];
        target[31] = 0x05;
        let mut hash = [0u8; 32];
        hash[31] = 0x04; // one below
        assert!(hash_meets_target(&hash, &target));
    }

    // ── Principle 1: Hash functions — double SHA-256 ──

    #[test]
    fn test_hash_header_not_trivially_zero() {
        let h = hash_header(&create_test_header(42, 0x1d00ffff));
        assert_ne!(h, [0u8; 32], "SHA256d output should not be all zeros");
    }

    // ── Principle 5: Merkle proof implicit — header change → hash change ──

    #[test]
    fn test_hash_changes_with_merkle_root() {
        let h1 = create_test_header(0, 0x1d00ffff);
        let mut h2 = h1.clone();
        h2.merkle_root[0] ^= 0xFF;
        assert_ne!(hash_header(&h1), hash_header(&h2));
    }
}
