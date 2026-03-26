#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUZZ_DIR="$REPO_ROOT/core/tests/fuzz"

DEFAULT_TARGETS=(
  fuzz_psbt
  fuzz_block
  fuzz_script
  fuzz_difficulty
  fuzz_address
  fuzz_p2p_message
  fuzz_transaction
  fuzz_psbt_deserialize
  fuzz_bech32m
  fuzz_utxo_decompress
  fuzz_descriptor
  fuzz_rpc_json
  fuzz_hd_wallet
  fuzz_stratum
)

if [[ "$#" -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=("${DEFAULT_TARGETS[@]}")
fi

RUNS="${RUNS:-1}"
MAX_TOTAL_TIME="${MAX_TOTAL_TIME:-0}"
SANITIZER="${SANITIZER:-address}"

print_section() {
  printf '\n=== %s ===\n' "$1"
}

ensure_tooling() {
  if ! cargo fuzz --version >/dev/null 2>&1; then
    print_section "Install cargo-fuzz"
    cargo install cargo-fuzz --locked
  fi

  if ! rustup toolchain list | grep -q '^nightly'; then
    print_section "Install nightly toolchain"
    rustup toolchain install nightly
  fi
}

run_target() {
  local target="$1"
  local corpus_dir="$FUZZ_DIR/corpus/$target"
  mkdir -p "$corpus_dir"

  local args=(
    +nightly
    fuzz
    run
    --fuzz-dir "$FUZZ_DIR"
    --sanitizer "$SANITIZER"
    "$target"
    "$corpus_dir"
    --
    "-runs=$RUNS"
  )

  if [[ "$MAX_TOTAL_TIME" != "0" ]]; then
    args+=("-max_total_time=$MAX_TOTAL_TIME")
  fi

  cargo "${args[@]}"
}

ensure_tooling

print_section "Fuzz smoke sweep"
printf 'Fuzz dir: %s\n' "$FUZZ_DIR"
printf 'Sanitizer: %s\n' "$SANITIZER"
printf 'Runs per target: %s\n' "$RUNS"
if [[ "$MAX_TOTAL_TIME" != "0" ]]; then
  printf 'Max total time per target: %s s\n' "$MAX_TOTAL_TIME"
fi

for target in "${TARGETS[@]}"; do
  print_section "$target"
  run_target "$target"
done

printf '\nALL FUZZ SMOKE TARGETS PASSED\n'