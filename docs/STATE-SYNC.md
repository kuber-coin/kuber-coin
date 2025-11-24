# KUBER STATE SYNC SPECIFICATION  
### Snapshot Sync • Chunk Sync • Merkle Proofs • Validator Roles • Integrity Rules

---

# 1. Overview

Kuber’s State Sync protocol allows new or lagging nodes to sync the blockchain state **without replaying all historical blocks**, dramatically reducing bootstrap time.

State Sync is:

- Fast  
- Deterministic  
- Merkle-verifiable  
- Validator-supervised  
- Fork-safe  
- Chunk-based  

Every node must implement this specification to stay compatible with Kuber Core.

---

# 2. State Representation

The full chain state at height **h** consists of:

```
State(h) = {
  Accounts,
  Storage,
  MintRecords,
  ValidatorSet,
  Parameters,
  Metadata
}
```

The state is represented by a **Merkle-Patricia Tree** (MPT) or a deterministic binary Merkle tree.

Root hash:

```
state_root(h) = MerkleHash(Tree(h))
```

This root appears in every block header.

---

# 3. Snapshot Model

A snapshot is a **complete, immutable copy** of the chain state at a specific block height.

Snapshot structure:

```
Snapshot {
  height: uint64
  state_root: bytes32
  total_chunks: uint32
  chunk_size: uint32
  metadata_hash: bytes32
}
```

Snapshot is immutable once produced.

Validators produce snapshots at:

```
SnapshotInterval = 1,000 blocks (default)
```

---

# 4. Chunking Mechanism

To enable efficient P2P distribution, the snapshot is split into fixed-sized chunks.

Chunk size:

```
chunk_size = 16 KB (configurable)
```

Chunk ID:

```
chunk_id ∈ [0 ... total_chunks − 1]
```

Chunk structure:

```
Chunk {
  chunk_id,
  height,
  state_root,
  data: bytes,
  proof: MerkleProof
}
```

Each chunk includes a **Merkle proof** so nodes can reconstruct the state root independently.

---

# 5. Merkle Proof Structure

Proofs provide inclusion of chunks in the global state root.

```
MerkleProof {
  leaf_hash,
  branch: [hash₁, hash₂, ... hashₙ],
  direction_bits
}
```

Nodes verify:

```
MerkleVerify(leaf_hash, proof) == state_root
```

If verification fails → reject chunk → slash sender if validator.

---

# 6. Sync Workflow

State Sync consists of five deterministic phases:

```
1. Discover snapshot
2. Request snapshot metadata
3. Request chunks
4. Verify chunks + Merkle proofs
5. Assemble state + verify root
6. Switch to block sync
```

### 6.1 Phase 1 — Discover Snapshot
Node asks peers:

```
/p2p/state/snapshot-request
```

Peers respond with:

```
SnapshotMetadata
```

Node selects the highest valid snapshot.

---

### 6.2 Phase 2 — Request Chunk Map

Node requests:

```
StateSyncRequest(height, state_root)
```

Peers respond with:

```
StateSyncChunk(...)
```

Chunks can be requested in parallel.

---

### 6.3 Phase 3 — Download Chunks

Node downloads all N chunks:

```
for chunk_id in [0..total_chunks-1]:
    send(StateSyncChunkRequest(chunk_id))
```

Nodes must be ready to handle out-of-order arrivals.

---

### 6.4 Phase 4 — Verify Chunks

For each chunk:

```
if !MerkleVerify(chunk.data, chunk.proof, state_root):
    reject chunk
```

After verifying all chunks:

```
computed_root = MerkleRebuild(all_chunks)
if computed_root != state_root:
    FAIL (invalid snapshot)
```

---

### 6.5 Phase 5 — Apply Snapshot

Node writes reconstructed state to local DB and sets:

```
current_height = snapshot.height
current_state_root = snapshot.state_root
```

Node transitions into **Block Sync Mode** from the next block.

---

# 7. Fast Sync → Full Sync Boundary

Once state sync completes:

```
state_synced → block_sync
```

Node must:

