# KUBER NETWORK DIAGRAMS  
### ASCII diagrams + concise explanations for architecture, flows, deployment, and operations

---

## 1. High-level System Overview
Shows major planes and how they relate.

```
+-----------------------------------------------------------+
|                       Kuber Ecosystem                     |
|                                                           |
|  [Wallet Layer] --> [Mint Engine] --> [K-Chain] --> [KDL] |
|        ↑                ↑            ↑         ↑          |
|        |                |            |         |          |
|   Clients/UX         Integrations  Validators  Storage    |
+-----------------------------------------------------------+
```

**Explanation:** Wallets create signed TXs; Mint Engine generates MintProofs and submits TXs; K-Chain orders and executes; KDL persists state and serves proofs.

---

## 2. Component Interaction (Detailed)
Shows data and control flow between components.

```
User Wallet
   |
   | signed TX / mint request
   v
+----------------+        +----------------+        +-----------------+
| Wallet Layer   | -----> | Mint Engine    | -----> | Kuber Core (K-Chain) |
| (KWL)          | <----  | (KME)          | <----  | Execution (KVM)  |
+----------------+        +----------------+        +-----------------+
                                |                         |
                                v                         v
                            Off-chain DB               Data Layer (KDL)
                            (metadata)                (Merkle store)
```

**Explanation:** Wallets and Mint Engine are primarily clients of K-Chain. Mint Engine can batch and parallelize minting, commit proofs to the chain; K-Chain validates via KVM and records to KDL.

---

## 3. P2P Topology (Validator Mesh)
Represents peer-to-peer message propagation among validators and full nodes.

```
                +---------+      +---------+
             /--| Node A  |------| Node B  |--\
            /   +---------+      +---------+   \
           /         \                /         \
+---------+           \              /           +---------+
| Seed 1  |            +------------+            | Seed 2  |
+---------+            |  Gossip    |            +---------+
           \            |  Overlay   |           /
            \   +---------+      +---------+    /
             \--| Node C  |------| Node D  |---/
                +---------+      +---------+
```

**Explanation:** Gossip overlay with seed nodes for bootstrapping. Validators form a mesh where blocks, votes, and chunk requests propagate via gossip with peer scoring and rate limits.

---

## 4. Block Proposal & Commit Flow
Shows proposer → prevote → precommit → commit sequence.

```
Proposer ---(Proposal)--> Validators
   |                          |
   | <--- Prevotes (≥2/3) --- |
   |                          |
   | <--- Precommits (≥2/3) --|
   v
Commit -> Broadcast committed block
```

**Explanation:** Deterministic rounds; locks occur on ≥2/3 prevotes; commit on ≥2/3 precommits. Finality is instant at commit.

---

## 5. Minting Flow (Batch + Proof)
How KME batches metadata, computes proofs, and commits.

```
Metadata Source(s) --> [KME Batch Pool] --> [MintID generator (H)] --> MintProof
                                                         |
                                                         v
                                               Submit TX(payload=MintProof)
                                                         |
                                                         v
                                              K-Chain receives TX -> KVM VERIFY_MINT_PROOF
                                                         |
                                               On success -> SSTORE MintRecord -> Events
```

**Explanation:** Mint heavy lifting off-chain; deterministic mint IDs and proofs reduce on-chain cost; chain verifies and stores commitments.

---

## 6. Wallet — Transaction Lifecycle
Wallet builds, signs, broadcasts; chain executes.

```
[User] -> Wallet UI -> Build TX -> Sign with SK -> RPC / P2P -> Mempool -> Consensus -> Execution -> Receipt -> Wallet monitors events
```

**Explanation:** Wallets interact by RPC to nodes or indirectly via relays. Receipts and logs are used to show mint/tx success.

---

## 7. State Sync Dataflow
New node bootstrap via snapshots & chunks.

```
New Node
   |
   v
Peer Discovery -> Ask for Snapshots -> Download SnapshotMetadata
   |
   v
Parallel Chunk Requests -> Receive Chunks + MerkleProofs
   |
   v
Verify All Chunks -> Reconstruct StateRoot -> Apply Snapshot -> Switch to Block Sync
```

**Explanation:** Merkle-verified, chunked snapshots speed node bootstrap while ensuring integrity; validators must serve correct chunks or face slashing.

---

## 8. P2P Message Types (Overlay)
Quick reference of message flows.

