# Silent Payments Compatibility (BIP-352)

This document analyses the compatibility of KuberCoin's Taproot and HD-wallet
implementation with the BIP-352 Silent Payments proposal, and defines the
steps required to ship a full KuberCoin Silent Payments implementation.

## What Are Silent Payments?

BIP-352 (Silent Payments) lets a sender pay a recipient without any prior
interaction, using only a static public identifier (the "silent payment
address") that never appears on-chain.  Every payment to the same static
address produces a **different** on-chain P2TR output, breaking address-reuse
linkability completely — without requiring an invoice-per-payment flow.

This is the strongest on-chain privacy primitive available today for
UTXO-based chains without covenant scripts or ZK proofs.

## KuberCoin's Current Compatibility

| Requirement | Status | Notes |
|-------------|--------|-------|
| secp256k1 curve | ✅ | Used for all KuberCoin key operations |
| Taproot (P2TR) outputs | ✅ | `generate_key_with_type(P2TR)` — BIP-341 taptweak applied |
| BIP-32 HD key derivation | ✅ | `ExtendedPrivateKey` in `core/core/tx/src/hd_wallet.rs` |
| BIP-39 mnemonic (2048 words + checksum) | ✅ | Full wordlist implemented |
| ECDH shared secret (recipient scanning) | 🔲 | Needs: `secp256k1::ecdh::SharedSecret` |
| BIP-352 label generation | 🔲 | Needs: `hash_to_curve(label)` on secp256k1 |
| Silent payment address encoding | 🔲 | New bech32m HRP: `sp` (mainnet), `tsp` (testnet) |
| Sender-side output derivation | 🔲 | Needs: ECDH + hash-to-scalar tweak |
| Recipient wallet scanning | 🔲 | Needs: test all incoming transactions |

## Architecture

### Key Setup

Each recipient generates a silent payment address from two secp256k1 keys:

- `B_scan` — used to compute the shared secret (ECDH).  Public.
- `B_spend` — used to derive the actual output key.  Public for recipients to
  share;  private spend key is only held by the recipient.

The silent payment address encodes both public keys in bech32m:

```
sp1qqgmrm...   (mainnet)
tsp1qqgmrm...  (testnet)
```

### Sender Flow

```
1. Recipient shares: sp1qqgmrm...  (encodes B_scan and B_spend)

2. Sender collects their input private keys: a₁, a₂, ...

3. Compute input hash:
   input_hash = SHA256(outpoint₀ || A_sum)
   where A_sum = a₁·G + a₂·G + ...

4. Compute shared secret via ECDH:
   ecdh_shared = input_hash · a₁ · B_scan

5. Derive output key:
   t_k = SHA256(ecdh_shared || k)  [k = output index, starts at 0]
   P_output = B_spend + t_k · G

6. Create P2TR output paying to x-only(P_output) (no taptweak needed)
```

### Recipient Scanning Flow

```
For each new block, for each P2TR output:
1. Reconstruct sender's A_sum from the transaction inputs
2. Compute ecdh_shared = b_scan · A_sum · input_hash
3. Derive candidate: P_candidate = B_spend + SHA256(ecdh_shared || 0) · G
4. If x-only(P_candidate) matches the output tweaked pubkey — it's ours
5. Spend key: b_spend + SHA256(ecdh_shared || 0) [as scalar]
```

## Implementation Plan

### Dependencies to add to `core/core/tx/Cargo.toml`

```toml
# Already present — no additions needed for secp256k1 ECDH
secp256k1 = { version = "0.29", features = ["rand", "serde", "global-context"] }
```

The `secp256k1` crate's `ecdh` module (behind the `global-context` feature)
provides the `SharedSecret` type needed for BIP-352.

### New file: `core/core/tx/src/silent_payments.rs`

Key public functions to implement:

```rust
/// Encode a (B_scan, B_spend) key pair as a BIP-352 silent payment address.
pub fn encode_silent_payment_address(
    b_scan: &PublicKey,
    b_spend: &PublicKey,
    network: Network,
) -> String;

/// Decode a silent payment address into its (B_scan, B_spend) components.
pub fn decode_silent_payment_address(
    addr: &str,
) -> Result<(PublicKey, PublicKey), SilentPaymentError>;

/// Derive the P2TR output key for an outgoing silent payment.
pub fn derive_sender_output(
    input_private_keys: &[SecretKey],
    input_outpoints: &[OutPoint],
    recipient_scan: &PublicKey,
    recipient_spend: &PublicKey,
    output_index: u32,
) -> Result<PublicKey, SilentPaymentError>;

/// Scan a list of transactions for payments to this recipient's silent address.
/// Returns (outpoint, spend_key) pairs for each payment found.
pub fn scan_transactions(
    b_scan_secret: &SecretKey,
    b_spend_public: &PublicKey,
    transactions: &[Transaction],
) -> Vec<(OutPoint, SecretKey)>;
```

## Privacy Guarantee

Each payment to the same `sp1...` address produces a distinct, unlinkable
P2TR output.  An on-chain observer cannot determine:

- That multiple outputs belong to the same recipient.
- Which payer sent which output.
- Whether any output is a Silent Payment at all (they are indistinguishable
  from ordinary key-path Taproot outputs).

## Relationship to Existing Privacy Features

| Feature | Technique | On-chain footprint |
|---------|-----------|-------------------|
| HD wallet | BIP-32 address derivation | Reused xpub visible if addresses are linked |
| BIP-155 Tor transport | Network-layer anonymity | No on-chain impact |
| CoinJoin | Multi-party input mixing | Input link obfuscation |
| PayJoin (BIP-78) | Sender-receiver input mixing | Breaks common-input heuristic |
| **Silent Payments** | **ECDH address derivation** | **No address reuse ever; no interaction needed** |

Silent Payments provides the strongest payment-graph privacy because the
recipient address never appears on-chain and does not require coordination.

## References

- [BIP-352: Silent Payments](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- [BIP-341: Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [josibake/silentpayments-python — reference implementation](https://github.com/josibake/silentpayments-python)
- [Ruben Somsen: Silent Payments](https://gist.github.com/RubenSomsen/c43b79517e7cb701ebf77eec6dbb46b3)
