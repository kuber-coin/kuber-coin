#!/usr/bin/env bash

set -euo pipefail

VERSION=""
P2P_PORT=8633
API_PORT=8634
SKIP_TESTS=false
SKIP_DNS_CHECKS=false
STRICT=false
JSON_OUTPUT=false
REQUIRE_API_KEYS=false
LOG_FILE="launch_$(date +%Y%m%d_%H%M%S).log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BINARY="$WORKSPACE_ROOT/target/release/kubercoin-node"
DOCS=(
    "$WORKSPACE_ROOT/docs/LAUNCH_CHECKLIST.md"
    "$WORKSPACE_ROOT/docs/SEED_INFRASTRUCTURE.md"
    "$WORKSPACE_ROOT/docs/MAINNET_POLICY.md"
    "$WORKSPACE_ROOT/docs/INCIDENT_RESPONSE.md"
)
DNS_SEEDS=(
    "seed1.kuber-coin.com"
    "seed2.kuber-coin.com"
    "seed3.kuber-coin.com"
    "dnsseed.kuber-coin.com"
)
HARDCODED_SEEDS=(
    "192.0.2.11:8633"
    "198.51.100.21:8633"
    "203.0.113.31:8633"
)
SEED_HTTP_URLS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-dns-checks)
            SKIP_DNS_CHECKS=true
            shift
            ;;
        --strict)
            STRICT=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --require-api-keys)
            REQUIRE_API_KEYS=true
            shift
            ;;
        --binary)
            BINARY="$2"
            shift 2
            ;;
        --log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        --api-port)
            API_PORT="$2"
            shift 2
            ;;
        --p2p-port)
            P2P_PORT="$2"
            shift 2
            ;;
        --seed-http-url)
            SEED_HTTP_URLS+=("$2")
            shift 2
            ;;
        --dns-seed)
            DNS_SEEDS+=("$2")
            shift 2
            ;;
        --hardcoded-seed)
            HARDCODED_SEEDS+=("$2")
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() {
    printf '%b\n' "$1" | tee -a "$LOG_FILE"
}

step() {
    log_info "\n${CYAN}=== $* ===${NC}"
}

ok() {
    log_info "${GREEN}[OK]${NC} $*"
}

warn() {
    log_info "${YELLOW}[WARN]${NC} $*"
}

fail() {
    log_info "[FAIL] $*"
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

resolve_binary() {
    local binary_path="$1"
    local exe_fallback="${binary_path}.exe"
    if [[ -f "$binary_path" ]]; then
        printf '%s' "$binary_path"
        return 0
    fi
    if [[ -f "$exe_fallback" ]]; then
        printf '%s' "$exe_fallback"
        return 0
    fi
    require_command cargo
    step "Building release binary"
    (cd "$WORKSPACE_ROOT" && cargo build -p kubercoin-node --release) >>"$LOG_FILE" 2>&1
    if [[ -f "$binary_path" ]]; then
        printf '%s' "$binary_path"
    elif [[ -f "$exe_fallback" ]]; then
        printf '%s' "$exe_fallback"
    else
        fail "Unable to locate kubercoin-node after build"
    fi
}

parse_version() {
    local binary_path="$1"
    local version_output
    version_output="$($binary_path --version 2>&1 || true)"
    python3 -c 'import re, sys
text = sys.stdin.read()
match = re.search(r"(\d+\.\d+\.\d+)", text)
print(match.group(1) if match else "unknown")' <<< "$version_output"
}

resolve_workspace_version() {
    python3 - "$WORKSPACE_ROOT/Cargo.toml" <<'PY'
import pathlib, re, sys
text = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
match = re.search(r"\[workspace\.package\][^\[]*?version\s*=\s*\"([^\"]+)\"", text, re.S)
if not match:
    raise SystemExit('workspace.package version not found')
print(match.group(1))
PY
}

check_file_exists() {
    local path="$1"
    [[ -f "$path" ]] || fail "Required document missing: $path"
}

run_logged_command() {
    local description="$1"
    shift
    step "$description"
    "$@" >>"$LOG_FILE" 2>&1 || fail "$description failed"
    ok "$description passed"
}

resolve_dns_seed() {
    local host="$1"
    python3 - "$host" <<'PY'
import socket, sys
host = sys.argv[1]
try:
    addrs = sorted({entry[4][0] for entry in socket.getaddrinfo(host, None)})
except OSError as exc:
    raise SystemExit(str(exc))
print(','.join(addrs))
PY
}

check_http_seed() {
    local url="$1"
    local health_payload
    local info_payload
    health_payload="$(curl -fsS --max-time 5 "$url/api/health")" || return 1
    info_payload="$(curl -fsS --max-time 5 "$url/api/info")" || return 1
    python3 -c 'import json, sys
health = json.loads(sys.argv[1])
info = json.loads(sys.argv[2])
if health.get("status") != "ok":
    raise SystemExit(1)
height = info.get("height", info.get("blocks", 0))
tip = info.get("tip", info.get("bestblockhash", ""))
print(json.dumps({"height": height, "tip": tip}, separators=(",", ":")))' "$health_payload" "$info_payload"
}

emit_summary() {
    local docs_json="$1"
    local dns_json="$2"
    local hardcoded_json="$3"
    local http_json="$4"
    python3 - "$VERSION" "$P2P_PORT" "$API_PORT" "$BINARY" "$SKIP_TESTS" "$STRICT" "$REQUIRE_API_KEYS" "$docs_json" "$dns_json" "$hardcoded_json" "$http_json" <<'PY'
import json, sys
version, p2p_port, api_port, binary, skip_tests, strict, require_api_keys, docs_json, dns_json, hardcoded_json, http_json = sys.argv[1:12]
summary = {
    'version': version,
    'binary': binary,
    'p2pPort': int(p2p_port),
    'apiPort': int(api_port),
    'skipTests': skip_tests.lower() == 'true',
    'strict': strict.lower() == 'true',
    'requireApiKeys': require_api_keys.lower() == 'true',
    'docs': json.loads(docs_json),
    'dnsSeeds': json.loads(dns_json),
    'hardcodedSeeds': json.loads(hardcoded_json),
    'seedHttpChecks': json.loads(http_json),
}
print(json.dumps(summary, indent=4))
PY
}

require_command python3
require_command curl

: >"$LOG_FILE"
step "Mainnet readiness"

VERSION="$(resolve_workspace_version)"
BINARY="$(resolve_binary "$BINARY")"
VERSION_ACTUAL="$(parse_version "$BINARY")"
if [[ "$VERSION_ACTUAL" != "unknown" && "$VERSION_ACTUAL" != "$VERSION" ]]; then
    warn "Version mismatch: expected $VERSION, got $VERSION_ACTUAL"
else
    ok "Binary: $BINARY"
    ok "Version: $VERSION_ACTUAL"
fi

step "Documentation gate"
DOCS_JSON='[]'
for doc in "${DOCS[@]}"; do
    check_file_exists "$doc"
    ok "Found $(basename "$doc")"
    DOCS_JSON="$(python3 - "$DOCS_JSON" "$doc" <<'PY'
import json, sys
items = json.loads(sys.argv[1])
items.append({'path': sys.argv[2], 'present': True})
print(json.dumps(items, separators=(',', ':')))
PY
)"
done

