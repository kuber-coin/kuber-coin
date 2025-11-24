# KUBER VALIDATOR RULES  
### Validator Duties, Slashing, Rewards, Consensus Behavior & Network Conduct

---

# 1. Overview

Validators secure the Kuber network by:

- Producing blocks  
- Verifying blocks  
- Participating in consensus  
- Propagating messages honestly  
- Maintaining uptime  
- Executing governance decisions  
- Enforcing deterministic protocol rules  

The purpose of this document is to define:

- Validator eligibility  
- Staking requirements  
- Reward calculation  
- Slashing conditions  
- Expected behavior  
- Consensus rules  
- Networking obligations  
- Governance obligations  

These rules must be followed by ALL validators.

---

# 2. Becoming a Validator

To become a validator:

### Requirements:
```
Minimum Stake   = 10,000 KUB
Hardware        = Deterministic, stable server
Network         = ≥ 10 Mbps, low-latency public endpoint
Node Version    = Latest approved Kuber Core release
```

### Registration Process:
1. Generate validator keypair  
2. Bond stake (`stake_amount ≥ minimum`)  
3. Broadcast `validator_join` transaction  
4. Wait for activation height  

Validators must only run **one instance per validator key**.

---

# 3. Validator Keys

Validator identity is defined as:

```
validator_id = H(public_key)
```

### Keys must:
- Be unique  
- Not be shared across nodes  
- Be stored securely (HSM recommended)  
- Never be reused after a slash event  

Compromised keys must be rotated via governance or emergency rotation process.

---

# 4. Validator Responsibilities

Validators MUST:

### 1. **Sign votes**
- All consensus rounds  
- Pre-votes, pre-commits, commit votes  

### 2. **Propose blocks**
When selected as proposer:
- Build block  
- Order transactions deterministically  
- Include required metadata  
- Respect block size limits  

### 3. **Validate blocks**
All proposed blocks must be validated:
- hash integrity  
- correct state transitions  
- valid signatures  
- valid KVM execution  

### 4. **Maintain uptime**
Minimum required uptime:
```
Uptime ≥ 90% (per epoch)
```

### 5. **Follow governance decisions**
Validators MUST implement:
- protocol upgrades  
- parameter updates  
- slashing rules  

### 6. **Stay synchronized**
Nodes must remain within:
```
max_lag ≤ 5 blocks
```

---

# 5. Rewards

Validator rewards are paid per-block + per-epoch.

### 5.1 Voting Rewards
```
reward_vote(i) = P(i) × epoch_reward_pool
```

### 5.2 Block Proposal Rewards
When validator `vᵢ` proposes a block:

```
reward_propose(i) = base_block_reward
```

### 5.3 Staking Rewards
Proportional to stake:

```
Rewardᵢ = stakeᵢ / total_stake × R(t)
```

Where:

```
R(t) = α × e^(−βt)
```

(exponentially decaying inflation)

### 5.4 Mint Engine Rewards
Validators receive a portion of:
- mint fees  
- MintProof gas fees  
- metadata verification fees (future)  

---

# 6. Slashing Conditions

Slashing protects against harmful validator behavior.

Slashing coefficient:

```
S_slash ∈ (0, 0.20]
```

### Validators are slashed for:

#### **1. Double signing**
Signing two blocks at the same height.
```
Slash = 10% of stake
Jail = 7 days
```

#### **2. Downtime**
Missing > 30% of votes in an epoch.
```
Slash = 1% of stake
Jail = 24 hours
```

#### **3. Invalid block proposal**
Proposing a block with:
- invalid state root  
- malformed transactions  
- incorrect signatures  
- nondeterministic execution  

```
Slash = 5% of stake
Jail = 3 days
```

#### **4. Consensus manipulation**
Including:
- vote equivocation  
- delaying votes  
- censorship  
- manipulating rounds  

```
Slash = 10–20%
Jail = governance-defined
```

#### **5. Networking abuse**
DoS behavior:
- flooding peers  
- broadcasting invalid messages  
- corrupting block gossip  

```
Slash = 2%
Quarantine = 48 hours
```

---

# 7. Jailing Rules

Jail removes a validator from active set.

