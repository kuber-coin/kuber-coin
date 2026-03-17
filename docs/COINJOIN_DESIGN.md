# CoinJoin and PayJoin Design

This document describes KuberCoin's privacy-enhancing transaction formats:
PSBT-based CoinJoin (multi-party output aggregation) and PayJoin / BIP-78
(sender-receiver output merging).

## Motivation

On-chain UTXO graph analysis allows an observer to link inputs to outputs
and trace payment flows.  CoinJoin and PayJoin break this linkage by combining
multiple parties' inputs and outputs into a single transaction, making any
single payment attribution probabilistic rather than certain.

This is directly relevant for:

- Journalists and activists using KuberCoin under surveillance.
- Exchanges that want to protect customer withdrawal patterns.
- Any user who values financial privacy as a default, not a premium feature.

## CoinJoin via PSBT (BIP-174)

KuberCoin supports BIP-174 Partially Signed Bitcoin Transactions (PSBT),
the standard data format for multi-party transaction construction.

### Protocol Flow

```
Alice (wants to send 1 KBC)     Bob (wants to send 2 KBC)
         │                               │
         ▼                               ▼
   create PSBT with             create PSBT with
   Alice's input(s)             Bob's input(s)
         │                               │
         └───────────► Coordinator ◄─────┘
                            │
                    combine PSBTs into
                    single CoinJoin tx
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
           send PSBT back      send PSBT back
           for signing         for signing
                  │                   │
                  └────────┬──────────┘
                       finalize and
                       broadcast
```

### Security Properties

- KuberCoin nodes never learn private keys — only the PSBT with signed inputs.
- The coordinator is untrusted: it cannot steal funds; it only learns that
  Alice and Bob participated in the same round.
- Equal-output CoinJoin (all output amounts identical) maximises the anonymity
  set, making any individual output attribution probabilistic.

### Implementation Status

PSBT serialisation and parsing is implemented in the `tx` crate.  The
coordinator protocol is in the design phase; a reference implementation will
be provided in `tools/coinjoin/`.

## PayJoin (BIP-78)

PayJoin requires only **two** parties (sender and receiver) and produces a
transaction indistinguishable from a normal UTXO-to-UTXO payment.  The
receiver contributes an input, breaking the "common input ownership"
heuristic used by chain-analysis tools.

### Protocol Flow (BIP-78)

```
Sender                          Receiver (merchant)
  │                                   │
  │  1. Payment request (BIP-21 URI)  │
  │◄──────────────────────────────────│
  │                                   │
  │  2. Original PSBT (unsigned)      │
  │──────────────────────────────────►│
  │                                   │
  │  3. PayJoin PSBT (receiver adds   │
  │     input + output, signs)        │
  │◄──────────────────────────────────│
  │                                   │
  │  4. Sender signs and broadcasts   │
  │──────────────────────────────────►│
```

### KuberCoin PayJoin Endpoint (Planned)

A KuberCoin wallet acting as a BIP-78 PayJoin receiver exposes a HTTPS
endpoint:

```
POST /payjoin
Content-Type: text/plain
Body: base64url-encoded PSBT
```

The wallet validates the sender's PSBT, adds a receiver input and output,
signs with the receiver's private key, and returns the modified PSBT.

### Sender-side Validation

The sender's wallet must verify that the receiver's modifications are safe:

- No new inputs from unknown addresses.
- Output amounts are consistent with the agreed payment.
- Script types are unchanged (P2WPKH in → P2WPKH out).
- Fee rate is not materially increased beyond the negotiated rate.

## Taproot CoinJoin

With Taproot (P2TR) key-path spends, CoinJoin transactions are
**visually indistinguishable** from single-signature spends on-chain — every
input produces a single 64-byte Schnorr signature with no script visible.
This provides a stronger anonymity guarantee than P2WPKH CoinJoin, where
the input count and script structure can reveal participation.

KuberCoin already has Taproot (BIP-341) and Tapscript (BIP-342) implemented.
Taproot CoinJoin is the target for the `tools/coinjoin/` coordinator.

## Roadmap

| Item | Status |
|------|--------|
| PSBT serialisation/parsing | ✅ Done |
| BIP-370 PSBT v2 support | 🔲 Planned |
| CoinJoin coordinator (round protocol) | 🔲 Planned — `tools/coinjoin/` |
| PayJoin receiver HTTP endpoint | 🔲 Planned |
| Wallet-side PayJoin sender logic | 🔲 Planned |
| Taproot CoinJoin (Schnorr, equal-value key-path spends) | 🔲 Planned |

## References

- [BIP-78: Payment Protocol 2.0 (PayJoin)](https://github.com/bitcoin/bips/blob/master/bip-0078.mediawiki)
- [BIP-174: Partially Signed Bitcoin Transactions](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)
- [BIP-370: PSBT Version 2](https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki)
- Greg Maxwell's original CoinJoin proposal (bitcointalk, 2013)
- [WabiSabi: Centrally Coordinated CoinJoin](https://eprint.iacr.org/2021/206.pdf)
