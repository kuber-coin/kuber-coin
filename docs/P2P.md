# KUBER P2P SPECIFICATION (P2P.md)
### Peer Networking, Message Protocols, Sync Logic, and Transport-Level Rules

---

# 1. Overview

The Kuber P2P layer enables nodes to:

- Discover peers  
- Exchange blocks  
- Propagate votes  
- Sync state  
- Detect faults  
- Maintain network health  

Kuber's P2P network is designed for:
- Deterministic message behavior  
- Low-latency block propagation  
- Byzantine-resilient communication  
- Minimal bandwidth overhead  

The P2P layer is modular and future-proof, supporting WebSockets, QUIC, TCP, or custom transports.

---

# 2. P2P Architecture

Kuber P2P is structured into:

```
+-----------------------------+
|    Session Manager          |
+-----------------------------+
|    Peer Store               |
+-----------------------------+
|    Gossip Engine            |
+-----------------------------+
|    Message Router           |
+-----------------------------+
|    Transport Layer          |
+-----------------------------+
```

Each layer is independently replaceable.

---

# 3. Transport Layer

### Supported:
- TCP (default)
- QUIC (future)
- WebSocket (for light clients)

### Requirements:
- Bi-directional streaming
- Configurable max frame size
- TLS or Noise Protocol encryption (future)

Transport MUST guarantee:
- ordered delivery per stream  
- no silent truncation  
- connection liveness  
- replay protection  

---

# 4. Peer Identity

Each peer is identified by:

```
PeerID = H(public_key)
```

A peer record includes:

```
PeerRecord {
    peer_id: PeerID,
    address: ip:port,
    public_key: bytes,
    latest_height: uint64,
    score: float,
    flags: bitmask
}
```

---

# 5. Peer Discovery

Three peer-discovery mechanisms:

1. **Static Peers**  
   Hardcoded or configured list.

2. **Seed Nodes**  
   Bootstraps new peers.

3. **Peer Gossip**  
   Nodes exchange lists of known peers.

Peer discovery message:

```
PeerListMessage {
    peers: [PeerRecord]
}
```

---

# 6. Handshake Protocol

Before communication begins:

```
Node A → Node B: HelloMessage
Node B → Node A: HelloAckMessage
```

### 6.1 HelloMessage

```
HelloMessage {
    node_id: PeerID,
    protocol_version: uint16,
    chain_id: string,
    latest_height: uint64,
    capabilities: bitmask,
    timestamp: uint64
}
```

### 6.2 HelloAckMessage

```
HelloAckMessage {
    status: "OK" |
            "VERSION_MISMATCH" |
            "CHAIN_ID_MISMATCH"
}
```

Connection is terminated if handshake fails.

---

# 7. Message Types

All P2P messages use protobuf or msgpack.  
Messages MUST contain:

```
Message {
    type: uint8,
    payload: bytes
}
```

---

## 7.1 BlockMessage

```
BlockMessage {
    block: Block
}
```

Used to propagate new blocks.

---

## 7.2 BlockRequest

```
BlockRequest {
    height: uint64
}
```

---

## 7.3 BlockResponse

```
BlockResponse {
    block: Block
}
```

---

## 7.4 VoteMessage

Used for consensus voting.

```
VoteMessage {
    height: uint64,
    round: uint64,
    vote_type: uint8,
    voter: PeerID,
    signature: bytes
}
```

---

## 7.5 StateSyncRequest

```
StateSyncRequest {
    state_root: bytes
}
```

---

## 7.6 StateSyncChunk

```
StateSyncChunk {
    chunk_id: uint32,
    total_chunks: uint32,
    data: bytes
}
```

---

## 7.7 Ping / Pong

```
Ping { nonce: uint64 }
Pong { nonce: uint64 }
```

Used to check liveness.

---

# 8. Gossip Engine

Kuber uses a **gossip-based propagation model** for:

- blocks  
- votes  
- peer lists  

### Gossip propagation rule:

```
Broadcast(msg):
    for peer in peers:
        if score(peer) ≥ threshold:
            send(peer, msg)
```

Peers below threshold are quarantined.

---

# 9. Peer Scoring Model

Peers receive a score ∈ [0, 100].

Score increases for:
- valid block propagation  
- uptime  
- fast responses  
- honest behavior  

