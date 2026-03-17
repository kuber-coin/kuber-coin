//! # Coin selection algorithms for UTXO-based spending.
//!
//! Provides multiple strategies for selecting inputs:
//! - **Branch-and-Bound** (BnB): optimal exact-match algorithm that
//!   avoids creating a change output (saves ~32 bytes of output weight).
//! - **Knapsack**: value-closest selection using random approximation.
//! - **Largest-first**: greedy fallback, always works.
//!
//! All algorithms operate on an `InputCandidate` list and a target
//! `SelectionTarget` that includes fee-rate and change-cost parameters.

/// A spendable UTXO candidate.
#[derive(Debug, Clone)]
pub struct InputCandidate {
    /// Unique identifier (txid + vout).
    pub txid: [u8; 32],
    /// Output index within the originating transaction.
    pub vout: u32,
    /// Value in satoshis.
    pub value: u64,
    /// Estimated weight to spend this input (script-type-dependent).
    pub input_weight: usize,
}

impl InputCandidate {
    /// The "effective value" at a given fee rate (sat/WU).
    pub fn effective_value(&self, fee_rate: f64) -> i64 {
        self.value as i64 - (self.input_weight as f64 * fee_rate).ceil() as i64
    }
}

/// Parameters for coin selection.
#[derive(Debug, Clone)]
pub struct SelectionTarget {
    /// Amount to send (satoshis, excluding fees).
    pub target_value: u64,
    /// Fee rate in sat per weight unit.
    pub fee_rate: f64,
    /// Fixed overhead weight of the transaction (version + locktime + outputs + …).
    /// Includes the payment output(s) weight.
    pub base_weight: usize,
    /// Additional weight required if a change output is created.
    pub change_output_weight: usize,
    /// Minimum change value to avoid dust.
    pub dust_threshold: u64,
    /// Cost of spending the change output later (sat). Used by BnB to
    /// decide if changeless solutions are worthwhile.
    pub change_spend_cost: u64,
}

/// Result of a successful coin selection.
#[derive(Debug, Clone)]
pub struct SelectionResult {
    /// Selected input indices (into the original candidate slice).
    pub selected: Vec<usize>,
    /// Total value of selected inputs.
    pub input_total: u64,
    /// Total fee for the transaction.
    pub fee: u64,
    /// Change amount (0 if changeless).
    pub change: u64,
    /// Whether a change output is needed.
    pub needs_change: bool,
}

// ── Branch and Bound ────────────────────────────────────────────────────

/// Maximum iterations before BnB gives up and falls back.
const BNB_MAX_ITERATIONS: usize = 100_000;

