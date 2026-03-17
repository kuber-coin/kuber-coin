# Formal Specifications

This directory contains TLA+ formal specifications of KuberCoin's consensus
protocol.

## Files

| File | Description |
|------|-------------|
| `consensus.tla` | Nakamoto-style Proof-of-Work consensus safety model |
| `consensus.cfg` | TLC model checker configuration |

## Running the Model Checker

Install [TLA+ Toolbox](https://lamport.azurewebsites.net/tla/toolbox.html) or
use the TLC command-line tool:

```bash
# Download TLC jar
curl -LO https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar

# Run model checking
java -jar tla2tools.jar consensus.tla -config consensus.cfg
```

Expected: `Model checking completed. No error has been found.`

## Safety Properties Verified

| Property | Description |
|----------|-------------|
| `TypeOK` | All variables have correct types |
| `ChainGrowth` | Honest nodes' chain tips are non-negative and never decrease |
| `CommonPrefix(Δ+1)` | All honest nodes agree on all blocks except the last Δ+1 from each tip |

## Implementation Mapping

| TLA+ Element | Rust Implementation |
|--------------|---------------------|
| `MineBlock(n)` | `core/mining/miner/src/miner.rs` — SHA-256d PoW nonce search |
| `ReceiveBlock(n, h)` | `core/node/src/state.rs::add_block_with_cache` — block acceptance + reorg |
| `CommonPrefix(k)` | Fork-choice via cumulative work in `state.rs`; reorg via `reorg_handler.rs` |
| `Delta` | Network propagation delay (modelled; actual bound from testnet obs.) |

## Extending the Specification

To add adversarial nodes (Byzantine tolerance analysis):

```tla
CONSTANTS
    HonestNodes,   \* Subset of Nodes that follow the protocol
    FaultyNodes    \* Subset that may deviate
ASSUME HonestNodes \intersect FaultyNodes = {}
ASSUME HonestNodes \union FaultyNodes = Nodes
```

Then parameterise `MineBlock` to be available only for `HonestNodes`, and
add adversarial actions for `FaultyNodes` (private chain extension, selfish
mining, eclipse attacks).

## References

- [The Bitcoin Backbone Protocol — Garay, Kiayias, Leonardos (2015)](https://eprint.iacr.org/2014/765.pdf)
- [TLA+ Home Page — Lamport](https://lamport.azurewebsites.net/tla/tla.html)
- [Ethereum Gasper TLA+ model](https://github.com/ethereum/consensus-specs)
- [KuberCoin ROADMAP_BITCOIN_GRADE.md](../docs/ROADMAP_BITCOIN_GRADE.md)
