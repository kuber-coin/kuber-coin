# KUBER PROTOCOL SPECIFICATION (SPECS.md)
### Formal Engineering Specification for Kuber Core, Execution, RPC, Storage & Mint Engine

---

# 1. Overview

This document defines the full technical specification of the **Kuber Protocol**, including:

- Core Chain Node Specification (K-Chain)
- Execution Environment Spec (KVM)
- RPC Interface Specification
- Consensus Interface Specification
- Wallet Protocol & Cryptographic Specification
- Mint Engine (KME) Specification
- Data Storage & Merkle Proof Specification
- Node Lifecycle Specification
- Networking, Peer Model, and Message Structure
- Error Codes & Failure Conditions

The specification ensures deterministic behavior across all implementations.

---

# 2. Definitions

```
Node: A running instance of the Kuber Core chain.
Block: An ordered set of transactions.
State: The current ledger representation.
Transaction (TX): A signed payload that mutates state.
Consensus Engine: Module deciding block ordering & finality.
Execution Engine: Module applying TX to state.
Wallet Layer: Cryptographic identity interface.
Mint Engine: Off-chain asset issuer connecting to chain.
```

All state transitions **must be deterministic** across nodes.

---

# 3. Node Architecture

Kuber Core node implementation consists of:

```
+------------------------------------------------+
|              Kuber Core Node                   |
+------------------------------------------------+
|   RPC Layer   |   Consensus   |  P2P Network   |
+------------------------------------------------+
|             Execution Engine (KVM)             |
+------------------------------------------------+
|                State Manager                   |
+------------------------------------------------+
|                Storage Engine                  |
+------------------------------------------------+
```

Modules communicate via *internal message channels*.

---

# 4. State Model

## 4.1 Global State (Sᵗ)

The state at height *t* is defined as:

```
Sᵗ = {
   Accounts,
   Balances,
   MintProofs,
   Storage,
   Metadata
}
```

State transition:

```
Sᵗ⁺¹ = F(Sᵗ, TXᵗ)
```

Where:

- `TXᵗ` = ordered list of transactions
- `F` = deterministic transition function

## 4.2 Account Structure

```
Account {
   address: 20 bytes
   nonce: uint64
   balance: uint256
   storage_root: 32 bytes (future)
}
```

---

# 5. Block Specification

```
Block {
   header: BlockHeader
   transactions: [TX]
}
```

## 5.1 Block Header

```
BlockHeader {
   height: uint64
   previous_hash: 32 bytes
   state_root: 32 bytes
   timestamp: uint64
   proposer: address
   merkle_root: 32 bytes
   signature: bytes
}
```

Formally:

```
Hᵗ = Hash(BlockHeaderᵗ)
```

---

# 6. Transaction Specification (TX)

```
Transaction {
   from: address
   nonce: uint64
   payload: bytes
   signature: bytes
}
```

TX hash:

```
TX_hash = H(from || nonce || payload)
```

Signature verification:

```
Verify(pk(from), signature, TX_hash) = true
```

Invalid transactions must be rejected.

---

# 7. Execution Specification (KVM)

## 7.1 Instruction Set

The minimal deterministic instruction set is:

```
LOAD R, addr
STORE addr, R
HASH R1, R2
ADD R1, R2
SUB R1, R2
MUL R1, R2
SIGCHK pk, sig, msg
NOP
END
```

## 7.2 Execution Rules

- All instructions MUST have constant execution cost.
- Execution MUST halt on invalid opcodes.
- Execution MUST be deterministic across nodes.

## 7.3 Execution Flow

```
for each instruction:
    execute()
if END not reached → invalid TX
```

---

# 8. RPC Specification

All RPC calls follow the **JSON-RPC 2.0 standard**.

## 8.1 Endpoints

### `/health`

```
GET /health -> {
   status: "ok",
   chain: "kuber-core"
}
```

### `/rpc`

```
POST /rpc {
   "jsonrpc": "2.0",
   "method": "method_name",
   "params": {},
   "id": 1
}
```

### Common Methods

#### `chain.getHeight`

Returns current block height.

#### `chain.getStateRoot`

Returns `state_root`.

#### `tx.broadcast`

Submits transaction for inclusion.

