# GitHub Actions Local Matrix

Mapping of GitHub Actions workflows and jobs to local tasks, scripts, or explicit CI-only status.

---

## CI Workflow

Source: [.github/workflows/ci.yml](.github/workflows/ci.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| `check` | hygiene + fmt + clippy | `gha-local-fast` / `ci-git-hygiene` | [tools/scripts/ci_git_hygiene.ps1](tools/scripts/ci_git_hygiene.ps1), `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings` | mirrored |
| `deny` | cargo-deny | `ci-security` | [tools/scripts/ci_security.ps1](tools/scripts/ci_security.ps1) | mirrored |
| `msrv` | Rust 1.88 workspace check | `ci-msrv` | [tools/scripts/ci_msrv.ps1](tools/scripts/ci_msrv.ps1) | mirrored |
| `doc` | rustdoc with warnings denied | `ci-doc` | [tools/scripts/ci_doc.ps1](tools/scripts/ci_doc.ps1) | mirrored |
| `test` | workspace build + test | `gha-local-fast` | [tools/scripts/github_actions_local.ps1](tools/scripts/github_actions_local.ps1) | mirrored |
| `convergence` | multi-node convergence | `ci-convergence` | [tools/scripts/ci_convergence.ps1](tools/scripts/ci_convergence.ps1) | mirrored |
| `sdk-js` | JS SDK test + build | `ci-sdk-js` | [tools/scripts/ci_sdk_js.ps1](tools/scripts/ci_sdk_js.ps1) | mirrored |
| `build-release` | release node build | `gha-local-fast` | [tools/scripts/node_build_release.ps1](tools/scripts/node_build_release.ps1) | mirrored |
| `release-binaries` | multi-target packaging | none | GitHub runner matrix | CI-only |

---

## E2E Workflow

Source: [.github/workflows/e2e.yml](.github/workflows/e2e.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| `extended-e2e` | Windows extended E2E | `e2e-extended` | [tools/scripts/e2e_extended.ps1](tools/scripts/e2e_extended.ps1) | mirrored |

---

## Fuzz Workflow

Source: [.github/workflows/fuzz.yml](.github/workflows/fuzz.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| target matrix | real fuzzing on Linux/nightly | `fuzz-wsl-sweep` / `fuzz-wsl-target` | [tools/scripts/fuzz_smoke_all.sh](tools/scripts/fuzz_smoke_all.sh) | mirrored via WSL/Linux |
| target compile validation | Windows-safe compile-only fallback | `fuzz-local-sweep` / `fuzz-check-all` | [tools/scripts/fuzz_smoke_all.ps1](tools/scripts/fuzz_smoke_all.ps1) | partial |

---

## Coverage Workflow

Source: [.github/workflows/coverage.yml](.github/workflows/coverage.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| `coverage` | llvm-cov report generation | `ci-coverage` | [tools/scripts/ci_coverage.ps1](tools/scripts/ci_coverage.ps1) | mirrored except upload |
| Codecov upload | publish `lcov.info` | none | GitHub secret + action context | CI-only |

---

## Security Audit Workflow

Source: [.github/workflows/security-audit.yml](.github/workflows/security-audit.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| `cargo-audit` | dependency security audit | `ci-security` | [tools/scripts/ci_security.ps1](tools/scripts/ci_security.ps1) | mirrored |
| `cargo-deny` | policy/license/advisory checks | `ci-security` | [tools/scripts/ci_security.ps1](tools/scripts/ci_security.ps1) | mirrored |
| `dependency-review` | PR dependency review action | none | GitHub action only | CI-only |

---

## Native UI Workflow

Source: [.github/workflows/build-native-ui.yml](.github/workflows/build-native-ui.yml)

| Workflow Job | Purpose | Local Task | Script / Command | Status |
|---|---|---|---|---|
| `build-windows` | WinUI 3 miner build | `ci-native-ui-windows` | [tools/scripts/ci_native_ui_windows.ps1](tools/scripts/ci_native_ui_windows.ps1) | mirrored |
| `build-linux` | GTK4 miner build | `ci-native-ui-linux-wsl` | [tools/scripts/ci_native_ui_linux_wsl.ps1](tools/scripts/ci_native_ui_linux_wsl.ps1) | mirrored via WSL |
| both local native mirrors | convenience wrapper | `gha-local-native-ui` | [tools/scripts/ci_native_ui_all.ps1](tools/scripts/ci_native_ui_all.ps1) | mirrored |
| `build-macos` | SwiftUI/Xcode build | none | macOS/Xcode required | platform-limited |
| `create-release` | package + release | none | GitHub release action context | CI-only |

---

## Umbrella Local Runners

| Task | Purpose |
|---|---|
| `gha-local-fast` | fast sanity pass for fmt, clippy, tests, release build |
| `gha-local-practical` | practical local pre-PR pass |
| `gha-local-practical+coverage` | practical pass plus coverage |
| `gha-local-full` | practical pass plus coverage and WSL fuzz |
| `gha-local-native-ui` | Windows + Linux native UI mirrors |

---

## Related Guides

- [docs/GITHUB_ACTIONS_LOCAL.md](docs/GITHUB_ACTIONS_LOCAL.md)
- [docs/FUZZING.md](docs/FUZZING.md)
- [docs/COVERAGE.md](docs/COVERAGE.md)