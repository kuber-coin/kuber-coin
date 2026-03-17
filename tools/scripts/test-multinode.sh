#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="reports/multinode"
API_KEY="public_test_key_not_a_secret"
HOST_NAME="127.0.0.1"
NETWORK="regtest"
STARTUP_TIMEOUT_SEC=25
SYNC_TIMEOUT_SEC=45
RPC_TIMEOUT_SEC=120
FUNDING_BLOCKS=120
TRANSFER_AMOUNT=1000000
FULL_TEST=false
JSON_OUTPUT=false
CLEAN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --host-name)
            HOST_NAME="$2"
            shift 2
            ;;
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --startup-timeout-sec)
            STARTUP_TIMEOUT_SEC="$2"
            shift 2
            ;;
        --sync-timeout-sec)
            SYNC_TIMEOUT_SEC="$2"
            shift 2
            ;;
        --rpc-timeout-sec)
            RPC_TIMEOUT_SEC="$2"
            shift 2
            ;;
        --funding-blocks)
            FUNDING_BLOCKS="$2"
            shift 2
            ;;
        --transfer-amount)
            TRANSFER_AMOUNT="$2"
            shift 2
            ;;
        --full-test)
            FULL_TEST=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

CYAN='\033[0;36m'
NC='\033[0m'

write_section() {
    printf "\n${CYAN}=== %s ===${NC}\n" "$1"
}

fail() {
    printf '%b\n' "$1" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

get_api_key_value() {
    local key="$1"
    if [[ "$key" =~ ^(Bearer|ApiKey)[[:space:]]+(.+)$ ]]; then
        printf '%s' "${BASH_REMATCH[2]}"
    else
        printf '%s' "$key"
    fi
}

get_auth_header() {
    local key="$1"
    if [[ -z "$key" ]]; then
        return 0
    fi
    if [[ "$key" =~ ^(Bearer|ApiKey)[[:space:]] ]]; then
        printf '%s' "$key"
    else
        printf 'Bearer %s' "$key"
    fi
}

resolve_workspace_root() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$script_dir/../.." && pwd
}

resolve_demo_binary() {
    local workspace_root="$1"
    local exe_path="$workspace_root/target/release/kubercoin-node"
    local exe_fallback="$workspace_root/target/release/kubercoin-node.exe"
    if [[ -f "$exe_path" ]]; then
        printf '%s' "$exe_path"
        return 0
    fi
    if [[ -f "$exe_fallback" ]]; then
        printf '%s' "$exe_fallback"
        return 0
    fi
    if [[ ! -f "$exe_path" && ! -f "$exe_fallback" ]]; then
        require_command cargo
        echo "Building release binary..."
        (cd "$workspace_root" && cargo build -p kubercoin-node --release)
    fi
    if [[ -f "$exe_path" ]]; then
        printf '%s' "$exe_path"
    elif [[ -f "$exe_fallback" ]]; then
        printf '%s' "$exe_fallback"
    else
        fail "Unable to locate kubercoin-node after build"
    fi
}

json_value() {
    local raw_value="$1"
    python3 - "$raw_value" <<'PY'
import json, sys
print(json.dumps(sys.argv[1]))
PY
}

build_params() {
    python3 - "$@" <<'PY'
import json, sys
values = []
for arg in sys.argv[1:]:
    kind, value = arg.split(':', 1)
    if kind == 's':
        values.append(value)
    elif kind == 'i':
        values.append(int(value))
    elif kind == 'b':
        values.append(value.lower() == 'true')
    elif kind == 'j':
        values.append(json.loads(value))
    else:
        raise SystemExit(f'Unsupported parameter kind: {kind}')
print(json.dumps(values, separators=(',', ':')))
PY
}

json_get() {
    local path="$1"
    python3 - "$path" <<'PY'
import json, sys
path = sys.argv[1]
obj = json.load(sys.stdin)
if path:
    for part in path.split('.'):
        if isinstance(obj, list):
            obj = obj[int(part)]
        else:
            obj = obj[part]
if isinstance(obj, (dict, list)):
    print(json.dumps(obj, separators=(',', ':')))
elif obj is None:
    print('null')
elif isinstance(obj, bool):
    print('true' if obj else 'false')
else:
    print(obj)
PY
}

json_array_contains() {
    local needle="$1"
    python3 - "$needle" <<'PY'
import json, sys
needle = sys.argv[1]
obj = json.load(sys.stdin)
if needle in obj:
    print('true')
else:
    print('false')
PY
}