### While jailed, the validator:
- earns no rewards  
- loses voting power  
- cannot participate in governance  

Unjail process:
```
unjail_tx + governance approval if required
```

Validators must review misbehavior before rejoining.

---

# 8. Consensus Rules for Validators

Validators must follow the consensus algorithm exactly:

### Voting Requirements:
- One vote per round  
- No equivocation  
- Signed using validator key  
- Broadcast within allowed time window  

### Proposer Rules:
If you are the proposer:
- Select transactions deterministically  
- No censorship  
- No preferential ordering for bribes  
- Block must contain correct previous_hash  

### Block Validity Rules:

A block is valid iff:

```
1. Header hash correct
2. State root matches execution
3. All TX signatures valid
4. All KVM executions deterministic
5. Block size ≤ MaxBlockSize
6. Chain ID consistent
7. Proposer signature valid
```

Validators **must not** sign invalid blocks.

---

# 9. Peer-to-Peer Conduct

Validators MUST follow `P2P.md` rules.

Key networking duties:

### 1. Propagate messages honestly  
BlockMessage, VoteMessage, PeerListMessage.

### 2. Avoid connection flooding  
Max connections = config-limited.

### 3. Gossip integrity  
Do not halt or exaggerate gossip flows.

### 4. Maintain peer score ≥ 25  
Below 25 → greylisted.

### 5. Reject malformed messages  
Mandatory disconnect.

---

# 10. Synchronization Rules

Validators must maintain:

```
clock-drift ≤ 10 seconds
block-lag ≤ 5 blocks
```

Nodes outside sync MAY be jailed.

---

# 11. Governance Responsibilities

Validators play critical role in governance.

### Validators MUST:
- Vote on proposals  
- Enforce upgrade heights  
- Apply protocol forks  
- Protect against malicious proposals  
- Ensure chain continuity  

### Weighted governance participation:
```
G(i) = stake(i) / total_stake
```

Validators ignoring governance for multiple epochs MAY be penalized.

---

# 12. Performance Requirements

### Minimum:
- CPU: 4 cores  
- RAM: 8GB  
- Disk: SSD  
- Network: 10+ Mbps  

### Recommended:
- CPU: 8+ cores  
- RAM: 16GB+  
- NVMe  
- Redundant node setup (failover)  

---

# 13. Validator Best Practices

Validators are strongly advised to:

- Run 24/7 monitored infrastructure  
- Use firewall + DDOS mitigation  
- Keep nodes updated  
- Use HSM for keys  
- Maintain log monitoring  
- Keep redundant peers  

---

# 14. Validator Misconduct Classification

### Minor Misconduct
- slow block propagation  
- short downtime  
- invalid gossip messages  

Penalty: warning → small slash

### Major Misconduct
- double signing  
- malicious block proposal  
- denial-of-service behavior  

Penalty: heavy slash → jailing

### Critical Misconduct
- consensus sabotage  
- fork manipulation  
- bribery/censorship attacks  

Penalty:
```
Slash up to 20%
Governance removal
Permanent ban recommended
```

---

# 15. Emergency Response

During major network failures:

Validators must:

1. Enter **Emergency Voting Mode**  
2. Sign emergency proposals  
3. Participate in system recovery  
4. Enforce emergency forks  
5. Follow governance-approved validators for chain continuity  

Emergency threshold:

```
≥ 50% validator voting power
```

---

# 16. Fork Choice Rule

Validators follow the **highest-valid-weight chain**.

Chain validity requires:

- correct consensus steps  
- correct blocks  
- no invalid state transitions  

In case of competing forks:

1. discard invalid-fork  
2. follow chain with most stake-weighted signatures  

---

# 17. Removal From Validator Set

A validator may be removed if:

- stake drops below minimum  
- repeated slashing  
- ≥ 2 critical offenses  
- >50% governance votes to remove  

Removed validators must re-register and re-stake to participate again.

---

# 18. Conclusion

Validators maintain the security, correctness, and decentralization of the Kuber protocol.  
Following these rules ensures:

- stable consensus  
- high network integrity  
- predictable economic incentives  
- safe governance  
- correct execution of the KVM and chain state  

This document defines the expected behavior and responsibilities for every validator in the Kuber ecosystem.

---