Score decreases for:
- invalid messages  
- slow responses  
- failing handshakes  
- sending malformed blocks  
- byzantine behavior  

Formal peer scoring:

```
score = base_score + α(valid_msgs) − β(invalid_msgs)
score ∈ [0, 100]
```

Thresholds:

```
BanThreshold = 10
GreylistThreshold = 25
TrustedThreshold = 80
```

Nodes with score < 10 are disconnected immediately.

---

# 10. Block Propagation

When a new block is created:

```
Proposer → Gossip: BlockMessage
Peers → Validate(block)
If valid → Gossip to others
```

Nodes MUST not propagate invalid blocks.

Propagation delay target:

```
T_prop ≤ 200 ms
```

---

# 11. State Sync

New nodes sync state using:

```
StateSyncRequest → StateSyncChunks → ApplySnapshot
```

State is divided into chunks:

```
chunk_size = configurable (default: 16 KB)
```

Chaining:

```
ChunkID ∈ [0 ... total_chunks−1]
```

Nodes MUST verify chunk hashes.

---

# 12. Mempool P2P

Mempool transactions are propagated via:

```
TXMessage {
    tx_hash: bytes,
    tx_bytes: bytes
}
```

Nodes MUST:

- reject already-seen TX  
- reject invalid TX  
- forward valid TX  

DoS protection here is critical.

---

# 13. Anti-DoS Rules

### Rule 1: Message Rate Limit

```
max_messages_per_sec = 200
```

### Rule 2: Block Flood Protection

If peer sends ≥ 2 invalid blocks:

```
score(peer) = 0
disconnect(peer)
```

### Rule 3: TX Flood Protection

If TX spam detected:

```
drop_messages(tx) 
penalize(peer)
```

### Rule 4: Oversized Message Protection

```
max_message_size = 2 MB
```

Peers sending larger frames → banned.

---

# 14. Time Synchronization Rules

Nodes must not rely on system clock for consensus,  
but P2P timestamps are validated:

```
abs(local_time − peer_time) ≤ 10s
```

Otherwise peer gets penalized.

---

# 15. Connection Lifecycle

```
CONNECT → HANDSHAKE → ACTIVE → SYNC → GOSSIP → IDLE → DISCONNECT
```

### Conditions for disconnect:
- score < BanThreshold  
- invalid handshake  
- protocol version mismatch  
- message integrity failures  
- duplicate block spam  
- non-responsive for > 30s  

---

# 16. Cryptographic Integrity

All messages MUST be hashed:

```
msg_hash = H(type || payload)
```

Future upgrade will include:

- Noise protocol encryption  
- Authenticated message envelopes  
- Peer signature verification  

---

# 17. Node Identity Security

Nodes MUST NOT accept:

- multiple connections from same PeerID  
- peers with invalid public keys  
- peers sending malformed IDs  

Identity collision resistance:

```
PeerID = H(pk)
```

---

# 18. High-Level Network Diagram

```
                  +--------------------+
                  |      Node A        |
                  +--------------------+
                    /       |        \
                   /        |         \
        BlockMsg  v         v          v   VoteMsg
            +------------+  +------------+  +------------+
            |   Node B   |  |   Node C   |  |   Node D   |
            +------------+  +------------+  +------------+
                   ^          \        /
                   |           \      /
                 ChunkMsg        \    /
                                  v  v
                           +------------+
                           |   Node E   |
                           +------------+
```

---

# 19. P2P RPC (Debug Interface)

These endpoints allow limited debugging via RPC.

### `/p2p/peers`
Returns list of peers.

### `/p2p/stats`
Returns peer scores, message counts, and errors.

### `/p2p/info`
Returns node identity & handshake state.

These endpoints MUST NOT modify state.

---

# 20. Future Extensions

- QUIC transport  
- LibP2P support  
- GossipSub v2  
- Encrypted peer channels  
- Fast Sync (state diffing)  
- Distributed minting networks  

---

# 21. Conclusion

Kuber P2P is designed to be:

- Highly secure  
- Deterministic  
- Efficient in bandwidth  
- Resistant to DoS & Byzantine faults  
- Modular in transport and gossip design  
- Scalable to thousands of validators  

This specification ensures consistent, reliable networking across all Kuber Core node implementations.

---