assert_rpc_ok() {
    local response="$1"
    local method="$2"
    python3 -c 'import json, sys
method = sys.argv[1]
obj = json.load(sys.stdin)
error = obj.get("error")
if error is not None:
    code = error.get("code")
    message = error.get("message")
    raise SystemExit(f"{method} failed: {code} {message}")' "$method" <<< "$response"
}

wait_port() {
    local target_host="$1"
    local port="$2"
    local timeout_sec="$3"
    python3 - "$target_host" "$port" "$timeout_sec" <<'PY'
import socket, sys, time
host = sys.argv[1]
port = int(sys.argv[2])
timeout = int(sys.argv[3])
deadline = time.time() + timeout
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=1):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.25)
raise SystemExit(1)
PY
}

wait_http_health() {
    local target_host="$1"
    local port="$2"
    local timeout_sec="$3"
    local deadline=$((SECONDS + timeout_sec))
    while (( SECONDS < deadline )); do
        if curl -fsS --max-time 3 "http://${target_host}:${port}/api/health" | python3 -c 'import json, sys
obj = json.load(sys.stdin)
raise SystemExit(0 if obj.get("status") == "ok" else 1)'
        then
            return 0
        fi
        sleep 0.25
    done
    return 1
}

wait_until() {
    local timeout_sec="$1"
    local description="$2"
    local condition_name="$3"
    local deadline=$((SECONDS + timeout_sec))
    while (( SECONDS < deadline )); do
        if "$condition_name"; then
            return 0
        fi
        sleep 0.5
    done
    fail "Timed out waiting for ${description}"
}

test_until() {
    local timeout_sec="$1"
    local condition_name="$2"
    local deadline=$((SECONDS + timeout_sec))
    while (( SECONDS < deadline )); do
        if "$condition_name"; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

rpc_call() {
    local port="$1"
    local method="$2"
    local params_json="${3:-null}"
    local auth_header
    auth_header="$(get_auth_header "$API_KEY")"
    local payload
    payload="$(python3 - "$method" "$params_json" <<'PY'
import json, sys
method = sys.argv[1]
params = json.loads(sys.argv[2])
payload = {'jsonrpc': '2.0', 'method': method, 'id': 1}
if params is not None:
    payload['params'] = params
print(json.dumps(payload, separators=(',', ':')))
PY
)"
    if [[ -n "$auth_header" ]]; then
        curl -fsS --max-time "$RPC_TIMEOUT_SEC" -H "Authorization: ${auth_header}" -H 'Content-Type: application/json' -d "$payload" "http://${HOST_NAME}:${port}/"
    else
        curl -fsS --max-time "$RPC_TIMEOUT_SEC" -H 'Content-Type: application/json' -d "$payload" "http://${HOST_NAME}:${port}/"
    fi
}

start_test_node() {
    local idx="$1"
    local api_key_value
    api_key_value="$(get_api_key_value "$API_KEY")"
    KUBERCOIN_API_KEYS="$api_key_value" \
    KUBERCOIN_API_AUTH_ENABLED="true" \
    KUBERCOIN_TEST_MODE="${KUBERCOIN_TEST_MODE:-1}" \
    "$EXE" \
        --network "$NETWORK" \
        --data-dir "${NODE_DATA_DIRS[$idx]}" \
        --rpc-addr "${HOST_NAME}:${NODE_RPC_PORTS[$idx]}" \
        --rest-addr "${HOST_NAME}:${NODE_REST_PORTS[$idx]}" \
        --p2p-addr "${HOST_NAME}:${NODE_P2P_PORTS[$idx]}" \
        >"${NODE_STDOUTS[$idx]}" 2>"${NODE_STDERRS[$idx]}" &
    NODE_PIDS[idx]=$!
}

get_node_height() {
    local idx="$1"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getblockcount)"
    assert_rpc_ok "$response" "getblockcount(${NODE_NAMES[$idx]})"
    printf '%s' "$response" | json_get 'result'
}

get_node_connections() {
    local idx="$1"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getconnectioncount)"
    assert_rpc_ok "$response" "getconnectioncount(${NODE_NAMES[$idx]})"
    printf '%s' "$response" | json_get 'result'
}

get_node_mempool() {
    local idx="$1"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getrawmempool)"
    assert_rpc_ok "$response" "getrawmempool(${NODE_NAMES[$idx]})"
    printf '%s' "$response" | json_get 'result'
}

