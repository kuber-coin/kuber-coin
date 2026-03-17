//! BIP-9 Version Bits — Soft-fork activation mechanism.
//!
//! Each deployment uses a single bit in the block header `version` field
//! (bits 0–28, with the top 3 bits set to `001`).  During a retarget
//! period, if ≥ threshold blocks signal a particular bit, the deployment
//! transitions through: DEFINED → STARTED → LOCKED_IN → ACTIVE.
//!
//! Reference: <https://github.com/bitcoin/bips/blob/master/bip-0009.mediawiki>

// ── Constants ────────────────────────────────────────────────────

/// BIP-9 top-bit mask: bits 29-31 must be `001`.
pub const VERSION_BITS_TOP_MASK: i32 = 0x2000_0000;

/// Maximum bit position usable by deployments (0..=28).
pub const MAX_VERSION_BITS_BIT: u8 = 28;

/// Default signaling threshold (95 % of a retarget period).
pub const DEFAULT_THRESHOLD_PCT: u32 = 95;

// ── Types ────────────────────────────────────────────────────────

/// Threshold state for a single BIP-9 deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThresholdState {
    /// Deployment is defined but start time has not been reached.
    Defined,
    /// Start time reached; miners may signal.
    Started,
    /// Threshold met during a retarget period; will activate next period.
    LockedIn,
    /// Deployment is active — new rules enforced.
    Active,
    /// Timeout reached without activation.
    Failed,
}

/// A single soft-fork deployment definition.
#[derive(Debug, Clone)]
pub struct Bip9Deployment {
    /// Human-readable name (e.g. `"segwit"`, `"taproot"`).
    pub name: &'static str,
    /// Bit position in the `version` field (0..=28).
    pub bit: u8,
    /// Earliest median-time-past at which signaling is counted (seconds).
    pub start_time: u64,
    /// MTP after which the deployment is considered failed (seconds).
    pub timeout: u64,
    /// Minimum block height for activation (BIP-341 style; 0 = no minimum).
    pub min_activation_height: u64,
    /// Percentage of blocks in a period that must signal (default 95).
    pub threshold_pct: u32,
}

/// Tracks per-period signaling state for all deployments.
#[derive(Debug, Clone)]
pub struct VersionBitsState {
    /// Current state for each deployment, indexed by position in the
    /// deployment array (not by bit number).
    pub states: Vec<ThresholdState>,
}

impl VersionBitsState {
    /// Create a new state tracker for `n` deployments, all starting at
    /// `Defined`.
    pub fn new(n: usize) -> Self {
        Self {
            states: vec![ThresholdState::Defined; n],
        }
    }

    /// Transition deployments at a retarget boundary.
    ///
    /// * `deployments` — the deployment definitions for the active network.
    /// * `period_height` — the height of the first block in the just-
    ///   completed retarget period.
    /// * `period_len` — the length of a retarget period (e.g. 2016).
    /// * `mtp` — the median-time-past at `period_height`.
    /// * `signal_counts` — for each deployment index, the number of blocks
    ///   in the period whose `version` field had the deployment's bit set.
    pub fn transition(
        &mut self,
        deployments: &[Bip9Deployment],
        period_height: u64,
        period_len: u64,
        mtp: u64,
        signal_counts: &[u32],
    ) {
        for (i, dep) in deployments.iter().enumerate() {
            let count = signal_counts.get(i).copied().unwrap_or(0);
            let threshold = (period_len as u32) * dep.threshold_pct / 100;

            self.states[i] = match self.states[i] {
                ThresholdState::Defined => {
                    if mtp >= dep.timeout {
                        ThresholdState::Failed
                    } else if mtp >= dep.start_time {
                        ThresholdState::Started
                    } else {
                        ThresholdState::Defined
                    }
                }
                ThresholdState::Started => {
                    if mtp >= dep.timeout {
                        ThresholdState::Failed
                    } else if count >= threshold {
                        ThresholdState::LockedIn
                    } else {
                        ThresholdState::Started
                    }
                }
                ThresholdState::LockedIn => {
                    if period_height >= dep.min_activation_height {
                        ThresholdState::Active
                    } else {
                        ThresholdState::LockedIn
                    }
                }
                // Terminal states
                s @ (ThresholdState::Active | ThresholdState::Failed) => s,
            };
        }
    }

