# KUBER CONSENSUS SPECIFICATION  
### Deterministic BFT Consensus, Proposer Selection, Voting Rules, Fault Tolerance & Fork Logic

---

# 1. Overview

Kuber uses a **Deterministic BFT (dBFT)** consensus architecture inspired by HotStuff/Tendermint, but optimized for:

- Deterministic execution  
- Fast finality  
- Simple verification  
- Stake-weighted security  
- Clean validator rotations  

Consensus guarantees:

```
Safety:   No two honest nodes commit different blocks.
Liveness: Blocks commit if ≥ 2/3 validators behave honestly.
Faults:   Secure up to f < 1/3 malicious validators.
```

Consensus works in **rounds** per height and uses **3-phase voting**:

```
1. PREPARE
2. PREVOTE
3. PRECOMMIT
```

A block is committed when **≥ 2/3 precommits** are received.

---

# 2. Consensus Model

At height `h`, validators proceed through:

```
Round r = 0,1,2,3,...
```

Each round has:

```
Proposer(h,r)
Proposal message
Prevote stage
Precommit stage
Commit
```

The process is fully deterministic, fault-tolerant, and cryptographically enforced.

---

# 3. Actors & Weight

Each validator `vᵢ` has stake-weight:

```
power(vᵢ) = stakeᵢ / Σ stakeⱼ
```

Voting weight is proportional to stake.

A supermajority (≥2/3) is required for:

- Proposal acceptance  
- Block commit  
- Round advancement  

---

# 4. Message Types

Consensus uses three signed messages:

### 4.1 ProposalMessage
```
Proposal {
  height,
  round,
  block_hash,
  proposer_id,
  signature
}
```

### 4.2 PrevoteMessage
```
Prevote {
  height,
  round,
  block_hash OR NIL,
  voter_id,
  signature
}
```

### 4.3 PrecommitMessage
```
Precommit {
  height,
  round,
  block_hash OR NIL,
  voter_id,
  signature
}
```

All messages must be signed with validator’s consensus key.

---

# 5. Proposer Selection

Proposer per height & round:

```
index = H(height || round || previous_hash) mod |VActive|
Proposer = VActive[index]
```

Probability of proposer selection is proportional to stake:

```
P(proposer = vᵢ) = power(vᵢ)
```

---

# 6. Workflow per Height

```
+--------+      +---------+      +-----------+      +---------+
|Propose | ---> | Prevote | ---> | Precommit | ---> | Commit  |
+--------+      +---------+      +-----------+      +---------+
```

### 6.1 Step 1 — PROPOSE

The designated proposer broadcasts a block:

```
Proposal(h,r,B)
```

Validators validate:

- TX signatures  
- KVM execution  
- State root  
- Block size  
- Previous hash  

If valid → moves to PREVOTE.

Invalid → prevote NIL.

---

### 6.2 Step 2 — PREVOTE

Validators send:

```
Prevote(h,r,B_hash)   if block OK
Prevote(h,r,NIL)      if invalid
```

If ≥ 2/3 prevotes for the same block hash:

```
PrepareLock(B)
```

Validator becomes *locked* on block B for this height.

Else → go to next round.

---

### 6.3 Step 3 — PRECOMMIT

Validators precommit:

```
Precommit(h,r,B_hash) if locked_on(B)
Precommit(h,r,NIL)    otherwise
```

If ≥ 2/3 precommits for block B:

```
Commit(B)
Move to height h+1
```

Else → round increments.

---

# 7. Locking Rules

Locking preserves **Safety**.

Rules:

### Lock Rule 1: Lock on 2/3 prevotes
If validator sees:
```
Prevotes(B) ≥ 2/3
→ Lock on B
```

### Lock Rule 2: Unlock only when safer block exists
If validator sees higher round with valid 2/3 prevotes on B₂:

```
Unlock B₁ → Lock B₂
```

### Lock Rule 3: Never sign conflicting precommit
Signing two different precommits at same height ⇒ **slashable offence**.

---

# 8. Timeouts & Round Increments

Consensus avoids deadlock with deterministic timeouts.

Each round has:

```
T_propose(r)
T_prevote(r)
T_precommit(r)
```

Timeouts increase linearly:

```
T_propose(r)   = T0 + r * Δ
T_prevote(r)   = T1 + r * Δ
T_precommit(r) = T2 + r * Δ
```

If timeout expires:
- No decision in step → move to next round `r+1`.

Liveness holds if honest validators eventually time out faulty proposer rounds.

---

# 9. Block Validity Rules

A block B is valid iff:

```
1. Correct proposer
2. Valid transactions
3. Deterministic KVM execution
4. Correct state root
5. Correct previous_hash
6. Signature matches proposer key
```