get_block_raw() {
    local idx="$1"
    local height="$2"
    local hash_response block_response hash_value
    hash_response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getblockhash "$(build_params "i:${height}")")"
    assert_rpc_ok "$hash_response" "getblockhash(${NODE_NAMES[$idx]},${height})"
    hash_value="$(printf '%s' "$hash_response" | json_get 'result')"
    block_response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getblock "$(build_params "s:${hash_value}" "i:0")")"
    assert_rpc_ok "$block_response" "getblock(${NODE_NAMES[$idx]},${height})"
    printf '%s' "$block_response" | json_get 'result'
}

sync_blocks_from_source() {
    local source_idx="$1"
    shift
    local source_height target_idx target_height height raw_block response
    source_height="$(get_node_height "$source_idx")"
    for target_idx in "$@"; do
        target_height="$(get_node_height "$target_idx")"
        if (( target_height >= source_height )); then
            continue
        fi
        for (( height=target_height + 1; height<=source_height; height++ )); do
            raw_block="$(get_block_raw "$source_idx" "$height")"
            response="$(rpc_call "${NODE_RPC_PORTS[$target_idx]}" submitblock "$(build_params "s:${raw_block}")")"
            assert_rpc_ok "$response" "submitblock(${NODE_NAMES[$target_idx]}<=${NODE_NAMES[$source_idx]}@${height})"
        done
    done
}

get_raw_transaction() {
    local idx="$1"
    local txid="$2"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" getrawtransaction "$(build_params "s:${txid}" 'b:false')")"
    assert_rpc_ok "$response" "getrawtransaction(${NODE_NAMES[$idx]},${txid})"
    printf '%s' "$response" | json_get 'result'
}

relay_transaction_from_source() {
    local source_idx="$1"
    local txid="$2"
    shift 2
    local raw_tx response target_idx
    raw_tx="$(get_raw_transaction "$source_idx" "$txid")"
    for target_idx in "$@"; do
        if [[ "$(get_node_mempool "$target_idx" | json_array_contains "$txid")" == "true" ]]; then
            continue
        fi
        response="$(rpc_call "${NODE_RPC_PORTS[$target_idx]}" sendrawtransaction "$(build_params "s:${raw_tx}")")"
        assert_rpc_ok "$response" "sendrawtransaction(${NODE_NAMES[$target_idx]}<=${NODE_NAMES[$source_idx]})"
    done
}

connect_nodes() {
    local source_idx="$1"
    shift
    local target_idx address response
    for target_idx in "$@"; do
        address="${HOST_NAME}:${NODE_P2P_PORTS[$target_idx]}"
        response="$(rpc_call "${NODE_RPC_PORTS[$source_idx]}" addnode "$(build_params "s:${address}" 's:add')")"
        assert_rpc_ok "$response" "addnode(${NODE_NAMES[$source_idx]}->${NODE_NAMES[$target_idx]})"
    done
}

create_wallet() {
    local idx="$1"
    local wallet_name="$2"
    local passphrase="$3"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" createwallet "$(build_params "s:${wallet_name}" "s:${passphrase}")")"
    assert_rpc_ok "$response" "createwallet(${NODE_NAMES[$idx]}/${wallet_name})"
    printf '%s' "$response" | json_get 'result'
}

load_wallet() {
    local idx="$1"
    local wallet_name="$2"
    local passphrase="$3"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" loadwallet "$(build_params "s:${wallet_name}" "s:${passphrase}")")"
    assert_rpc_ok "$response" "loadwallet(${NODE_NAMES[$idx]}/${wallet_name})"
}

unlock_wallet() {
    local idx="$1"
    local passphrase="$2"
    local timeout_sec="${3:-600}"
    local response
    response="$(rpc_call "${NODE_RPC_PORTS[$idx]}" walletpassphrase "$(build_params "s:${passphrase}" "i:${timeout_sec}")")"
    assert_rpc_ok "$response" "walletpassphrase(${NODE_NAMES[$idx]})"
}

all_nodes_have_one_connection() {
    local idx
    for idx in 0 1 2; do
        if (( $(get_node_connections "$idx") < 1 )); then
            return 1
        fi
    done
    return 0
}

all_nodes_match_expected_height() {
    local idx
    for idx in 0 1 2; do
        if [[ "$(get_node_height "$idx")" != "$EXPECTED_HEIGHT" ]]; then
            return 1
        fi
    done
    return 0
}