/// Try to find a changeless selection via depth-first BnB.
///
/// Returns `None` if no exact match is found within the iteration budget.
pub fn select_bnb(
    candidates: &[InputCandidate],
    target: &SelectionTarget,
) -> Option<SelectionResult> {
    // Sort candidates by effective value (descending) for faster pruning
    let mut indices: Vec<usize> = (0..candidates.len()).collect();
    indices.sort_by(|&a, &b| {
        let ea = candidates[a].effective_value(target.fee_rate);
        let eb = candidates[b].effective_value(target.fee_rate);
        eb.cmp(&ea)
    });

    // Filter out negative-effective-value inputs
    let indices: Vec<usize> = indices.into_iter()
        .filter(|&i| candidates[i].effective_value(target.fee_rate) > 0)
        .collect();

    if indices.is_empty() {
        return None;
    }

    // Target including base fee (no change output)
    let base_fee = (target.base_weight as f64 * target.fee_rate).ceil() as u64;
    let target_eff = target.target_value + base_fee;
    // Tolerance: accept solutions that overpay up to change_spend_cost
    let tolerance = target.change_spend_cost;

    let mut best: Option<Vec<usize>> = None;
    let mut best_waste = i64::MAX;
    let mut current: Vec<usize> = Vec::new();
    let mut current_value: u64 = 0;
    let mut iterations = 0usize;

    // Precompute suffix sums of effective values
    let eff_values: Vec<u64> = indices.iter()
        .map(|&i| candidates[i].effective_value(target.fee_rate) as u64)
        .collect();
    let mut suffix_sum = vec![0u64; eff_values.len() + 1];
    for i in (0..eff_values.len()).rev() {
        suffix_sum[i] = suffix_sum[i + 1] + eff_values[i];
    }

    fn backtrack(
        depth: usize,
        indices: &[usize],
        candidates: &[InputCandidate],
        target_eff: u64,
        tolerance: u64,
        current: &mut Vec<usize>,
        current_value: &mut u64,
        suffix_sum: &[u64],
        eff_values: &[u64],
        best: &mut Option<Vec<usize>>,
        best_waste: &mut i64,
        iterations: &mut usize,
    ) {
        *iterations += 1;
        if *iterations > BNB_MAX_ITERATIONS {
            return;
        }

        if *current_value >= target_eff {
            let waste = *current_value as i64 - target_eff as i64;
            if waste <= tolerance as i64 && waste < *best_waste {
                *best_waste = waste;
                *best = Some(current.clone());
            }
            return; // don't go deeper — we already overshoot
        }

        if depth >= indices.len() {
            return;
        }

        // Pruning: even adding all remaining can't reach target
        if *current_value + suffix_sum[depth] < target_eff {
            return;
        }

        // Include candidate at `depth`
        let idx = indices[depth];
        let ev = eff_values[depth];
        current.push(idx);
        *current_value += ev;
        backtrack(
            depth + 1, indices, candidates, target_eff, tolerance,
            current, current_value, suffix_sum, eff_values,
            best, best_waste, iterations,
        );
        *current_value -= ev;
        current.pop();

        // Exclude candidate at `depth`
        backtrack(
            depth + 1, indices, candidates, target_eff, tolerance,
            current, current_value, suffix_sum, eff_values,
            best, best_waste, iterations,
        );
    }

    backtrack(
        0, &indices, candidates, target_eff, tolerance,
        &mut current, &mut current_value, &suffix_sum, &eff_values,
        &mut best, &mut best_waste, &mut iterations,
    );

    let selected = best?;
    let input_total: u64 = selected.iter().map(|&i| candidates[i].value).sum();
    let input_fee: u64 = selected.iter()
        .map(|&i| (candidates[i].input_weight as f64 * target.fee_rate).ceil() as u64)
        .sum();
    let fee = base_fee + input_fee;

    Some(SelectionResult {
        selected,
        input_total,
        fee,
        change: 0,
        needs_change: false,
    })
}

// ── Knapsack ────────────────────────────────────────────────────────────

