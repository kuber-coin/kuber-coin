/// Convert compact bits representation to 256-bit target
/// Bitcoin-style compact target encoding
pub fn bits_to_target(bits: u32) -> [u8; 32] {
    if bits == 0 {
        return [0u8; 32];
    }

    let size = (bits >> 24) as usize;
    let word = bits & 0x007fffff;

    let mut target = [0u8; 32];

    if size == 0 {
        return target;
    }

    if size <= 3 {
        let word_bytes = word.to_be_bytes();
        let offset = 3 - size;
        if 29 + offset < 32 {
            target[29 + offset] = word_bytes[1];
        }
        if size >= 2 && 30 + offset < 32 {
            target[30 + offset] = word_bytes[2];
        }
        if size == 3 && 31 + offset < 32 {
            target[31 + offset] = word_bytes[3];
        }
    } else if size <= 32 {
        let word_bytes = word.to_be_bytes();
        let start = 32 - size;
        if start + 2 < 32 {
            target[start] = word_bytes[1];
            target[start + 1] = word_bytes[2];
            target[start + 2] = word_bytes[3];
        }
    }

    target
}

/// Convert target to compact bits representation
pub fn target_to_bits(target: &[u8; 32]) -> u32 {
    // Find first non-zero byte
    let mut size = 0;
    for (i, &byte) in target.iter().enumerate() {
        if byte != 0 {
            size = 32 - i;
            break;
        }
    }

    if size == 0 {
        return 0;
    }

    let start = 32 - size;
    let mut compact = if size <= 3 {
        let word = ((target[29] as u32) << 16) | ((target[30] as u32) << 8) | (target[31] as u32);
        word >> (8 * (3 - size))
    } else {
        ((target[start] as u32) << 16)
            | ((target[start + 1] as u32) << 8)
            | (target[start + 2] as u32)
    };

    // If high bit set, shift right and increment size
    if compact & 0x00800000 != 0 {
        compact >>= 8;
        size += 1;
    }

    compact | ((size as u32) << 24)
}

/// Compute the retargeted target using full 256-bit arithmetic.
///
/// `new_target = old_target * actual_timespan / target_timespan`
///
/// Both `actual_timespan` and `target_timespan` are clamped/supplied by the
/// caller.  The result is capped at `max_target` (genesis difficulty).
pub fn retarget_target(
    old_target: &[u8; 32],
    actual_timespan: u64,
    target_timespan: u64,
    max_target: &[u8; 32],
) -> [u8; 32] {
    // Division by zero guard — return max_target (safest fallback)
    if target_timespan == 0 {
        return *max_target;
    }
    // If actual_timespan is 0, difficulty should be maximum (target → 0)
    if actual_timespan == 0 {
        return [0u8; 32];
    }

    // Multiply old_target (big-endian [u8;32]) by actual_timespan (u64)
    // into a 40-byte intermediate, then divide by target_timespan.
    // Each step: byte * u64 + carry.  Max(byte)=255, Max(actual_timespan)=u64::MAX,
    // Max(carry)=u64::MAX-1.  255*u64::MAX + (u64::MAX-1) can overflow u64,
    // so we use u128 for the intermediate.
    let mut product = [0u8; 40]; // 32 + 8 bytes headroom
    let mut carry: u128 = 0;
    for i in (0..32).rev() {
        let v = (old_target[i] as u128) * (actual_timespan as u128) + carry;
        product[i + 8] = (v & 0xff) as u8;
        carry = v >> 8;
    }
    // Propagate remaining carry into the 8-byte headroom
    for i in (0..8).rev() {
        let v = carry & 0xff;
        product[i] = v as u8;
        carry >>= 8;
    }

    // Divide the 40-byte product by target_timespan → 32-byte result.
    let mut result = [0u8; 32];
    let mut remainder: u64 = 0;
    let mut overflow = false;
    // Start from the MSB of the 40-byte product; we only need the
    // low 32 bytes of the quotient (the upper 8 must be zero for any
    // reasonable difficulty, but we process them to feed the remainder).
    for i in 0..40 {
        remainder = (remainder << 8) | (product[i] as u64);
        let q = remainder / target_timespan;
        remainder %= target_timespan;
        // Map product index i → result index i-8
        if i >= 8 {
            result[i - 8] = q as u8;
        } else if q != 0 {
            // Non-zero quotient in the upper 8 bytes → overflow (result > 256 bits)
            overflow = true;
        }
    }

    // Cap at max_target (or if overflow detected in upper bytes)
    if overflow || result > *max_target {
        return *max_target;
    }

    result
}

