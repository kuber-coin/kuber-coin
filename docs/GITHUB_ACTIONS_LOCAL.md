# Local GitHub Actions Testing

Practical local mirrors for the repository's GitHub Actions workflows.

---

## Goal

Use the local scripts and VS Code tasks in this repository to exercise the parts of GitHub Actions that are realistic to reproduce on a developer machine.

This is not a byte-for-byte emulation of GitHub-hosted runners. It is a repo-specific validation path intended to catch failures before pushing.

---

## Recommended Task Order

Fast pass:

- `gha-local-fast`

Broader practical pass:

- `gha-local-practical`

Focused workflow mirrors:

- `ci-msrv`
- `ci-doc`
- `ci-sdk-js`
- `ci-security`
- `ci-convergence`
- `ci-coverage`
- `ci-native-ui-windows`
- `ci-native-ui-linux-wsl`
- `gha-local-native-ui`
- `e2e-extended`
- `fuzz-local-sweep`
- `fuzz-wsl-sweep`

---

## Script Entry Points

- [tools/scripts/github_actions_local.ps1](tools/scripts/github_actions_local.ps1) — umbrella local CI mirror
- [tools/scripts/ci_msrv.ps1](tools/scripts/ci_msrv.ps1) — `ci.yml` MSRV job
- [tools/scripts/ci_doc.ps1](tools/scripts/ci_doc.ps1) — `ci.yml` rustdoc job
- [tools/scripts/ci_sdk_js.ps1](tools/scripts/ci_sdk_js.ps1) — `ci.yml` JS SDK job
- [tools/scripts/ci_security.ps1](tools/scripts/ci_security.ps1) — `security-audit.yml` cargo-audit + cargo-deny jobs
- [tools/scripts/ci_convergence.ps1](tools/scripts/ci_convergence.ps1) — `ci.yml` multi-node convergence job
- [tools/scripts/ci_coverage.ps1](tools/scripts/ci_coverage.ps1) — practical local mirror of `coverage.yml` without Codecov upload
- [tools/scripts/ci_native_ui_windows.ps1](tools/scripts/ci_native_ui_windows.ps1) — local mirror of the Windows job in `build-native-ui.yml`
- [tools/scripts/ci_native_ui_linux_wsl.ps1](tools/scripts/ci_native_ui_linux_wsl.ps1) — WSL-backed local mirror of the Linux job in `build-native-ui.yml`
- [tools/scripts/e2e_extended.ps1](tools/scripts/e2e_extended.ps1) — `e2e.yml` mirror
- [tools/scripts/fuzz_smoke_all.ps1](tools/scripts/fuzz_smoke_all.ps1) — Windows compile-only fuzz validation
- [tools/scripts/fuzz_smoke_all.sh](tools/scripts/fuzz_smoke_all.sh) — WSL/Linux fuzz execution

---

## What Is Covered Locally

Windows-native or general local checks:

- formatting
- clippy
- workspace tests
- release node build
- MSRV check
- rustdoc with warnings denied
- JS SDK test/build/dist verification
- multi-node convergence
- cargo audit
- cargo deny
- coverage generation and summary
- extended E2E

WSL/Linux-specific local checks:

- real fuzz execution
- native Linux GTK UI build via WSL

Optional platform-specific local checks:

- Windows WinUI 3 native miner build
- Linux GTK native miner build via WSL

---

## What Remains CI-Only

- GitHub dependency review action
- Codecov upload
- release signing and attestation
- full multi-OS release matrix parity
- macOS-native UI build verification unless run on macOS with Xcode

---

## Suggested Usage

Before a PR:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/github_actions_local.ps1
```

Before a PR, including coverage:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/github_actions_local.ps1 -IncludeCoverage
```

Closest local full pass, including convergence, coverage, and WSL fuzz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/github_actions_local.ps1 -IncludeCoverage -IncludeWslFuzz
```

Run both native UI local mirrors together:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/ci_native_ui_all.ps1
```

See the full workflow-to-task map in [docs/GITHUB_ACTIONS_MATRIX.md](docs/GITHUB_ACTIONS_MATRIX.md).

Fast pre-commit sanity pass:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/github_actions_local.ps1 -Fast
```

Run real fuzzing from WSL:

```bash
bash tools/scripts/fuzz_smoke_all.sh
```

Run native UI mirrors when touching `apps/native/mining-ui/**`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/ci_native_ui_windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/ci_native_ui_linux_wsl.ps1
```