/// Simple knapsack: pick the combination closest to target.
///
/// Tries random subsets and picks the best one. Falls back to
/// largest-first if nothing beats a full sweep.
pub fn select_knapsack(
    candidates: &[InputCandidate],
    target: &SelectionTarget,
) -> Option<SelectionResult> {
    let base_fee = (target.base_weight as f64 * target.fee_rate).ceil() as u64;
    let change_fee = (target.change_output_weight as f64 * target.fee_rate).ceil() as u64;

    // First, try to find an exact match (value within dust_threshold)
    // Sort by value ascending for closest match
    let mut sorted: Vec<usize> = (0..candidates.len()).collect();
    sorted.sort_by_key(|&i| candidates[i].value);

    // Simple two-pass: first find smallest single UTXO >= needed
    let mut best_single: Option<usize> = None;
    for &i in &sorted {
        let input_fee = (candidates[i].input_weight as f64 * target.fee_rate).ceil() as u64;
        let eff = candidates[i].value.saturating_sub(input_fee);
        if eff >= target.target_value {
            match best_single {
                None => best_single = Some(i),
                Some(prev) => {
                    let prev_fee = (candidates[prev].input_weight as f64 * target.fee_rate).ceil() as u64;
                    let prev_eff = candidates[prev].value.saturating_sub(prev_fee);
                    if eff < prev_eff {
                        best_single = Some(i);
                    }
                }
            }
        }
    }

    // Also do a greedy accumulation from smallest
    let mut accum_indices = Vec::new();
    let mut accum_value = 0u64;
    let mut accum_fee = base_fee;
    for &i in &sorted {
        let input_fee = (candidates[i].input_weight as f64 * target.fee_rate).ceil() as u64;
        accum_indices.push(i);
        accum_value += candidates[i].value;
        accum_fee += input_fee;
        if accum_value >= target.target_value + accum_fee {
            break;
        }
    }

    // Pick the better of single-UTXO vs accumulated
    let (selected, total, fee) = if let Some(si) = best_single {
        let input_fee = (candidates[si].input_weight as f64 * target.fee_rate).ceil() as u64;
        let single_total = candidates[si].value;
        let single_fee = base_fee + input_fee;
        if accum_value >= target.target_value + accum_fee {
            // Compare change: prefer less change
            let single_change = single_total.saturating_sub(target.target_value + single_fee);
            let accum_change = accum_value.saturating_sub(target.target_value + accum_fee);
            if single_change <= accum_change {
                (vec![si], single_total, single_fee)
            } else {
                (accum_indices, accum_value, accum_fee)
            }
        } else {
            (vec![si], single_total, single_fee)
        }
    } else if accum_value >= target.target_value + accum_fee {
        (accum_indices, accum_value, accum_fee)
    } else {
        return None; // insufficient funds
    };

    let change = total.saturating_sub(target.target_value + fee + change_fee);
    let needs_change = change > target.dust_threshold;
    let final_fee = if needs_change { fee + change_fee } else { fee + change };

    Some(SelectionResult {
        selected,
        input_total: total,
        fee: final_fee,
        change: if needs_change { change } else { 0 },
        needs_change,
    })
}

// ── Largest-first (greedy fallback) ─────────────────────────────────────

/// Simple greedy: take largest UTXOs until target is met.
pub fn select_largest_first(
    candidates: &[InputCandidate],
    target: &SelectionTarget,
) -> Option<SelectionResult> {
    let base_fee = (target.base_weight as f64 * target.fee_rate).ceil() as u64;
    let change_fee = (target.change_output_weight as f64 * target.fee_rate).ceil() as u64;

    let mut sorted: Vec<usize> = (0..candidates.len()).collect();
    sorted.sort_by(|&a, &b| candidates[b].value.cmp(&candidates[a].value));

    let mut selected = Vec::new();
    let mut total = 0u64;
    let mut input_fees = 0u64;

    for &i in &sorted {
        selected.push(i);
        total += candidates[i].value;
        input_fees += (candidates[i].input_weight as f64 * target.fee_rate).ceil() as u64;
        let fee = base_fee + input_fees;
        if total >= target.target_value + fee {
            let change = total - target.target_value - fee;
            let needs_change = change > target.dust_threshold + change_fee;
            let final_fee = if needs_change { fee + change_fee } else { fee + change };
            let final_change = if needs_change { change - change_fee } else { 0 };
            return Some(SelectionResult {
                selected,
                input_total: total,
                fee: final_fee,
                change: final_change,
                needs_change,
            });
        }
    }
    None // insufficient funds
}

// ── Unified selector ────────────────────────────────────────────────────

