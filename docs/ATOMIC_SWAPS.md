# Cross-Chain Atomic Swaps: KuberCoin ↔ Ethereum

This document specifies the protocol for trustless Hash Time-Locked Contract
(HTLC) atomic swaps between KuberCoin UTXOs and Ethereum ETH / ERC-20 tokens.

## Overview

An atomic swap lets two parties exchange value across two different blockchains
without a trusted intermediary.  The "atomic" property means: either both legs
settle, or neither does — there is no intermediate state where one party has
received funds without the other.

## Cryptographic Foundation

KuberCoin and Ethereum share two foundational primitives:

1. **SHA-256 hash locks** — both chains can enforce the condition:
   > "Reveal a 32-byte pre-image `s` such that `SHA256(s) = H`."
   - KuberCoin side: `OP_SHA256 <H> OP_EQUALVERIFY` in a P2WSH script.
   - Ethereum side: Solidity `require(sha256(abi.encodePacked(preimage)) == hashlock)`.

2. **secp256k1 ECDSA** — KuberCoin and Ethereum use the same elliptic curve.
   The `kubercoin-eip-signing` crate (`core/services/eip_signing/`) enables
   a KuberCoin wallet to produce Ethereum-compatible ECDSA signatures and
   derive Ethereum addresses from the same BIP-39 seed phrase.

## Protocol

### Roles

- **Alice**: holds Ethereum ETH/ERC-20, wants KuberCoin (KBC).
- **Bob**: holds KuberCoin, wants Ethereum ETH/ERC-20.

### Step-by-Step

```
Alice                                Bob
  │                                   │
  │ 1. Generate pre-image: s (32 B)   │
  │    H = SHA256(s)                  │
  │                                   │
  │ 2. Deploy Ethereum HTLC ─────────►│
  │    KuberCoinHTLC.lock(            │
  │      id, Bob_eth_addr, H,         │
  │      timeout = now + 48h          │
  │    ) with value = 1 ETH           │
  │                                   │
  │ 3. Share H with Bob ─────────────►│
  │                                   │
  │                         4. Verify Ethereum HTLC on-chain
  │                                   │
  │                         5. Create KuberCoin HTLC UTXO
  │◄──────────────────────────────────│
  │    P2WSH output encoding:         │
  │    OP_IF                          │
  │      OP_SHA256 <H> OP_EQUALVERIFY │
  │      OP_DUP OP_HASH160            │
  │        <Alice_pkh> OP_EQUALVERIFY │
  │      OP_CHECKSIG                  │
  │    OP_ELSE                        │
  │      <24h CLTV> OP_CSV OP_DROP    │
  │      OP_DUP OP_HASH160            │
  │        <Bob_pkh> OP_EQUALVERIFY   │
  │      OP_CHECKSIG                  │
  │    OP_ENDIF                       │
  │                                   │
  │ 6. Claim KBC UTXO ────────────────│
  │    (broadcast witness: s,         │
  │     Alice sig)                    │
  │                                   │
  │                         7. Read s from KuberCoin chain
  │                                   │
  │                         8. Claim ETH from Ethereum
  │                            KuberCoinHTLC.claim(id, s)
  ▼                                   ▼
Alice has KBC                    Bob has ETH
```

### Timeout Design

| Party | Chain | Lock Time | Action on Timeout |
|-------|-------|-----------|-------------------|
| Alice | Ethereum | 48 hours | Alice calls `contract.refund(id)` |
| Bob | KuberCoin | 24 hours (CLTV) | Bob sweeps with refund path |

The asymmetric timeouts (KuberCoin shorter than Ethereum) ensure Bob cannot
exploit the Ethereum refund window after Alice has already claimed KBC.