- reject historical blocks older than snapshot height  
- verify all new blocks normally via consensus  

---

# 8. Validator Responsibilities

Validators play a critical role.

### Validators MUST:

1. Produce correct snapshots  
2. Serve chunk requests  
3. Provide valid Merkle proofs  
4. Reject malformed chunk requests  
5. Refuse to serve mismatched heights or roots  
6. Maintain snapshot availability for `K` recent snapshots  

### Slashing for invalid chunk:

If validator serves invalid chunk:

```
Slash 2%
Quarantine 48 hours
```

If validator serves mismatched state root:

```
Slash 5%
Jail 3 days
```

---

# 9. Data Availability Rules

A snapshot must only be considered valid if:

```
all chunks are available
all proofs verify
reconstructed_root == advertised root
```

Nodes must NOT proceed until these conditions hold.

---

# 10. Chunk Gossip Rules

To prevent DoS, chunk gossip is restricted:

- Chunks only sent on request  
- Max chunks/s per peer  
- Chunk size must match snapshot metadata  
- Invalid chunks → penalty  

Gossip messages:

```
ChunkRequest
ChunkResponse
SnapshotMetadata
```

---

# 11. Security Guarantees

State Sync must preserve:

### Guarantee 1 — Integrity
Chunks must reconstruct the advertised state root.

### Guarantee 2 — Availability
Validators must store snapshots for at least:

```
SnapshotRetention = 7 snapshots
```

### Guarantee 3 — Non-Byzantine Safety
Snapshot cannot cause state divergence because:

- root verified via Merkle proofs  
- consensus ensures state_root matches chain history  
- validators are slashed for invalid snapshots  

### Guarantee 4 — Replay Protection
Snapshots are height-bound:

```
snapshot.height == advertised_height
```

Nodes reject snapshots outside canonical chain.

### Guarantee 5 — Fork Protection
If two snapshots have same height but different root:

```
Follow validator signatures → highest stake signed root
```

Forks resolved deterministically.

---

# 12. Light Client Integration

Light clients use:

```
MerkleProof
state_root
block_headers
```

To verify subset of state without full node overhead.

---

# 13. Attack Analysis

## 13.1 Invalid Snapshot Attack
Attacker sends corrupted chunks.

Mitigations:
- MerkleProof verification  
- Entire tree reconstruction  
- Validator slashing  

---

## 13.2 Missing Chunks Attack
Attacker withholds some chunks.

Mitigations:
- Multiple peers  
- Timeout → fallback peer  
- Validator penalty  

---

## 13.3 Fake Snapshot Attack
Attacker sends fake snapshot metadata.

Mitigations:
- height + state_root cross-check  
- follow highest stake-signed block  
- reject unsigned metadata  

---

## 13.4 DoS Attacks
Mitigations:
- per-peer rate limits  
- chunk-size caps  
- drop invalid peers  
- peer scoring  

---

## 13.5 Fork Injection
Attacker tries to sync node to wrong fork.

Mitigations:
- only accept snapshot matching canonical consensus root  
- deterministic fork choice rule  
- validator-set-verified root  

---

# 14. Mathematical Model

Snapshot of size:

```
S_total = StateBytes
ChunkSize = C
Chunks = ceil(S_total / C)
```

Expected sync time:

```
T_sync ≈ (Chunks / parallelism) × RTT
```

Merkle tree height:

```
h = ceil(log₂(Chunks))
```

Proof size:

```
proof_size = h × 32 bytes
```

---

# 15. Future Extensions

- ZK-state-sync (zero-knowledge state proofs)  
- Erasure-coded snapshots  
- Distributed chunk availability  
- State-diff sync (Δ-sync)  
- QUIC-based snapshot streams  

---

# 16. Summary

Kuber State Sync provides:

- High-speed node bootstrap  
- Deterministic state reconstruction  
- Merkle-proof verification of every chunk  
- Validator-enforced correctness  
- Built-in attack mitigation  
- Secure fallback to block sync  

This system ensures new nodes can join safely, quickly, and trustlessly without replaying every block in the chain’s history.

---
