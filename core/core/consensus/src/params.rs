//! Canonical consensus parameters for KuberCoin.
//!
//! **This module is the single source of truth** for all protocol constants.
//! Other crates must import from here rather than defining their own copies.
//!
//! # Constants
//!
//! | Name | Value | Description |
//! |------|-------|-------------|
//! | [`MAX_SUPPLY`] | 2,100,000,000,000,000 sat | 21 million KUBER |
//! | [`INITIAL_BLOCK_REWARD`] | 5,000,000,000 sat | 50 KUBER |
//! | [`HALVING_INTERVAL`] | 210,000 blocks | ~4 years at 10-min blocks |
//! | [`COINBASE_MATURITY`] | 100 blocks | ~16.7 hours |
//! | [`DIFFICULTY_ADJUSTMENT_INTERVAL`] | 2,016 blocks | ~2 weeks |
//! | [`TARGET_BLOCK_TIME_SECS`] | 600 s | 10 minutes |
//! | [`MAX_BLOCK_WEIGHT`] | 4,000,000 WU | 4 MW (SegWit weight) |
//! | [`MAX_BLOCK_SIZE`] | 1,000,000 bytes | 1 MB legacy fallback |
//! | [`MAX_DIFFICULTY_ADJUSTMENT_FACTOR`] | 4 | Clamp: [1/4, 4] |
//! | [`MAX_FUTURE_BLOCK_TIME_SECS`] | 7,200 s | 2 hours |

// ── Supply ───────────────────────────────────────────────────

/// Maximum total supply in satoshis: 21,000,000 KUBER.
pub const MAX_SUPPLY: u64 = 21_000_000 * 100_000_000;

/// Initial block subsidy (reward) in satoshis: 50 KUBER.
pub const INITIAL_BLOCK_REWARD: u64 = 50 * 100_000_000;

/// Number of blocks between reward halvings (~4 years at 10-min blocks).
pub const HALVING_INTERVAL: u64 = 210_000;

/// Number of confirmations required before a coinbase output can be spent.
pub const COINBASE_MATURITY: u64 = 100;

/// Number of satoshis per KUBER (10^8).
pub const COIN: u64 = 100_000_000;

// ── Difficulty ───────────────────────────────────────────────

/// Number of blocks between difficulty adjustments.
pub const DIFFICULTY_ADJUSTMENT_INTERVAL: u64 = 2_016;

/// Target time between blocks in seconds (10 minutes).
pub const TARGET_BLOCK_TIME_SECS: u64 = 600;

/// Maximum difficulty adjustment factor per retarget period.
///
/// Actual adjustment is clamped to [`1/MAX_DIFFICULTY_ADJUSTMENT_FACTOR`,
/// `MAX_DIFFICULTY_ADJUSTMENT_FACTOR`].
pub const MAX_DIFFICULTY_ADJUSTMENT_FACTOR: u64 = 4;

// ── Blocks ───────────────────────────────────────────────────

/// Maximum block weight in weight units (4 MW, SegWit-compatible).
///
/// KuberCoin uses the Bitcoin SegWit weight system (BIP-141):
/// - Non-witness bytes count as 4 weight units each
/// - Witness bytes count as 1 weight unit each
/// - Maximum block weight: 4,000,000 WU (~1 MB legacy, ~4 MB witness-heavy)
pub const MAX_BLOCK_WEIGHT: usize = 4_000_000;

/// Legacy maximum block size in bytes (1 MB) for non-SegWit serialized size.
/// Used as a fallback for transactions without witness data.
pub const MAX_BLOCK_SIZE: usize = 1_000_000;

/// Maximum time (in seconds) a block timestamp may be ahead of the
/// node's wall-clock time.
pub const MAX_FUTURE_BLOCK_TIME_SECS: u64 = 2 * 60 * 60; // 2 hours

// ── Reward calculation ───────────────────────────────────────