all_nodes_have_txid() {
    local idx
    for idx in 0 1 2; do
        if [[ "$(get_node_mempool "$idx" | json_array_contains "$TXID")" != "true" ]]; then
            return 1
        fi
    done
    return 0
}

all_secondary_nodes_match_confirmed_height() {
    local idx
    for idx in 1 2; do
        if [[ "$(get_node_height "$idx")" != "$CONFIRMED_HEIGHT" ]]; then
            return 1
        fi
    done
    return 0
}

emit_summary() {
    local connections_tsv="$1"
    local heights_tsv="$2"
    local transaction_payload="$3"
    python3 - "$OUTPUT_ROOT" "$NETWORK" "$FULL_TEST" "$BLOCK_RELAY_MODE" "$connections_tsv" "$heights_tsv" "$transaction_payload" <<'PY'
import json, sys
output_root, network, full_test, block_relay_mode, connections_tsv, heights_tsv, transaction_payload = sys.argv[1:8]
node_lines = []
for raw in sys.stdin.read().splitlines():
    name, rpc_port, p2p_port, data_dir, stdout, stderr = raw.split('\t')
    node_lines.append({
        'name': name,
        'rpcPort': int(rpc_port),
        'p2pPort': int(p2p_port),
        'dataDir': data_dir,
        'stdout': stdout,
        'stderr': stderr,
    })
connections = []
if connections_tsv:
    for row in connections_tsv.split('\n'):
        if not row:
            continue
        node, count = row.split('\t')
        connections.append({'node': node, 'connections': int(count)})
heights = []
if heights_tsv:
    for row in heights_tsv.split('\n'):
        if not row:
            continue
        node, height = row.split('\t')
        heights.append({'node': node, 'height': int(height)})
transaction = None
if transaction_payload:
    transaction = json.loads(transaction_payload)
summary = {
    'outputRoot': output_root,
    'network': network,
    'fullTest': full_test.lower() == 'true',
    'nodes': node_lines,
    'connections': connections,
    'blockRelayMode': block_relay_mode,
    'heights': heights,
    'transaction': transaction,
}
print(json.dumps(summary, indent=4))
PY
}

cleanup() {
    local pid
    for pid in "${NODE_PIDS[@]:-}"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    sleep 1
    for pid in "${NODE_PIDS[@]:-}"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
}

trap cleanup EXIT INT TERM

require_command curl
require_command python3

WORKSPACE_ROOT="$(resolve_workspace_root)"
EXE="$(resolve_demo_binary "$WORKSPACE_ROOT")"
OUTPUT_ROOT="$WORKSPACE_ROOT/$OUTPUT_DIR"

if [[ "$CLEAN" == true && -d "$OUTPUT_ROOT" ]]; then
    rm -rf "$OUTPUT_ROOT"
fi
mkdir -p "$OUTPUT_ROOT"

NODE_NAMES=(node1 node2 node3)
NODE_RPC_PORTS=(38634 38644 38654)
NODE_REST_PORTS=(38080 38090 38100)
NODE_P2P_PORTS=(38633 38643 38653)
NODE_DATA_DIRS=()
NODE_STDOUTS=()
NODE_STDERRS=()
NODE_PIDS=()

for idx in 0 1 2; do
    NODE_DATA_DIRS[idx]="$OUTPUT_ROOT/${NODE_NAMES[$idx]}"
    NODE_STDOUTS[idx]="$OUTPUT_ROOT/${NODE_NAMES[$idx]}.out"
    NODE_STDERRS[idx]="$OUTPUT_ROOT/${NODE_NAMES[$idx]}.err"
    rm -rf "${NODE_DATA_DIRS[$idx]}" "${NODE_STDOUTS[$idx]}" "${NODE_STDERRS[$idx]}"
    mkdir -p "${NODE_DATA_DIRS[$idx]}"
done

write_section "Start local nodes"
for idx in 0 1 2; do
    start_test_node "$idx"
    wait_port "$HOST_NAME" "${NODE_RPC_PORTS[$idx]}" "$STARTUP_TIMEOUT_SEC" || fail "${NODE_NAMES[$idx]} did not open RPC port ${NODE_RPC_PORTS[$idx]}"
    wait_http_health "$HOST_NAME" "${NODE_RPC_PORTS[$idx]}" "$STARTUP_TIMEOUT_SEC" || fail "${NODE_NAMES[$idx]} did not become healthy"
    printf '%s: rpc=%s p2p=%s\n' "${NODE_NAMES[$idx]}" "${NODE_RPC_PORTS[$idx]}" "${NODE_P2P_PORTS[$idx]}"
