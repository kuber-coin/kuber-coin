# KuberCoin - Quick Upgrade Script
# Execute immediate priority fixes

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "KuberCoin Upgrade Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Security Tools
Write-Host "[1/6] Installing Security Tools..." -ForegroundColor Yellow
$tools = @("cargo-audit", "cargo-deny", "cargo-outdated")
foreach ($tool in $tools) {
    Write-Host "  Installing $tool..." -ForegroundColor Gray
    cargo install $tool --quiet
}
Write-Host "  ✓ Security tools installed" -ForegroundColor Green
Write-Host ""

# Step 2: Run Security Audit
Write-Host "[2/6] Running Security Audit..." -ForegroundColor Yellow
Write-Host "  Checking for vulnerabilities..." -ForegroundColor Gray
cargo audit
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ No vulnerabilities found" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Vulnerabilities detected - review output above" -ForegroundColor Red
}
Write-Host ""

# Step 3: Check Outdated Dependencies
Write-Host "[3/6] Checking Outdated Dependencies..." -ForegroundColor Yellow
cargo outdated
Write-Host ""

# Step 4: Run Clippy with Auto-fix
Write-Host "[4/6] Running Clippy Auto-fix..." -ForegroundColor Yellow
Write-Host "  Fixing code quality issues..." -ForegroundColor Gray
cargo clippy --all-targets --all-features --fix --allow-dirty --allow-no-vcs
Write-Host "  ✓ Clippy fixes applied" -ForegroundColor Green
Write-Host ""

# Step 5: Check Formatting
Write-Host "[5/6] Checking Code Formatting..." -ForegroundColor Yellow
cargo fmt --all -- --check
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Code is properly formatted" -ForegroundColor Green
} else {
    Write-Host "  Applying formatting..." -ForegroundColor Gray
    cargo fmt --all
    Write-Host "  ✓ Code formatted" -ForegroundColor Green
}
Write-Host ""

# Step 6: Run Tests
Write-Host "[6/6] Running Test Suite..." -ForegroundColor Yellow
Write-Host "  This may take a few minutes..." -ForegroundColor Gray
cargo test --lib --all --release 2>&1 | Select-String "test result"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ All tests passed" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Some tests failed - review output" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Upgrade Complete!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Review docs\UPGRADE_PROCEDURE.md and docs\UPGRADE_PROCEDURES.md"
Write-Host "2. Address any security vulnerabilities found"
Write-Host "3. Update dependencies flagged as outdated"
Write-Host "4. Fix remaining clippy warnings"
Write-Host "5. Add integration tests"
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  cargo doc --no-deps --open"
Write-Host ""
