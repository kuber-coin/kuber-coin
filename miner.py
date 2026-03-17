import json, hashlib, struct, urllib.request, time
RPC = "http://localhost:8332/"
BURN = "76a914" + "00"*20 + "88ac"
NONCE_OFFSET = 80

def rpc_raw(method, params=None):
    body = json.dumps({"jsonrpc":"2.0","method":method,"params":params or [],"id":1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def rpc(method, params=None):
    resp = rpc_raw(method, params)
    if resp.get("error"): raise Exception(str(resp["error"]))
    return resp["result"]

def sha256d(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def mine_one():
    tpl = rpc("getblocktemplate", [{"coinbase_script": BURN}])
    height = tpl["height"]
    target = bytes.fromhex(tpl["target"])
    block_data = bytearray(bytes.fromhex(tpl["block"]))
    t0 = time.time()
    for nonce in range(2**64):
        struct.pack_into("<Q", block_data, NONCE_OFFSET, nonce)
        h = sha256d(bytes(block_data[:96]))
        if h <= target:
            elapsed = time.time() - t0
            print("block %d nonce=%d in %.2fs hash=%s" % (height, nonce, elapsed, h.hex()[:16]))
            resp = rpc_raw("submitblock", [block_data.hex()])
            if resp.get("error"): print("REJECTED:", resp["error"]); return False
            print("result:", resp.get("result"))
            return True

print("start height:", rpc("getblockcount"))
i = 0
while True:
    mine_one()
    i += 1
    if i % 10 == 0:
        print("height:", rpc("getblockcount"))
print("done")