/// Compute the proof-of-work for a given compact target.
///
/// `work = (~target) / (target + 1) + 1`
///
/// This is Bitcoin's GetBlockProof formula.
/// Returns a 32-byte big-endian unsigned integer.
pub fn work_from_compact(bits: u32) -> [u8; 32] {
    let target = bits_to_target(bits);

    // If target is all zeros (impossible block), return zero work
    if target == [0u8; 32] {
        return [0u8; 32];
    }

    // not_target = ~target
    let not_target: [u8; 32] = std::array::from_fn(|i| !target[i]);

    // target_plus_1 = target + 1
    let mut target_plus_1 = target;
    let mut carry: u16 = 1;
    for i in (0..32).rev() {
        let s = target_plus_1[i] as u16 + carry;
        target_plus_1[i] = s as u8;
        carry = s >> 8;
    }
    // target was 2^256 - 1 → work = 1
    if carry != 0 {
        let mut result = [0u8; 32];
        result[31] = 1;
        return result;
    }

    // quotient = not_target / target_plus_1  (full 256-bit division)
    let quotient = div256(&not_target, &target_plus_1);

    // result = quotient + 1
    let mut result = quotient;
    let mut carry: u16 = 1;
    for i in (0..32).rev() {
        let s = result[i] as u16 + carry;
        result[i] = s as u8;
        carry = s >> 8;
    }
    result
}

/// Divide two 256-bit big-endian unsigned integers: `dividend / divisor`.
/// Uses binary long division (restoring), correct for all inputs.
fn div256(dividend: &[u8; 32], divisor: &[u8; 32]) -> [u8; 32] {
    if *divisor == [0u8; 32] {
        return [0u8; 32];
    }
    let mut quotient = [0u8; 32];
    let mut remainder = [0u8; 32];

    for b_msb in 0..256usize {
        // Extract the current dividend bit (bit 0 = MSB of byte 0)
        let byte_idx = b_msb / 8;
        let bit_idx = 7 - (b_msb % 8);
        let dividend_bit = (dividend[byte_idx] >> bit_idx) & 1;

        // remainder = remainder * 2 + dividend_bit
        let mut carry = dividend_bit as u16;
        for i in (0..32).rev() {
            let val = (remainder[i] as u16) * 2 + carry;
            remainder[i] = val as u8;
            carry = val >> 8;
        }

        // If remainder >= divisor: set quotient bit, subtract divisor
        if remainder >= *divisor {
            let mut borrow: u16 = 0;
            for i in (0..32).rev() {
                let diff = remainder[i] as i16 - divisor[i] as i16 - borrow as i16;
                if diff < 0 {
                    remainder[i] = (diff + 256) as u8;
                    borrow = 1;
                } else {
                    remainder[i] = diff as u8;
                    borrow = 0;
                }
            }
            quotient[byte_idx] |= 1 << bit_idx;
        }
    }
    quotient
}

/// Add two 256-bit big-endian unsigned integers.
pub fn add_work(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut carry: u16 = 0;
    for i in (0..32).rev() {
        let sum = a[i] as u16 + b[i] as u16 + carry;
        result[i] = sum as u8;
        carry = sum >> 8;
    }
    result
}

/// Compare two 256-bit big-endian unsigned integers.
/// Returns Ordering::Greater if a > b, etc.
pub fn compare_work(a: &[u8; 32], b: &[u8; 32]) -> std::cmp::Ordering {
    a.cmp(b)
}

/// Convert compact bits to a floating-point difficulty value.
///
/// `difficulty = max_target / current_target`
/// where max_target corresponds to bits = 0x1d00ffff (Bitcoin genesis difficulty 1).
pub fn bits_to_difficulty(bits: u32) -> f64 {
    let target = bits_to_target(bits);
    // max_target for difficulty 1: bits 0x1d00ffff
    let max_target = bits_to_target(0x1d00ffff);

    // Convert both to f64 (approximate) by treating as big-endian integers.
    let target_f = target_to_f64(&target);
    let max_f = target_to_f64(&max_target);

    if target_f == 0.0 {
        return f64::MAX;
    }
    max_f / target_f
}