done

write_section "Connect peers"
connect_nodes 1 0
connect_nodes 2 0 1
wait_until "$SYNC_TIMEOUT_SEC" "all nodes to observe at least one peer connection" all_nodes_have_one_connection

CONNECTIONS_TSV=""
for idx in 0 1 2; do
    CONNECTIONS_TSV+="${NODE_NAMES[$idx]}\t$(get_node_connections "$idx")\n"
done
CONNECTIONS_TSV="${CONNECTIONS_TSV%\n}"

write_section "Block propagation"
MINER_WALLET_JSON="$(create_wallet 0 multinode-miner multinode-miner-passphrase)"
MINER_ADDRESS="$(printf '%s' "$MINER_WALLET_JSON" | json_get 'address')"
MINED_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[0]}" generatetoaddress "$(build_params 'i:1' "s:${MINER_ADDRESS}")")"
assert_rpc_ok "$MINED_RESPONSE" "generatetoaddress(block-propagation)"
EXPECTED_HEIGHT="$(get_node_height 0)"
BLOCK_RELAY_MODE="p2p"
if ! test_until 5 all_nodes_match_expected_height; then
    sync_blocks_from_source 0 1 2
    BLOCK_RELAY_MODE="rpc-fallback"
fi
wait_until "$SYNC_TIMEOUT_SEC" "all nodes to converge on the mined height" all_nodes_match_expected_height

HEIGHTS_TSV=""
for idx in 0 1 2; do
    HEIGHTS_TSV+="${NODE_NAMES[$idx]}\t$(get_node_height "$idx")\n"
done
HEIGHTS_TSV="${HEIGHTS_TSV%\n}"

TRANSACTION_PAYLOAD=""
if [[ "$FULL_TEST" == true ]]; then
    write_section "Transaction propagation"
    SENDER_WALLET_JSON="$(create_wallet 0 multinode-sender multinode-sender-passphrase)"
    RECIPIENT_WALLET_JSON="$(create_wallet 1 multinode-recipient multinode-recipient-passphrase)"
    CONFIRM_WALLET_JSON="$(create_wallet 0 multinode-confirm multinode-confirm-passphrase)"

    SENDER_ADDRESS="$(printf '%s' "$SENDER_WALLET_JSON" | json_get 'address')"
    RECIPIENT_ADDRESS="$(printf '%s' "$RECIPIENT_WALLET_JSON" | json_get 'address')"
    CONFIRM_ADDRESS="$(printf '%s' "$CONFIRM_WALLET_JSON" | json_get 'address')"

    load_wallet 0 multinode-sender multinode-sender-passphrase
    unlock_wallet 0 multinode-sender-passphrase 600

    FUNDING_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[0]}" generatetoaddress "$(build_params "i:${FUNDING_BLOCKS}" "s:${SENDER_ADDRESS}")")"
    assert_rpc_ok "$FUNDING_RESPONSE" "generatetoaddress(funding)"

    FUNDING_RELAY_MODE="p2p"
    EXPECTED_HEIGHT="$(get_node_height 0)"
    if ! test_until 5 all_nodes_match_expected_height; then
        sync_blocks_from_source 0 1 2
        FUNDING_RELAY_MODE="rpc-fallback"
    fi
    wait_until "$SYNC_TIMEOUT_SEC" "funding blocks to converge on all nodes" all_nodes_match_expected_height

    SENDER_BALANCE_BEFORE_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[0]}" getbalance "$(build_params "s:${SENDER_ADDRESS}")")"
    assert_rpc_ok "$SENDER_BALANCE_BEFORE_RESPONSE" "getbalance(sender-before)"
    SENDER_BALANCE_BEFORE="$(printf '%s' "$SENDER_BALANCE_BEFORE_RESPONSE" | json_get 'result')"

    SEND_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[0]}" sendtoaddress "$(build_params "s:${RECIPIENT_ADDRESS}" "i:${TRANSFER_AMOUNT}")")"
    assert_rpc_ok "$SEND_RESPONSE" "sendtoaddress(multinode)"
    TXID="$(printf '%s' "$SEND_RESPONSE" | json_get 'result.txid')"

    TRANSACTION_RELAY_MODE="p2p"
    if ! test_until 5 all_nodes_have_txid; then
        relay_transaction_from_source 0 "$TXID" 1 2
        TRANSACTION_RELAY_MODE="rpc-fallback"
    fi
    wait_until "$SYNC_TIMEOUT_SEC" "transaction to appear in all mempools" all_nodes_have_txid

    load_wallet 0 multinode-confirm multinode-confirm-passphrase
    CONFIRM_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[0]}" generatetoaddress "$(build_params 'i:1' "s:${CONFIRM_ADDRESS}")")"
    assert_rpc_ok "$CONFIRM_RESPONSE" "generatetoaddress(confirm)"
    CONFIRMED_HEIGHT="$(get_node_height 0)"
    CONFIRMATION_RELAY_MODE="p2p"
    if ! test_until 5 all_secondary_nodes_match_confirmed_height; then
        sync_blocks_from_source 0 1 2
        CONFIRMATION_RELAY_MODE="rpc-fallback"
    fi
    EXPECTED_HEIGHT="$CONFIRMED_HEIGHT"
    wait_until "$SYNC_TIMEOUT_SEC" "all nodes to converge after confirming the transaction" all_nodes_match_expected_height

    RECIPIENT_BALANCE_RESPONSE="$(rpc_call "${NODE_RPC_PORTS[1]}" getbalance "$(build_params "s:${RECIPIENT_ADDRESS}")")"
    assert_rpc_ok "$RECIPIENT_BALANCE_RESPONSE" "getbalance(recipient-after)"
    RECIPIENT_BALANCE_AFTER="$(printf '%s' "$RECIPIENT_BALANCE_RESPONSE" | json_get 'result')"

    TRANSACTION_PAYLOAD="$(python3 - \
        "$SENDER_ADDRESS" \
        "$SENDER_BALANCE_BEFORE" \
        "$RECIPIENT_ADDRESS" \
        "$RECIPIENT_BALANCE_AFTER" \
        "$TXID" \
        "$TRANSFER_AMOUNT" \
        "$FUNDING_RESPONSE" \
        "$CONFIRM_RESPONSE" \
        "$FUNDING_RELAY_MODE" \
        "$TRANSACTION_RELAY_MODE" \
        "$CONFIRMATION_RELAY_MODE" <<'PY'