Validators MUST NOT prevote or precommit invalid blocks.

---

# 10. Commit Rule (Finality)

A block is committed when:

```
Precommits(B) ≥ 2/3
```

Finality is **instant & irreversible** once committed.

No revert, no chain reorg.

---

# 11. Fork Choice Rule

Kuber uses **Highest Valid Round Commit** rule:

Validator picks the chain with:

1. **Highest height**
2. At same height → chain with highest round commit
3. If tied → chain with greatest cumulative validator power signed

Forks beyond one height are impossible unless safety assumptions break.

---

# 12. Safety Proof (Simplified)

Assume two conflicting blocks B₁ and B₂ commit at height h.

Commit requires:

```
≥ 2/3 precommits for B₁
≥ 2/3 precommits for B₂
```

By pigeonhole principle:

```
(2/3) + (2/3) > 1
```

Therefore:

```
Some validator vᵢ signed both B₁ and B₂ → double-sign → byzantine
```

Thus:

```
If < 1/3 malicious validators → conflicting commits impossible.
```

This satisfies deterministic safety.

---

# 13. Liveness Conditions

Liveness is preserved if:

- Network eventually delivers messages (asynchronous safety)  
- Honest validators follow the timeout policy  
- At least one proposer per height is honest  
- ≥ 2/3 stake is live  

In worst case, consensus advances in increasing rounds until honest proposer selected.

---

# 14. Equivocation Rules

Equivocation = signing two different messages:

- Prevote equivocation  
- Precommit equivocation  
- Proposal equivocation  

Penalty:

```
Slash 10%–20%
Jail validator
```

Consensus signatures verify identity deterministically.

---

# 15. Handling Malicious Proposers

If proposer is malicious:

- Block invalid → prevote NIL  
- Next round begins  
- Honest proposer eventually selected  

Effect:

```
No safety loss
At worst: extra rounds → short delay
```

---

# 16. Consensus RPC

### `/consensus/round`
Returns current height & round.

### `/consensus/validators`
Returns active validator set.

### `/consensus/votes`
Returns prevotes & precommits for debug.

### `/consensus/state`
Returns full consensus state machine snapshot.

All RPC data must be deterministic and verifiable.

---

# 17. Message Propagation (P2P)

Consensus messages flow through P2P:

```
Proposal → Gossip
Prevote → Gossip
Precommit → Gossip
```

Nodes reject:
- invalid signatures  
- unexpected heights  
- NIL flooding  
- malformed payloads  

Consensus messages use strict size limits (see P2P.md).

---

# 18. Consensus Engine Implementation

Kuber implementations must include:

- Deterministic state machine  
- Round-based scheduler  
- Timeout handler  
- Vote aggregator  
- Finality detector  
- Signature verifier  
- Block executor (via KVM)  

Concurrency allowed but final output must be deterministic.

---

# 19. Consensus Failure Conditions

A height fails if:

- < 2/3 prevotes for any block or NIL  
- < 2/3 precommits  
- timeouts exceed limits  

Recovery: increment round → continue consensus.

---

# 20. Byzantine Behaviors (Detectable)

- Double-sign prevotes  
- Double-sign precommits  
- Double-propose  
- Sending invalid block headers  
- Delaying messages intentionally  
- Censorship or selective gossip  
- False state roots  

All such behaviors generate proof-of-fault → slash.

---

# 21. BFT Thresholds

Kuber uses standard BFT:

```
n = total validators
f = max faulty
```

Requirement:

```
f < n/3
```

Supermajority threshold:

```
2F+1 = 2/3+ of total voting power
```

This is required for:
- prepare lock  
- precommit  
- commit finality  

---

# 22. Monte Carlo Stress Bounds (Theoretical)

Expected rounds until honest proposer:

```
E[rounds] = 1 / (honest_stake_fraction)
```

Worst-case commit latency:

```
T_commit ≈ R * (T_propose + T_prevote + T_precommit)
```

Where R is the rounds before an honest leader.

---

# 23. Deterministic Guarantees

Consensus must be:

- Deterministic  
- Fully reproducible  
- Version-controlled  
- Governed by upgrade rules (see UPGRADES.md)  

State transitions are validated by KVM → consensus never accepts nondeterministic execution.

---

# 24. Summary

The Kuber Consensus Engine ensures:

- **Instant finality** (no reorgs)  
- **Strong safety** (<1/3 malicious validators cannot break it)  
- **Stake-weight fairness**  
- **Predictable proposer rotation**  
- **Deterministic state machine**  
- **Efficient message propagation**  
- **Governance-controlled upgrades**  

This consensus layer is the foundation of Kuber’s secure, scalable, and predictable execution environment.

---
