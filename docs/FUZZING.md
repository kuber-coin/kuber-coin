# Fuzzing Guide

Operational guide for KuberCoin fuzz targets, local validation, and WSL/Linux execution.

---

## Scope

The fuzz harnesses live under [core/tests/fuzz/Cargo.toml](core/tests/fuzz/Cargo.toml).

Current targets:

- `fuzz_psbt`
- `fuzz_block`
- `fuzz_script`
- `fuzz_difficulty`
- `fuzz_address`
- `fuzz_p2p_message`
- `fuzz_transaction`
- `fuzz_psbt_deserialize`
- `fuzz_bech32m`
- `fuzz_utxo_decompress`
- `fuzz_descriptor`
- `fuzz_rpc_json`
- `fuzz_hd_wallet`
- `fuzz_stratum`

---

## Fast Checks

Compile-check all fuzz targets:

```bash
cargo check --manifest-path core/tests/fuzz/Cargo.toml --bins
```

Compile-check a single target:

```bash
cargo check --manifest-path core/tests/fuzz/Cargo.toml --bin fuzz_address
```

VS Code tasks:

- `fuzz-check-all`
- `fuzz-check-target`

---

## Windows

On the current Windows MSVC setup in this repository, local `cargo-fuzz` execution is not reliable.

Observed failures include:

- `STATUS_DLL_NOT_FOUND`
- unresolved `__start___sancov_*`
- unresolved `__stop___sancov_*`

Because of that, the local Windows helper intentionally falls back to compile-only validation.

PowerShell helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/fuzz_smoke_all.ps1
```

VS Code task:

- `fuzz-local-sweep`

Use this when you want to confirm that all fuzz binaries still build on Windows.

---

## WSL And Linux

Use Linux or WSL for real fuzz execution.

Shell helper:

```bash
bash tools/scripts/fuzz_smoke_all.sh
```

Single-target example:

```bash
cargo +nightly fuzz run --fuzz-dir core/tests/fuzz fuzz_block core/tests/fuzz/corpus/fuzz_block -- -max_total_time=3600
```

Run one target via the helper:

```bash
RUNS=1 bash tools/scripts/fuzz_smoke_all.sh fuzz_address
```

VS Code tasks:

- `fuzz-wsl-sweep`
- `fuzz-wsl-target`

---

## Tooling

Required for real fuzz execution:

- `cargo-fuzz`
- Rust nightly toolchain

Install manually if needed:

```bash
cargo install cargo-fuzz --locked
rustup toolchain install nightly
```

The helper scripts will attempt to install missing tooling automatically.

---

## Helper Scripts

Windows helper:

- [tools/scripts/fuzz_smoke_all.ps1](tools/scripts/fuzz_smoke_all.ps1)

Linux/WSL helper:

- [tools/scripts/fuzz_smoke_all.sh](tools/scripts/fuzz_smoke_all.sh)

Behavior summary:

- Windows PowerShell helper: compile-only fallback unless explicitly forced
- Linux/WSL shell helper: real `cargo-fuzz` execution
- Shell helper accepts positional target names for single-target runs

---

## CI

The authoritative full fuzz lane is the GitHub Actions workflow:

- [.github/workflows/fuzz.yml](.github/workflows/fuzz.yml)

That workflow runs the target matrix in Linux and should be treated as the source of truth for real sanitizer-backed fuzz execution.

---

## Common Commands

Minimize a corpus in Linux or WSL:

```bash
cargo +nightly fuzz cmin --fuzz-dir core/tests/fuzz fuzz_address core/tests/fuzz/corpus/fuzz_address
```

Minimize a crashing input in Linux or WSL:

```bash
cargo +nightly fuzz tmin --fuzz-dir core/tests/fuzz fuzz_address artifacts/fuzz_address/<crash-file>
```

List available targets:

```bash
cargo fuzz list --fuzz-dir core/tests/fuzz
```