import json, sys
sender_address = sys.argv[1]
sender_balance_before = int(sys.argv[2])
recipient_address = sys.argv[3]
recipient_balance_after = int(sys.argv[4])
txid = sys.argv[5]
amount = int(sys.argv[6])
funding_response = json.loads(sys.argv[7])
confirm_response = json.loads(sys.argv[8])
funding_relay_mode = sys.argv[9]
transaction_relay_mode = sys.argv[10]
confirmation_relay_mode = sys.argv[11]
print(json.dumps({
    'senderAddress': sender_address,
    'senderBalanceBefore': sender_balance_before,
    'recipientAddress': recipient_address,
    'recipientBalanceAfter': recipient_balance_after,
    'txid': txid,
    'amount': amount,
    'fundingBlocks': len(funding_response['result']),
    'confirmationBlocks': len(confirm_response['result']),
    'fundingRelayMode': funding_relay_mode,
    'transactionRelayMode': transaction_relay_mode,
    'confirmationRelayMode': confirmation_relay_mode,
}))
PY
)"
fi

NODE_SUMMARY_LINES=""
for idx in 0 1 2; do
    NODE_SUMMARY_LINES+="${NODE_NAMES[$idx]}\t${NODE_RPC_PORTS[$idx]}\t${NODE_P2P_PORTS[$idx]}\t${NODE_DATA_DIRS[$idx]}\t${NODE_STDOUTS[$idx]}\t${NODE_STDERRS[$idx]}\n"
done
NODE_SUMMARY_LINES="${NODE_SUMMARY_LINES%\n}"

if [[ "$JSON_OUTPUT" == true ]]; then
    printf '%b' "$NODE_SUMMARY_LINES" | emit_summary "$(printf '%b' "$CONNECTIONS_TSV")" "$(printf '%b' "$HEIGHTS_TSV")" "$TRANSACTION_PAYLOAD"
else
    echo "Multi-node test passed"
    printf '%b' "$NODE_SUMMARY_LINES" | emit_summary "$(printf '%b' "$CONNECTIONS_TSV")" "$(printf '%b' "$HEIGHTS_TSV")" "$TRANSACTION_PAYLOAD"
fi