if [[ "$REQUIRE_API_KEYS" == true && -z "${KUBERCOIN_API_KEYS:-}" ]]; then
    fail "KUBERCOIN_API_KEYS is required for this readiness run"
fi
if [[ "$REQUIRE_API_KEYS" == true ]]; then
    ok "API authentication material is present"
fi

if [[ "$SKIP_TESTS" != true ]]; then
    require_command cargo
    run_logged_command "cargo check --workspace" cargo check --workspace
    run_logged_command "cargo test --workspace" cargo test --workspace
    if [[ "$STRICT" == true ]]; then
        run_logged_command "cargo clippy --workspace --all-targets -- -D warnings" cargo clippy --workspace --all-targets -- -D warnings
        if command -v cargo-deny >/dev/null 2>&1; then
            run_logged_command "cargo deny check" cargo deny check
        else
            warn "cargo-deny not installed; skipping deny check"
        fi
    fi
else
    warn "Skipping workspace tests"
fi

DNS_JSON='[]'
if [[ "$SKIP_DNS_CHECKS" != true ]]; then
    step "DNS seed checks"
    for seed in "${DNS_SEEDS[@]}"; do
        resolved="$(resolve_dns_seed "$seed")" || fail "DNS seed resolution failed for $seed"
        ok "$seed -> $resolved"
        DNS_JSON="$(python3 - "$DNS_JSON" "$seed" "$resolved" <<'PY'
import json, sys
items = json.loads(sys.argv[1])
items.append({'host': sys.argv[2], 'resolved': sys.argv[3].split(',') if sys.argv[3] else []})
print(json.dumps(items, separators=(',', ':')))
PY
)"
    done
else
    warn "Skipping DNS seed checks"
fi

step "Hardcoded seed format checks"
HARDCODED_JSON='[]'
for seed in "${HARDCODED_SEEDS[@]}"; do
    if [[ ! "$seed" =~ ^[^:]+:[0-9]+$ ]]; then
        fail "Hardcoded seed is not in host:port format: $seed"
    fi
    ok "$seed"
    HARDCODED_JSON="$(python3 - "$HARDCODED_JSON" "$seed" <<'PY'
import json, sys
items = json.loads(sys.argv[1])
host, port = sys.argv[2].rsplit(':', 1)
items.append({'host': host, 'port': int(port)})
print(json.dumps(items, separators=(',', ':')))
PY
)"
done

HTTP_JSON='[]'
if (( ${#SEED_HTTP_URLS[@]} > 0 )); then
    step "Seed HTTP checks"
    for url in "${SEED_HTTP_URLS[@]}"; do
        http_result="$(check_http_seed "$url")" || fail "HTTP seed check failed for $url"
        ok "$url responded"
        HTTP_JSON="$(python3 - "$HTTP_JSON" "$url" "$http_result" <<'PY'
import json, sys
items = json.loads(sys.argv[1])
payload = json.loads(sys.argv[3])
items.append({'url': sys.argv[2], 'height': payload.get('height', 0), 'tip': payload.get('tip', '')})
print(json.dumps(items, separators=(',', ':')))
PY
)"
    done
else
    warn "No seed HTTP URLs supplied; skipping live HTTP health checks"
fi

step "Next manual steps"
ok "Use docs/LAUNCH_CHECKLIST.md as the final human gate before announcement"
ok "Use docs/SEED_INFRASTRUCTURE.md to verify operators, alerts, and bootstrap proof"
ok "Use docs/MAINNET_POLICY.md and docs/INCIDENT_RESPONSE.md during launch review"

if [[ "$JSON_OUTPUT" == true ]]; then
    emit_summary "$DOCS_JSON" "$DNS_JSON" "$HARDCODED_JSON" "$HTTP_JSON"
else
    echo "Mainnet readiness check complete"
    emit_summary "$DOCS_JSON" "$DNS_JSON" "$HARDCODED_JSON" "$HTTP_JSON"
fi