All RPC responses MUST be deterministic and side-effect free.

---

# 9. Consensus Interface Specification

Kuber Core supports multiple consensus engines through the **Consensus Interface Layer**.

## 9.1 Required Consensus Functions

Consensus module MUST implement:

```
Initialize()
ProposeBlock()
VerifyBlock(block)
FinalizeBlock(block)
HandleVote(vote)
Sync()
```

## 9.2 Consensus Safety Contract

The following MUST hold:

```
∀ honest i,j : Blockᵢ[t] = Blockⱼ[t]
```

## 9.3 Leader Selection

Deterministic leader selection function:

```
Leader(t) = H(t || previous_hash) mod |V|
```

---

# 10. Mint Engine Specification (KME)

KME is an off-chain, deterministic asset generator.

## 10.1 Mint Structure

```
Mint {
   id: 32 bytes
   owner: address
   metadata: JSON
   timestamp: uint64
}
```

## 10.2 Mint ID Calculation

```
mint_id = H(owner || metadata || timestamp || nonce)
```

## 10.3 MintProof Commit

```
MintProof = H(mint_id)
```

Commit:

```
TX.payload = MintProof
```

The chain MUST accept or reject based solely on validity of proof format.

---

# 11. Wallet Layer Specification (KWL)

## 11.1 Key Generation

Initial devnet (pseudo addresses):

```
address = "0x" + random_hex(40)
```

Mainnet:

```
pk = sk · G
address = H(pk)
```

## 11.2 Signing

```
signature = Sign(sk, TX_hash)
```

Wallet MUST implement deterministic Ed25519 signing in production.

---

# 12. Storage Engine Specification (KDL)

Storage backend MUST support:

- Ordered key-value operations  
- Merkle root generation  
- Snapshots  
- State pruning  

## 12.1 Merkle Tree

State root:

```
state_root = MerkleHash(Sᵗ)
```

Proof:

```
VerifyProof(leaf, proof, state_root)
```

---

# 13. Network Specification

Nodes communicate via:

```
Block messages
Vote messages
State sync messages
Ping/health heartbeat
```

All network messages MUST be encoded using protobuf (recommended).

---

# 14. Node Lifecycle

1. **Init**
2. **Load state**
3. **Start RPC**
4. **Connect consensus engine**
5. **Begin block sync**
6. **Start block production**
7. **Accept transactions**
8. **Execute transitions**
9. **Persist state**
10. **Repeat**

Failure conditions MUST trigger:

```
Rollback → Recover → Resume
```

---

# 15. Error Codes

```
ERR_SIG_INVALID
ERR_NONCE_MISMATCH
ERR_PAYLOAD_INVALID
ERR_STATE_ROOT_MISMATCH
ERR_BLOCK_INVALID
ERR_PROOF_INVALID
ERR_KVM_RUNTIME
ERR_CONSENSUS_FAULT
ERR_STORAGE_FAILURE
```

All errors MUST be deterministic.

---

# 16. Security Requirements

Kuber MUST guarantee:

### 16.1 Safety
```
Two honest nodes never finalize different blocks at same height.
```

### 16.2 Liveness
```
Honest transactions are eventually included in a block.
```

### 16.3 Integrity
```
State transitions follow KVM rules only.
```

### 16.4 Replay Protection
```
nonce uniqueness per account
```

### 16.5 Mint Proof Integrity
```
MintProof must uniquely map → MintID
```

---

# 17. Hard Fork Policy

Protocol changes require:

```
2/3 governance approval
```

Governance messages MUST be state-verified.

---

# 18. Implementation Requirements

To be considered compliant, an implementation MUST:

- Implement all RPC endpoints  
- Implement KVM instruction set  
- Follow consensus interface rules  
- Use deterministic hashing (SHA-256 or BLAKE3)  
- Persist state with Merkle guarantees  
- Follow Kuber error codes  
- Support MintProof submissions  

---

# 19. Conclusion

This specification defines the foundation of the Kuber protocol.  
Any node, chain, wallet, or mint engine adhering to this document will maintain:

- deterministic state  
- consensus safety  
- execution reliability  
- cross-implementation compatibility  

This is the technical backbone of the Kuber ecosystem.

---
