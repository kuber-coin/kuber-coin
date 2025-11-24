# KUBER VALIDATOR SET SPECIFICATION  
### Dynamic Set Management, Election, Rotation, Activation, and Removal Rules

---

# 1. Overview

This document defines the **Validator Set** in the Kuber protocol:

- How validators enter the active set  
- How they are selected, rotated, and prioritized  
- How exits and removals occur  
- How stake updates affect validator power  
- How the protocol ensures decentralization and liveness  

The validator set is the backbone of consensus and network security.

---

# 2. Validator Set Definition

The validator set **V** at block height **t** is:

```
Vᵗ = { v₁, v₂, …, vₙ }
```

Each validator has:

```
stake(vᵢ)
power(vᵢ)
status(vᵢ)
```

### Status Types:
```
ACTIVE        — participates in consensus
INACTIVE      — registered but not in active set
JAILED        — slashed/penalized, temporarily removed
PENDING       — waiting for activation window
EJECTED       — permanently removed
```

---

# 3. Minimum Requirements

Validators MUST satisfy:

```
Minimum stake ≥ 10,000 KUB
Synchronized node
Valid consensus key
No conflicting validator instance
```

Validators failing requirements enter **INACTIVE** or **JAILED** state.

---

# 4. Validator Activation

Activation is executed at **epoch boundaries**.

Epoch length:

```
EpochLength = 1,000 blocks
```

Validators who register during epoch *E* become active at epoch *E+1*, assuming:

```
stake ≥ minimum
no slash pending
node responds to challenge during handshake
```

Activation procedure:

```
join_tx → validation → pending → epoch boundary → active
```

If multiple validators join simultaneously, they enter according to stake priority.

---

# 5. Validator Set Size Constraints

The **active validator set size** is defined by:

```
MaxValidators = 100 (default)
```

If more than 100 validators apply:

- top `MaxValidators` by stake form the Active Set  
- others remain INACTIVE but eligible for rotation  

---

# 6. Staking Power Calculation

Validator weight:

```
power(vᵢ) = stake(vᵢ) / Σ stake(vⱼ)
```

Power updates occur:

- at epoch boundaries  
- when stake increases (instant)  
- when stake decreases (delayed due to unbonding)

---

# 7. Unbonding / Withdrawal Rules

Validators who choose to exit must initiate:

```
unbond_tx
```

This triggers:

```
UnbondStartHeight = current_height
UnbondingPeriod = 21 days (configurable)
```

During unbonding:
- validator is marked PENDING_EXIT  
- cannot propose blocks  
- cannot vote  
- stake is locked  

After unbonding period:
```
status = INACTIVE
stake unlocked
```

---

# 8. Automatic Rotation

If Active Set > MaxValidators, Kuber uses **stake-weighted rotation**.

Rotation rule:

Every epoch, compute:

```
NextActiveSet = top MaxValidators by stake
```

Validators dropping below the cutoff:
```
ACTIVE → INACTIVE
```

Validators rising above the cutoff:
```
INACTIVE → ACTIVE
```

This ensures:
- decentralization  
- economic fairness  
- stake-driven influence  

---

# 9. Liveness Tracking

Validators must maintain:

```
≥ 90% vote participation per epoch
```

If a validator misses too many votes:

```
MissedVotes > 10% → LivenessPenalty
MissedVotes > 30% → Slashing & Jailing
```

If jailed:
- removed from active set  
- must serve jail time  
- must submit unjail_tx  

---

# 10. Handling Downtime

If a validator goes offline:

```
After 50 consecutive missed blocks → status: JAILED
After jail time → must unjail
```

Downtime penalties:

- loss of rewards  
- potential stake slashing  
- loss of active status  

---

# 11. Slashing Integration

Slashing events modify validator set:

### Double Sign:
```
Slash 10%
JAILED
ACTIVE → JAILED → INACTIVE
```

### Invalid Proposal:
```
Slash 5%
ACTIVE → JAILED
```

### Consensus Manipulation:
```
Slash 10–20%
ACTIVE → EJECTED
```

Ejected validators may NOT rejoin unless governance approves.

---

# 12. Validator Replacement Logic

When a validator is removed:

```
removed_v = vᵢ
replacement = next highest stake validator
ACTIVE → removed
INACTIVE → promoted
```

Replacement is deterministic:

```
Replacement = argmax(stake) among INACTIVE set
```

---

# 13. Validator Priority (Proposer Selection)

Block proposer selection uses:

```
Leader(t) = H(t || previous_hash) mod |VActive|
```

Each validator’s chance of proposing:

```
Prob(proposer=vᵢ) = power(vᵢ)
```

This ensures:
- fair selection  
- deterministic rotation  
- stake-weighted priority  

---

# 14. Validator Metadata

Each validator stores metadata in-chain:

```
Validator {
  validator_id
  public_key
  stake
  status
  join_height
  unbonding_end
  jailed_until
}
```

Metadata must remain deterministic and verifiable.

---

# 15. Edge Cases

### **Case: Rapid Stake Increase**
Validator becomes active next epoch.

### **Case: Validator Loses Stake (slashing)**
Power reduces immediately; status updated at next epoch.

### **Case: Validator Restaking**
Stake increase is immediate; promotion occurs at next epoch.

### **Case: Conflicting Validator Key**
Connection rejected; governance or slash required.

---

# 16. Validator Set RPC

### `validator.getSet()`
Returns active validator set.

### `validator.getStatus(address)`
Returns validator’s status.

### `validator.listPending()`
Validators waiting for activation.

### `validator.slash(address, reason)`
Internal RPC for governance execution.

### `validator.unbond()`
Initiates unbonding.

All RPC must be deterministic and state-based.

---

# 17. Security Guarantees

Validator Set design ensures:

- Byzantine fault tolerance  
- Economic fairness  
- Stake-driven security  
- Predictable validator turnover  
- Protection against cartel formation  
- Protection against inactive validators  
- Dynamic adjustment to ecosystem growth  

The protocol maintains:

```
Safety  : Byzantine Power < 1/3
Liveness: Honest nodes > 2/3 follow protocol
```

If validator set breaks decentralization thresholds, governance triggers **Validator Set Review Proposal**.

---

# 18. Future Extensions

- Distributed key generation (DKG) for validator keys  
- Threshold signature aggregation  
- Multi-geo validator clusters  
- Validator performance scoring  
- Dynamic validator set size scaling  

---

# 19. Summary

The validator set is dynamically managed to ensure:

- decentralization  
- economic security  
- deterministic execution  
- high network uptime  
- predictable rotation  
- punishment of malicious actors  

These rules govern the lifecycle of validators, ensuring Kuber’s long-term stability and trustlessness.

---