/// Calculate the block subsidy at the given height.
///
/// Returns 0 once all 64 halvings have passed (subsidy < 1 satoshi).
///
/// ```
/// use consensus::params::block_subsidy;
///
/// assert_eq!(block_subsidy(0), 50 * 100_000_000);
/// assert_eq!(block_subsidy(210_000), 25 * 100_000_000);
/// assert_eq!(block_subsidy(420_000), 12_50000000);
/// assert_eq!(block_subsidy(64 * 210_000), 0);
/// ```
pub fn block_subsidy(height: u64) -> u64 {
    let halvings = height / HALVING_INTERVAL;
    if halvings >= 64 {
        return 0;
    }
    INITIAL_BLOCK_REWARD >> halvings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_reward() {
        assert_eq!(block_subsidy(0), 50 * COIN);
    }

    #[test]
    fn test_first_halving() {
        assert_eq!(block_subsidy(HALVING_INTERVAL), 25 * COIN);
    }

    #[test]
    fn test_second_halving() {
        assert_eq!(block_subsidy(2 * HALVING_INTERVAL), 1_250_000_000);
    }

    #[test]
    fn test_last_halving() {
        // After 63 halvings the subsidy is 1 satoshi (50*10^8 >> 63 = 0? No: 5_000_000_000 >> 63 = 0)
        // Actually at halving 33 the reward drops to 0 (5e9 has ~33 bits)
        // 5_000_000_000 in binary is ~32.2 bits, so >> 33 = 0
        assert_eq!(block_subsidy(33 * HALVING_INTERVAL), 0);
    }

    #[test]
    fn test_64th_halving_returns_zero() {
        assert_eq!(block_subsidy(64 * HALVING_INTERVAL), 0);
    }

    #[test]
    fn test_total_supply_bounded() {
        // Sum of all block subsidies must not exceed MAX_SUPPLY
        let mut total: u64 = 0;
        for era in 0..64u64 {
            let reward = block_subsidy(era * HALVING_INTERVAL);
            if reward == 0 {
                break;
            }
            total = total.saturating_add(reward * HALVING_INTERVAL);
        }
        assert!(total <= MAX_SUPPLY, "total supply {total} exceeds {MAX_SUPPLY}");
    }

    #[test]
    fn test_constants_consistency() {
        assert_eq!(COIN, 100_000_000);
        assert_eq!(MAX_SUPPLY, 21_000_000 * COIN);
        assert_eq!(INITIAL_BLOCK_REWARD, 50 * COIN);
    }

    // ── Phase 7 hardening ──

    #[test]
    fn test_subsidy_monotonically_decreasing() {
        let mut prev = block_subsidy(0);
        for era in 1..34u64 {
            let reward = block_subsidy(era * HALVING_INTERVAL);
            assert!(reward <= prev, "subsidy must not increase at halving {era}");
            prev = reward;
        }
    }

    #[test]
    fn test_subsidy_exact_at_each_halving() {
        assert_eq!(block_subsidy(0), 5_000_000_000);
        assert_eq!(block_subsidy(HALVING_INTERVAL), 2_500_000_000);
        assert_eq!(block_subsidy(2 * HALVING_INTERVAL), 1_250_000_000);
        assert_eq!(block_subsidy(3 * HALVING_INTERVAL), 625_000_000);
    }

    #[test]
    fn test_subsidy_within_era_constant() {
        // Within a single era, every block gets the same reward
        let r0 = block_subsidy(0);
        let r1 = block_subsidy(1);
        let r_mid = block_subsidy(HALVING_INTERVAL / 2);
        let r_last = block_subsidy(HALVING_INTERVAL - 1);
        assert_eq!(r0, r1);
        assert_eq!(r0, r_mid);
        assert_eq!(r0, r_last);
    }

    #[test]
    fn test_subsidy_boundary_between_eras() {
        let last_in_era0 = block_subsidy(HALVING_INTERVAL - 1);
        let first_in_era1 = block_subsidy(HALVING_INTERVAL);
        assert_eq!(first_in_era1, last_in_era0 / 2);
    }

    #[test]
    fn test_max_supply_exact_value() {
        assert_eq!(MAX_SUPPLY, 2_100_000_000_000_000);
    }

    #[test]
    fn test_difficulty_adjustment_interval_two_weeks() {
        // 2016 blocks * 600 seconds = 1,209,600 seconds = 2 weeks
        let two_weeks_secs = DIFFICULTY_ADJUSTMENT_INTERVAL * TARGET_BLOCK_TIME_SECS;
        assert_eq!(two_weeks_secs, 1_209_600);
    }

    #[test]
    fn test_coinbase_maturity_value() {
        assert_eq!(COINBASE_MATURITY, 100);
    }

    #[test]
    fn test_max_block_weight_segwit() {
        assert_eq!(MAX_BLOCK_WEIGHT, 4_000_000);
        assert_eq!(MAX_BLOCK_SIZE, 1_000_000);
        // Weight limit is 4x the legacy size limit (SegWit design)
        assert_eq!(MAX_BLOCK_WEIGHT, 4 * MAX_BLOCK_SIZE);
    }

    #[test]
    fn test_max_future_block_time() {
        assert_eq!(MAX_FUTURE_BLOCK_TIME_SECS, 7200);
    }
}