```
[Peer] --> [Peer]: Hello / Handshake
[Peer] <--> [Peer]: PeerList (discovery)
[Peer] --> [Peer]: BlockMessage (propagate)
[Peer] --> [Peer]: VoteMessage (prevote/precommit)
[Peer] --> [Peer]: TXMessage (mempool tx)
[Peer] --> [Peer]: ChunkRequest / ChunkResponse
[Peer] --> [Peer]: Ping / Pong (liveness)
```

**Explanation:** Messages encoded in protobuf; signed where required; rate-limited with scoring enforcement.

---

## 9. Deployment Topology (Dev vs Prod)
Shows how services map to containers/nodes.

```
Local Dev (docker-compose):
[dev machine]
  ├─ kuber-chain (container)
  ├─ kuber-nft-mint (container)
  └─ kuber-wallet-ui (container)

Production (Kubernetes):
[Cluster]
  ├─ k-chain-deployment (3-5 replicas) - Validators (statefulset)
  ├─ kme-deployment (autoscale)        - Mint Engine (stateless)
  ├─ wallet-ui (ingress + CDN)         - Frontend
  ├─ storage (db/rocks/badger)         - PersistentVolume
  └─ monitoring/logging (prom, grafana, loki)
```

**Explanation:** Dev uses docker-compose; prod deploys validators as statefulsets, KME stateless microservices, storage on durable volumes.

---

## 10. Monitoring & Observability
How metrics and alerts flow.

```
Nodes -> Prometheus exporters -> Prometheus -> Alertmanager -> Slack/Pages
           |
           v
        Grafana dashboards
```

**Key metrics:** block time, mempool size, peer scores, TPS, KVM cost per tx, snapshot availability, validator health.

---

## 11. Security Perimeter Diagram
Network boundaries and protections.

```
[Internet]
   |
   v
[Load Balancer / CDN]  <- public UI
   |
   v
[API Gateways / Relays] <-- rate limiting, auth
   |
   v
[Validator Mesh] <-- firewall rules, TLS/Noise
   |
   v
[Storage / Vault] <-- HSM, restricted VPC
```

**Explanation:** Public endpoints protected by rate-limiting; validators run in trusted zones with HSM for keys; storage isolated.

---

## 12. Failure & Recovery Patterns
Illustrates fallback behavior.

```
Case: Proposer fails
  -> Timeouts trigger next round
  -> New proposer selected deterministically
  -> Consensus proceeds

Case: Peer sends invalid block
  -> Peer score decreases, may be greylisted/banned
  -> Slashing evidence created if validator

Case: Node falls behind
  -> State Sync (snapshot) takeover -> block sync resumes
```

**Explanation:** Deterministic timeouts and proposer rotation ensure liveness; scoring and slashing enforce honesty.

---

## 13. Optimizations & Scaling Patterns
Horizontal scaling for heavy components.

```
Mint Engine:
  - Batch workers (N) -> each compute mint proofs in parallel
  - Queue (Redis/Kafka) for high-throughput

Wallet UI:
  - CDN + edge caching
  - Rate-limited RPC relays

Validators:
  - Sharding (future) or AppChains per tenant
  - Aggregated signatures (future) to reduce bandwidth
```

**Explanation:** Separate concerns to scale independently — KME scales horizontally; validators scale by stake and number of nodes (MaxValidators).

---

## 14. ASCII "All-in-One" Full Flow
Compressed end-to-end flow showing interactions.

```
User -> Wallet -> (build/sign) -> RPC -> Node Mempool -> Consensus(Proposer -> Prevote -> Precommit) -> Commit -> StateRoot -> KDL persist
  ^                                                                                                         |
  |                                                                                                         v
  +---------------------------------- Events / Logs / Receipts --------------------------------------------+
                         Mint Engine (batch) -> MintProof -> RPC -> Mempool -> Consensus -> Commit
```

**Explanation:** Inclusive flow showing both standard transactions and mint engine interactions with the same commit path and persistence.

---

## 15. Diagram Legend & Notation
- `-->` : request / one-way message  
- `<-->` : two-way / handshake  
- `|` and `v` : vertical flow  
- `[]` : component / service  
- `()` : operation / action  
- Brackets stacked indicate components within same host/cluster.

---

## 16. How to Use These Diagrams
- Paste into `docs/NETWORK-DIAGRAMS.md` for repo viewers.
- Use ASCII as quick reference in architecture docs and slides.
- Convert ASCII to graphic diagrams (draw.io / Lucidchart) for presentations.
- Keep diagrams updated as topology and scale change.

---

If you want, I can:
- Generate PNG/SVG exports from these ASCII diagrams.
- Create a presentation-ready diagram pack (draw.io XML).
- Produce a simplified one-page architecture infographic for grant applications.

Tell me which format you want next.