## Ethereum HTLC Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title KuberCoinHTLC
/// @notice SHA-256 Hash Time-Locked Contract for KuberCoin ↔ Ethereum atomic swaps.
contract KuberCoinHTLC {
    struct Lock {
        address payable recipient;
        address payable refunder;
        bytes32 hashlock;   // SHA-256 hash of the pre-image
        uint256 amount;
        uint256 timelock;   // UNIX timestamp after which refund is allowed
        bool    claimed;
    }

    mapping(bytes32 => Lock) public locks;

    event Locked(bytes32 indexed id, address indexed recipient, uint256 amount);
    event Claimed(bytes32 indexed id, bytes32 preimage);
    event Refunded(bytes32 indexed id);

    function lock(
        bytes32 id,
        address payable recipient,
        bytes32 hashlock,
        uint256 timelock
    ) external payable {
        require(msg.value > 0,            "no value");
        require(timelock > block.timestamp, "expired timelock");
        require(locks[id].amount == 0,    "id already used");

        locks[id] = Lock({
            recipient: recipient,
            refunder:  payable(msg.sender),
            hashlock:  hashlock,
            amount:    msg.value,
            timelock:  timelock,
            claimed:   false
        });
        emit Locked(id, recipient, msg.value);
    }

    function claim(bytes32 id, bytes32 preimage) external {
        Lock storage l = locks[id];
        require(!l.claimed,                                      "already claimed");
        require(sha256(abi.encodePacked(preimage)) == l.hashlock, "wrong preimage");
        l.claimed = true;
        emit Claimed(id, preimage);
        l.recipient.transfer(l.amount);
    }

    function refund(bytes32 id) external {
        Lock storage l = locks[id];
        require(!l.claimed,                    "already claimed");
        require(block.timestamp >= l.timelock, "timelock not expired");
        l.claimed = true;
        emit Refunded(id);
        l.refunder.transfer(l.amount);
    }
}
```

## KuberCoin P2WSH Script Template

The KuberCoin HTLC script expressed as a witness script:

```
OP_IF
  OP_SHA256 <hashlock_32_bytes> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <recipient_pubkeyhash_20_bytes> OP_EQUALVERIFY OP_CHECKSIG
OP_ELSE
  <locktime_sequence> OP_CHECKSEQUENCEVERIFY OP_DROP
  OP_DUP OP_HASH160 <refund_pubkeyhash_20_bytes> OP_EQUALVERIFY OP_CHECKSIG
OP_ENDIF
```

**Claim witness stack** (Alice's path):
```
<alice_signature> <alice_pubkey> <preimage_s> OP_1
```

**Refund witness stack** (Bob's path, after CLTV):
```
<bob_signature> <bob_pubkey> OP_0
```

## KuberCoin CLI Commands (Planned)

```bash
# Generate a secret pre-image and its SHA-256 hash
kubercoin atomic-swap new-secret
# → { "preimage_hex": "...", "hash_hex": "..." }

# Bob: create the KuberCoin HTLC UTXO locking funds for Alice
kubercoin atomic-swap create-htlc \
  --hash           <H_hex> \
  --recipient      <Alice_KBC_address> \
  --refund         <Bob_KBC_address> \
  --amount-sat     100000000 \
  --csv-blocks     144 \
  --wallet         bob_wallet.json

# Alice: claim the KuberCoin HTLC once she verifies it on-chain
kubercoin atomic-swap claim-htlc \
  --txid           <htlc_funding_txid> \
  --vout           0 \
  --preimage       <s_hex> \
  --wallet         alice_wallet.json
```

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Alice publishes `s` before Bob's HTLC is funded | Bob verifies the Ethereum HTLC on-chain before funding the KBC HTLC |
| Bob never broadcasts the KBC HTLC | Alice safely waits for the 48h Ethereum timeout and calls `refund()` |
| Pre-image brute force | 32-byte random pre-image → 256-bit preimage space — computationally infeasible |
| Clock skew between chains | KBC uses block-height CLTV; Ethereum uses timestamps — add a safety margin to the KBC locktime |
| Malleability of unsigned KBC HTLC | Use SegWit (P2WSH) to eliminate transaction malleability |

## Relationship to `kubercoin-eip-signing`

The `core/services/eip_signing/` crate enables a single BIP-39 seed phrase
to control both KuberCoin UTXOs and the Ethereum HTLC claim transaction:

- KuberCoin derivation path: `m/44'/0'/0'/0/n`
- Ethereum derivation path: `m/44'/60'/0'/0/n`

Both paths derive secp256k1 keys from the same master seed.  Alice can
therefore use one seed phrase to both claim the KuberCoin UTXO and to sign
the Ethereum `claim(id, preimage)` call — reducing key-management burden
and enabling hardware-wallet support via standard BIP-44 paths.

## References

- [BIP-199: Hashed Timelock Contracts](https://github.com/bitcoin/bips/blob/master/bip-0199.mediawiki)
- [BIP-68: Relative Lock-time using Consensus-Enforced Sequence Numbers](https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Tier Nolan — Atomic Swaps (bitcointalk, 2013)](https://bitcointalk.org/index.php?topic=193281.msg2003765)
- [core/services/eip_signing/](../core/services/eip_signing/) — Ethereum signing primitives