    /// Check if a given deployment index is active.
    pub fn is_active(&self, index: usize) -> bool {
        self.states.get(index).copied() == Some(ThresholdState::Active)
    }
}

/// Count how many blocks in a version array signal a given bit.
pub fn count_signals(versions: &[i32], bit: u8) -> u32 {
    let mask = 1i32 << bit;
    versions
        .iter()
        .filter(|v| (**v & VERSION_BITS_TOP_MASK) == VERSION_BITS_TOP_MASK && (**v & mask) != 0)
        .count() as u32
}

/// Build a block version field that signals the given deployment bits.
pub fn version_with_bits(bits: &[u8]) -> i32 {
    let mut v = VERSION_BITS_TOP_MASK;
    for &b in bits {
        if b <= MAX_VERSION_BITS_BIT {
            v |= 1i32 << b;
        }
    }
    v
}

// ── Well-known deployment indices ────────────────────────────────

/// Deployment index for SegWit (example).
pub const DEPLOYMENT_SEGWIT: usize = 0;
/// Deployment index for Taproot (example).
pub const DEPLOYMENT_TAPROOT: usize = 1;

/// Standard KuberCoin deployment table.
///
/// Both deployments are already active from genesis in all current
/// networks, so `start_time = 0` and `timeout = u64::MAX`.
/// Future soft forks would be appended here with real timestamps.
pub fn standard_deployments() -> Vec<Bip9Deployment> {
    vec![
        Bip9Deployment {
            name: "segwit",
            bit: 1,
            start_time: 0,
            timeout: u64::MAX,
            min_activation_height: 0,
            threshold_pct: DEFAULT_THRESHOLD_PCT,
        },
        Bip9Deployment {
            name: "taproot",
            bit: 2,
            start_time: 0,
            timeout: u64::MAX,
            min_activation_height: 0,
            threshold_pct: DEFAULT_THRESHOLD_PCT,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_deployment(bit: u8) -> Bip9Deployment {
        Bip9Deployment {
            name: "test",
            bit,
            start_time: 1_000_000,
            timeout: 2_000_000,
            min_activation_height: 0,
            threshold_pct: 95,
        }
    }

    #[test]
    fn test_defined_to_started() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.transition(&deps, 0, 2016, 1_500_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Started);
    }

    #[test]
    fn test_started_to_locked_in() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::Started;
        // 95% of 2016 = 1916
        state.transition(&deps, 2016, 2016, 1_500_000, &[1916]);
        assert_eq!(state.states[0], ThresholdState::LockedIn);
    }

    #[test]
    fn test_locked_in_to_active() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::LockedIn;
        state.transition(&deps, 4032, 2016, 1_500_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Active);
    }

    #[test]
    fn test_started_to_failed_on_timeout() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::Started;
        state.transition(&deps, 2016, 2016, 3_000_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Failed);
    }

    #[test]
    fn test_defined_to_failed_on_timeout() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.transition(&deps, 0, 2016, 3_000_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Failed);
    }

    #[test]
    fn test_active_is_terminal() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::Active;
        state.transition(&deps, 0, 2016, 3_000_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Active);
    }

    #[test]
    fn test_count_signals() {
        let versions = vec![
            version_with_bits(&[1]),
            version_with_bits(&[1, 2]),
            version_with_bits(&[2]),
            0x2000_0000, // no signal bits
        ];
        assert_eq!(count_signals(&versions, 1), 2);
        assert_eq!(count_signals(&versions, 2), 2);
        assert_eq!(count_signals(&versions, 3), 0);
    }

    #[test]
    fn test_version_with_bits() {
        let v = version_with_bits(&[1, 3]);
        assert_eq!(v & VERSION_BITS_TOP_MASK, VERSION_BITS_TOP_MASK);
        assert_ne!(v & (1 << 1), 0);
        assert_ne!(v & (1 << 3), 0);
        assert_eq!(v & (1 << 2), 0);
    }

    #[test]
    fn test_not_enough_signals_stays_started() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::Started;
        state.transition(&deps, 2016, 2016, 1_500_000, &[1900]); // < 1916
        assert_eq!(state.states[0], ThresholdState::Started);
    }

    #[test]
    fn test_min_activation_height() {
        let mut dep = sample_deployment(1);
        dep.min_activation_height = 10_000;
        let deps = vec![dep];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::LockedIn;
        // Height 4032 < 10000 → stays locked in
        state.transition(&deps, 4032, 2016, 1_500_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::LockedIn);
        // Height 10080 >= 10000 → activates
        state.transition(&deps, 10080, 2016, 1_500_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Active);
    }

    #[test]
    fn test_failed_is_terminal() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        state.states[0] = ThresholdState::Failed;
        state.transition(&deps, 0, 2016, 0, &[2016]);
        assert_eq!(state.states[0], ThresholdState::Failed);
    }

    #[test]
    fn test_count_signals_empty() {
        assert_eq!(count_signals(&[], 1), 0);
    }

    #[test]
    fn test_count_signals_no_top_mask() {
        // Versions without the top mask bit should not count
        let versions = vec![0x0000_0002, 0x0000_0006];
        assert_eq!(count_signals(&versions, 1), 0);
    }

    #[test]
    fn test_version_with_bits_empty() {
        let v = version_with_bits(&[]);
        assert_eq!(v, VERSION_BITS_TOP_MASK);
    }

    #[test]
    fn test_version_with_bits_exceeds_max_ignored() {
        // Bit 29 > MAX_VERSION_BITS_BIT(28) should be ignored
        let v = version_with_bits(&[29, 30, 31]);
        assert_eq!(v, VERSION_BITS_TOP_MASK);
    }

    #[test]
    fn test_standard_deployments_count() {
        let deps = standard_deployments();
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[DEPLOYMENT_SEGWIT].name, "segwit");
        assert_eq!(deps[DEPLOYMENT_TAPROOT].name, "taproot");
        assert_eq!(deps[DEPLOYMENT_SEGWIT].bit, 1);
        assert_eq!(deps[DEPLOYMENT_TAPROOT].bit, 2);
    }

    #[test]
    fn test_is_active_out_of_bounds() {
        let state = VersionBitsState::new(2);
        assert!(!state.is_active(0));
        assert!(!state.is_active(5)); // out of range
    }

    #[test]
    fn test_multiple_deployments_independent() {
        let deps = vec![sample_deployment(1), sample_deployment(2)];
        let mut state = VersionBitsState::new(2);
        // Start both
        state.transition(&deps, 0, 2016, 1_500_000, &[0, 0]);
        assert_eq!(state.states[0], ThresholdState::Started);
        assert_eq!(state.states[1], ThresholdState::Started);
        // Only first reaches threshold
        state.transition(&deps, 2016, 2016, 1_500_000, &[1916, 100]);
        assert_eq!(state.states[0], ThresholdState::LockedIn);
        assert_eq!(state.states[1], ThresholdState::Started);
    }

    #[test]
    fn test_defined_stays_defined_before_start_time() {
        let deps = vec![sample_deployment(1)];
        let mut state = VersionBitsState::new(1);
        // MTP 500_000 < start_time 1_000_000 → stays Defined
        state.transition(&deps, 0, 2016, 500_000, &[0]);
        assert_eq!(state.states[0], ThresholdState::Defined);
    }
}