fn target_to_f64(target: &[u8; 32]) -> f64 {
    let mut val: f64 = 0.0;
    for &byte in target.iter() {
        val = val * 256.0 + byte as f64;
    }
    val
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bits_to_target_zero() {
        let target = bits_to_target(0);
        assert_eq!(target, [0u8; 32]);
    }

    #[test]
    fn test_bits_to_target_genesis() {
        // Bitcoin genesis block difficulty
        let bits = 0x1d00ffff;
        let target = bits_to_target(bits);

        // Should produce a target with leading zeros
        assert_eq!(target[0], 0);
        assert_eq!(target[1], 0);
        assert_eq!(target[2], 0);
    }

    #[test]
    fn test_target_roundtrip() {
        let original_bits = 0x1d00ffff;
        let target = bits_to_target(original_bits);
        let recovered_bits = target_to_bits(&target);

        assert_eq!(original_bits, recovered_bits);
    }

    #[test]
    fn test_difficulty_ordering() {
        // Higher bits value = easier difficulty (larger target)
        let easy_bits = 0x1d00ffff;
        let hard_bits = 0x1c00ffff;

        let easy_target = bits_to_target(easy_bits);
        let hard_target = bits_to_target(hard_bits);

        // Easy target should be larger
        assert!(easy_target > hard_target);
    }

    #[test]
    fn test_retarget_identity() {
        // If actual == target timespan, difficulty stays the same
        let bits = 0x1d00ffff;
        let old = bits_to_target(bits);
        let result = retarget_target(&old, 1_209_600, 1_209_600, &old);
        assert_eq!(target_to_bits(&result), bits);
    }

    #[test]
    fn test_retarget_halves_when_twice_as_fast() {
        // Blocks arrived in half the expected time → target halves (harder)
        let bits = 0x1d00ffff;
        let old = bits_to_target(bits);
        let half_timespan = 1_209_600 / 2;
        let result = retarget_target(&old, half_timespan, 1_209_600, &old);
        // Target should be ~half the old one
        let result_bits = target_to_bits(&result);
        // bits exponent decreases or mantissa halves
        assert!(result < old, "target should decrease when blocks are faster");
        assert_ne!(result_bits, bits);
    }

    #[test]
    fn test_retarget_capped_at_max_target() {
        // If result exceeds max_target, it should be capped
        let max_bits = 0x1d00ffff;
        let max = bits_to_target(max_bits);
        // Use a target close to max so that 4x pushes it over
        let result = retarget_target(&max, 4, 1, &max);
        assert_eq!(result, max, "should be capped at max_target");
    }

    #[test]
    fn test_retarget_full_256bit() {
        // Use a target with significant bytes beyond position 16 (big-endian)
        // to exercise the full 256-bit path
        let mut target = [0u8; 32];
        target[20] = 0x01; // significant byte at position 20
        target[31] = 0xff;
        let max = [0xffu8; 32];
        let doubled = retarget_target(&target, 2, 1, &max);
        // target * 2: [20]=0x02, [30]=0x01 (carry from 0xff*2), [31]=0xfe
        assert_eq!(doubled[20], 0x02);
        assert_eq!(doubled[30], 0x01);
        assert_eq!(doubled[31], 0xfe);
    }
    
    #[test]
    fn test_retarget_zero_target_timespan() {
        // Division by zero guard
        let target = [0xffu8; 32];
        let max = [0xffu8; 32];
        let result = retarget_target(&target, 100, 0, &max);
        assert_eq!(result, max, "zero target_timespan returns max_target");
    }
    
    #[test]
    fn test_retarget_zero_actual_timespan() {
        let bits = 0x1d00ffff;
        let target = bits_to_target(bits);
        let max = [0xffu8; 32];
        let result = retarget_target(&target, 0, 1_209_600, &max);
        assert_eq!(result, [0u8; 32], "zero actual_timespan returns all zeros");
    }
    
    #[test]
    fn test_retarget_large_actual_no_panic() {
        // u64::MAX actual_timespan should not overflow (uses u128)
        let bits = 0x1d00ffff;
        let target = bits_to_target(bits);
        let max = [0xffu8; 32];
        let result = retarget_target(&target, u64::MAX, 1, &max);
        // The result should be capped at max_target since the product is huge
        assert_eq!(result, max, "result capped at max_target");
    }

    // ── Principle 6: H(block + nonce) < target — PoW difficulty encoding ──

    #[test]
    fn test_bits_to_difficulty_genesis_is_one() {
        let d = bits_to_difficulty(0x1d00ffff);
        assert!((d - 1.0).abs() < 0.001, "genesis difficulty should be ~1.0, got {d}");
    }

    #[test]
    fn test_harder_bits_means_higher_difficulty() {
        let easy = bits_to_difficulty(0x1d00ffff);
        let hard = bits_to_difficulty(0x1c00ffff);
        assert!(hard > easy, "smaller target → higher difficulty");
    }

    // ── Principle 10: E(T) = difficulty / hash_rate ──

    #[test]
    fn test_work_from_compact_increases_with_difficulty() {
        let w_easy = work_from_compact(0x1d00ffff);
        let w_hard = work_from_compact(0x1c00ffff);
        assert_ne!(w_easy, [0u8; 32], "easy target should produce non-zero work");
        assert_ne!(w_hard, [0u8; 32], "hard target should produce non-zero work");
        // Harder difficulty (smaller target) → more work per block
        assert!(w_hard > w_easy, "harder target must produce strictly more work");
    }

    #[test]
    fn test_work_from_compact_genesis_value() {
        // Genesis bits 0x1d00ffff: work ≈ 2^32 (≈ 4.295 billion)
        // Verify that the significant bytes are in the last ~5 bytes, not just [0,0,...,1].
        let w = work_from_compact(0x1d00ffff);
        // Any correct implementation must produce a work > 1_000_000_000
        let value = u64::from_be_bytes([w[24], w[25], w[26], w[27], w[28], w[29], w[30], w[31]]);
        assert!(value > 1_000_000_000, "genesis work should be ~4.3B, got {value}");
        // And be below something unreasonably large (fits in 64 bits)
        assert!(w[0..24].iter().all(|&b| b == 0), "high bytes should be zero for genesis work");
    }

    #[test]
    fn test_add_work_commutative() {
        let a = work_from_compact(0x1d00ffff);
        let b = work_from_compact(0x1c00ffff);
        assert_eq!(add_work(&a, &b), add_work(&b, &a));
    }

    #[test]
    fn test_add_work_with_zero() {
        let a = work_from_compact(0x1d00ffff);
        let zero = [0u8; 32];
        assert_eq!(add_work(&a, &zero), a);
    }

    #[test]
    fn test_compare_work_ordering() {
        let a = work_from_compact(0x1d00ffff);
        let zero = [0u8; 32];
        // Work for a valid target is non-zero
        assert_eq!(compare_work(&a, &a), std::cmp::Ordering::Equal);
        assert_eq!(compare_work(&a, &zero), std::cmp::Ordering::Greater);
        assert_eq!(compare_work(&zero, &a), std::cmp::Ordering::Less);
    }

    // ── Principle 9: P = hash_rate / network_hash_rate ──
    //    A lower-difficulty target has a *higher* probability of being hit.

    #[test]
    fn test_easier_target_is_larger_byte_array() {
        let easy = bits_to_target(0x1d00ffff);
        let hard = bits_to_target(0x1c00ffff);
        assert!(easy > hard, "easier target must be numerically larger");
    }

    // ── Principle 7: Modular Arithmetic — bits roundtrip ──

    #[test]
    fn test_bits_target_roundtrip_hard_difficulty() {
        let bits = 0x1c00ffff;
        let target = bits_to_target(bits);
        let recovered = target_to_bits(&target);
        assert_eq!(bits, recovered, "bits→target→bits must roundtrip");
    }

    #[test]
    fn test_bits_to_target_all_zero_bits() {
        let target = bits_to_target(0x00000000);
        assert_eq!(target, [0u8; 32]);
    }
}
