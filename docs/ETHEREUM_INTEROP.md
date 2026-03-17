# Ethereum Interoperability

KuberCoin shares foundational cryptographic primitives with Ethereum:
**secp256k1** elliptic curve, **SHA-256** hash locks (used in HTLC contracts),
and **BIP-39/BIP-32** key derivation compatible with Ethereum hardware wallets.
This document catalogues the current interoperability surface and the roadmap
for deeper integration.

## Shared Cryptographic Primitives

| Primitive | KuberCoin | Ethereum | Status |
|-----------|-----------|----------|--------|
| Elliptic curve | secp256k1 | secp256k1 | ✅ Same curve |
| Signature scheme | ECDSA | ECDSA (+ EIP-2098 compact sigs) | ✅ Same scheme |
| HD key derivation | BIP-32/BIP-39/BIP-44 | BIP-32/BIP-39/BIP-44 (coin type 60) | ✅ Same path structure |
| SHA-256 hash locks | HTLCs in P2WSH + Lightning | Solidity `sha256()` in HTLC contracts | ✅ Direct interop |
| Taproot tweaks | BIP-341 | — (EVM is account-model) | KuberCoin-only |
| Keccak-256 | Not in consensus | EVM hash; address derivation | ✅ Via `kubercoin-eip-signing` |

## EIP-191 / EIP-712 Signing (`kubercoin-eip-signing`)

The `core/services/eip_signing` crate implements Ethereum-compatible signing
on top of the same secp256k1 keys used for KuberCoin transactions:

### EIP-191 Personal Sign

`personal_sign_hash(message)` produces the Keccak-256 hash of
`"\x19Ethereum Signed Message:\n{len}{message}"` — the exact format used by
MetaMask, Ethers.js, and Ethereum hardware wallets.

**Use case**: prove ownership of a KuberCoin address to an Ethereum dApp or
smart contract gate without any on-chain transaction.

```rust
use kubercoin_eip_signing::eip191::personal_sign_hash;

let msg = b"I control KBC address kb1qxyz...";
let hash = personal_sign_hash(msg)?;
// Sign hash with KuberCoin wallet's secp256k1 key
// → Ethereum-verifiable proof of KBC address ownership
```

### EIP-712 Typed Data

`encode_typed_data(data)` produces the final `Keccak256("\x19\x01" ||
domainSeparator || structHash)` digest — exactly what `ecrecover` in a
Solidity contract expects.

**Use case**: sign cross-chain atomic swap authorisations that can be
verified by the `KuberCoinHTLC` Solidity contract (see [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md)).

### Ethereum Address Derivation

`eth_address_from_pubkey(pubkey)` derives the 20-byte Ethereum address
(Keccak-256 of uncompressed pubkey, last 20 bytes) with EIP-55 checksum.

A KuberCoin wallet's secp256k1 key therefore controls:
- On KuberCoin: a `kb1...` (bech32) or `K...` (P2PKH) address.
- On Ethereum: the corresponding `0xABCD...` address.
- Both derivable from the same BIP-39 seed phrase.

## Ethereum HD Derivation Path

KuberCoin wallets can generate Ethereum-compatible keys with the standard
BIP-44 Ethereum coin type:

```
m/44'/60'/0'/0/n     ← Ethereum (coin type 60)
m/44'/0'/0'/0/n      ← KuberCoin (coin type 0, Bitcoin-style)
```

Both are derived from the same BIP-39 master seed and are accepted by
Ledger, Trezor, and MetaMask using their standard import flows.

**Planned RPC addition** (`getnewaddress` with `"type": "ethereum"`):

```json
POST /rpc
{ "method": "getnewaddress", "params": { "type": "ethereum", "index": 0 } }
```

Returns:
```json
{
  "kbc_address":  "kb1q...",
  "eth_address":  "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
  "derivation":   "m/44'/60'/0'/0/0"
}
```

Same private key; dual-chain control from a single seed.

## Cross-Chain Atomic Swaps

KuberCoin supports trustless atomic swaps with Ethereum via SHA-256
Hash Time-Locked Contracts (HTLCs).  Full specification: [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md).

Key protocol summary:
- Alice locks ETH in the `KuberCoinHTLC` Solidity contract with a SHA-256 hashlock.
- Bob locks KBC in a P2WSH script with the same hashlock.
- Alice claims KBC by revealing the pre-image; Bob reads it from the KuberCoin chain and claims ETH.
- No trusted intermediary; no bridge contract; no shared validator set.

## Formal Consensus Verification

KuberCoin's Nakamoto-style PoW consensus is formally specified in TLA+ at
[`specs/consensus.tla`](../specs/consensus.tla), with properties:

- `TypeOK` — type correctness of all state variables.
- `ChainGrowth` — honest nodes' tips never decrease.
- `CommonPrefix(Δ+1)` — all honest nodes agree on all blocks except the last
  Δ+1 from each tip (the Bitcoin Backbone Protocol common-prefix property).

The Ethereum Foundation has funded formal verification work on Ethereum's
Gasper consensus (TLA+, Coq).  KuberCoin's model follows the same methodology
and is model-checkable with TLC (`java -jar tla2tools.jar consensus.tla`).

## ZK Primitives Research Roadmap

KuberCoin is tracking the `arkworks-rs` ecosystem — **the same crate stack
used in several Ethereum zkEVM provers** (Scroll, Polygon Hermez, Penumbra)
— for future zero-knowledge proof integration.

| Feature | Crates | Status |
|---------|--------|--------|
| Pedersen commitments over secp256k1 | `ark-secp256k1`, `ark-ec` | 🔲 Planned — `core/research/zk_primitives/` |
| Bulletproof range proofs for UTXO amounts | `bulletproofs` | 🔲 Planned |
| PLONK proof of UTXO ownership | `ark-plonk` | 🔲 Research |
| Verifiable shuffle for Taproot CoinJoin | `ark-std` | 🔲 Research |

The target is a `kubercoin-zkprim` crate publishable to crates.io and usable
by any Ethereum project as a standalone range-proof library over secp256k1.

## Ethereum Foundation ESP Alignment

The work described in this document directly addresses EF ESP's stated areas:

| EF ESP Interest | KuberCoin Artefact |
|---|---|
| Cross-chain interoperability research | Atomic swap protocol + shared secp256k1/SHA-256 layer ([ATOMIC_SWAPS.md](ATOMIC_SWAPS.md)) |
| Cryptographic tooling reusable by the Ethereum ecosystem | `kubercoin-eip-signing` crate — EIP-191/712 in Rust with test vectors |
| Formal verification of consensus protocols | [`specs/consensus.tla`](../specs/consensus.tla) — TLC-checkable Nakamoto safety model |
| Developer tooling and security hardening | SOCKS5/Tor P2P transport; [SECURITY.md](SECURITY.md) |
| Open-source infrastructure | MIT licence; single auditable Rust workspace; public testnet |

## References

- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-55: Mixed-case checksum address encoding](https://eips.ethereum.org/EIPS/eip-55)
- [BIP-44: Multi-Account Hierarchy for Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
- [arkworks-rs: Modular ZK toolkit](https://github.com/arkworks-rs)
- [specs/consensus.tla](../specs/consensus.tla) — KuberCoin TLA+ consensus model
- [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md) — Cross-chain HTLC swap protocol
- [core/services/eip_signing/](../core/services/eip_signing/) — EIP-191/712 Rust crate