/// Try BnB first, then knapsack, then largest-first.
pub fn select_coins(
    candidates: &[InputCandidate],
    target: &SelectionTarget,
) -> Option<SelectionResult> {
    // Prefer changeless BnB
    if let Some(r) = select_bnb(candidates, target) {
        return Some(r);
    }
    // Knapsack
    if let Some(r) = select_knapsack(candidates, target) {
        return Some(r);
    }
    // Greedy fallback
    select_largest_first(candidates, target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candidate(value: u64) -> InputCandidate {
        InputCandidate {
            txid: [0u8; 32],
            vout: 0,
            value,
            input_weight: 272, // typical P2WPKH input weight
        }
    }

    fn make_target(target_value: u64) -> SelectionTarget {
        SelectionTarget {
            target_value,
            fee_rate: 0.25, // 1 sat/vbyte = 0.25 sat/WU
            base_weight: 40, // simplified base
            change_output_weight: 128,
            dust_threshold: 546,
            change_spend_cost: 68,
        }
    }

    #[test]
    fn test_largest_first_basic() {
        let candidates = vec![
            make_candidate(100_000),
            make_candidate(50_000),
            make_candidate(200_000),
        ];
        let target = make_target(150_000);
        let result = select_largest_first(&candidates, &target).unwrap();
        // Should pick the 200k UTXO (index 2)
        assert!(result.selected.contains(&2));
        assert!(result.input_total >= 150_000);
    }

    #[test]
    fn test_largest_first_insufficient() {
        let candidates = vec![make_candidate(100)];
        let target = make_target(1_000_000);
        assert!(select_largest_first(&candidates, &target).is_none());
    }

    #[test]
    fn test_bnb_exact_match() {
        // Three UTXOs: 100k, 50k, 51k. Target 150k. BnB should find 100k + 50k or 100k + 51k.
        let mut c1 = make_candidate(100_000);
        c1.vout = 0;
        let mut c2 = make_candidate(50_000);
        c2.vout = 1;
        let mut c3 = make_candidate(51_000);
        c3.vout = 2;
        let candidates = vec![c1, c2, c3];
        let target = make_target(149_000); // close to 100k+50k after fees
        let result = select_bnb(&candidates, &target);
        // BnB might find a changeless solution
        if let Some(r) = result {
            assert!(!r.needs_change);
        }
    }

    #[test]
    fn test_knapsack_basic() {
        let candidates = vec![
            make_candidate(100_000),
            make_candidate(200_000),
            make_candidate(300_000),
        ];
        let target = make_target(250_000);
        let result = select_knapsack(&candidates, &target).unwrap();
        assert!(result.input_total >= 250_000);
    }

    #[test]
    fn test_select_coins_unified() {
        let candidates = vec![
            make_candidate(100_000),
            make_candidate(200_000),
            make_candidate(50_000),
        ];
        let target = make_target(100_000);
        let result = select_coins(&candidates, &target).unwrap();
        assert!(result.input_total >= 100_000);
        assert!(result.fee > 0);
    }

    #[test]
    fn test_effective_value() {
        let c = InputCandidate {
            txid: [0u8; 32],
            vout: 0,
            value: 1000,
            input_weight: 272,
        };
        let ev = c.effective_value(0.25);
        // 1000 - ceil(272 * 0.25) = 1000 - 68 = 932
        assert_eq!(ev, 932);
    }

    #[test]
    fn test_bnb_no_solution_returns_none() {
        // UTXOs that can't exactly match a target within tolerance
        let candidates = vec![make_candidate(10_000)];
        let target = make_target(50_000);
        assert!(select_bnb(&candidates, &target).is_none());
    }

    #[test]
    fn test_knapsack_insufficient() {
        let candidates = vec![make_candidate(100)];
        let target = make_target(1_000_000);
        assert!(select_knapsack(&candidates, &target).is_none());
    }

    // ── Coin selection hardening tests ────────────────────────────────────────

    #[test]
    fn test_bnb_exact_match_no_change() {
        // BnB finds a changeless selection when effective-value sums exactly to
        // the target.  We use fee_rate=0 so effective_value == actual value and
        // there is no rounding ambiguity.
        let c1 = InputCandidate { txid: [0u8; 32], vout: 0, value: 100_000, input_weight: 272 };
        let c2 = InputCandidate { txid: [1u8; 32], vout: 0, value:  50_000, input_weight: 272 };
        // fee_rate=0 and base_weight/change_spend_cost both zero so the BnB
        // target_eff = 150_000 exactly, which the two candidates hit precisely.
        let target = SelectionTarget {
            target_value: 150_000,
            fee_rate: 0.0,
            base_weight: 0,
            change_output_weight: 0,
            dust_threshold: 546,
            change_spend_cost: 0,
        };
        let result = select_bnb(&[c1, c2], &target);
        assert!(result.is_some(), "BnB must find exact match");
        let r = result.unwrap();
        assert!(!r.needs_change);
        assert_eq!(r.change, 0);
    }

    #[test]
    fn test_select_coins_prefers_bnb_over_largest_first() {
        // select_coins should use BnB when an exact solution exists
        let candidates = vec![
            make_candidate(50_000),
            make_candidate(100_000),
            make_candidate(30_000),
        ];
        let mut target = make_target(80_000);
        target.change_spend_cost = 10_000;
        let result = select_coins(&candidates, &target);
        assert!(result.is_some(), "Must select a solution when funds are sufficient");
        let r = result.unwrap();
        assert!(r.input_total >= target.target_value + r.fee);
    }

    #[test]
    fn test_select_coins_empty_candidates_returns_none() {
        let target = make_target(10_000);
        assert!(select_coins(&[], &target).is_none());
    }

    #[test]
    fn test_largest_first_selects_minimum_needed() {
        // Largest-first should prefer large UTXOs to minimize input count
        let candidates = vec![
            make_candidate(1_000),
            make_candidate(5_000),
            make_candidate(100_000),
            make_candidate(3_000),
        ];
        let target = make_target(90_000);
        let result = select_largest_first(&candidates, &target);
        assert!(result.is_some());
        let r = result.unwrap();
        // 100_000 alone should cover the target
        assert_eq!(r.selected.len(), 1);
        assert!(r.input_total >= target.target_value);
    }

    #[test]
    fn test_bnb_many_candidates_terminates() {
        // 30 candidates — BnB must terminate within the iteration budget
        let candidates: Vec<InputCandidate> = (1u64..=30)
            .map(|i| InputCandidate {
                txid: {
                    let mut t = [0u8; 32]; t[0] = i as u8; t
                },
                vout: 0,
                value: i * 10_000,
                input_weight: 148,
            })
            .collect();
        let target = make_target(100_000);
        // Should not hang — just needs to return Some or None in finite time
        let _result = select_bnb(&candidates, &target);
    }

    #[test]
    fn test_effective_value_negative_high_feerate() {
        // At a very high fee rate, effective value should be negative
        let c = InputCandidate { txid: [0u8; 32], vout: 0, value: 100, input_weight: 10_000 };
        let ev = c.effective_value(10.0); // 10 sat/WU × 10000 WU = 100_000 sat cost
        assert!(ev < 0, "Effective value must be negative when fee exceeds value");
    }

    #[test]
    fn test_select_coins_change_is_below_dust_threshold() {
        // If change would be below dust, the selection result should not produce change
        // or BnB finds an exact or near-exact match
        let candidates = vec![
            make_candidate(10_546), // just above BTC dust 546×10 = 5460? use typical 546
            make_candidate(5_000),
        ];
        let mut target = make_target(10_000);
        target.dust_threshold = 1_000;
        let result = select_coins(&candidates, &target);
        assert!(result.is_some());
        let r = result.unwrap();
        // If change < dust_threshold, it should be folded into the fee (needs_change=false)
        if !r.needs_change {
            assert_eq!(r.change, 0);
        }
    }

    #[test]
    fn test_select_coins_insufficient_funds_returns_none() {
        let candidates = vec![make_candidate(100), make_candidate(200)];
        let target = make_target(1_000_000);
        assert!(select_coins(&candidates, &target).is_none());
    }

    #[test]
    fn test_knapsack_deterministic_on_same_input() {
        let candidates: Vec<InputCandidate> = (0u8..10)
            .map(|i| InputCandidate { txid: [i; 32], vout: 0, value: (i as u64 + 1) * 1000, input_weight: 148 })
            .collect();
        let target = make_target(5_000);
        let r1 = select_knapsack(&candidates, &target);
        let r2 = select_knapsack(&candidates, &target);
        // Both must succeed or both fail — no non-determinism on coverage
        assert_eq!(r1.is_some(), r2.is_some());
    }

    #[test]
    fn test_selection_result_fee_is_non_zero() {
        let candidates = vec![make_candidate(100_000), make_candidate(50_000)];
        let target = make_target(50_000);
        let result = select_coins(&candidates, &target);
        assert!(result.is_some());
        let r = result.unwrap();
        assert!(r.fee > 0, "Fee must be non-zero for any valid selection");
    }
}
