//! EIP-191 / EIP-712 structured-data signing and Ethereum-compatible address
//! derivation for the KuberCoin wallet layer.
//!
//! KuberCoin uses secp256k1 — the same elliptic curve as Ethereum.  This crate
//! adds the Ethereum-specific hashing conventions on top of the same keypairs,
//! making KuberCoin wallets interoperable with MetaMask, hardware wallets that
//! speak EIP-712 (Ledger, Trezor), and Ethereum dApp signing flows.
//!
//! # Modules
//!
//! - [`eip191`] — Personal sign (`\x19Ethereum Signed Message:\n{len}`).
//! - [`eip712`] — Typed structured-data signing (domain separator + type hash).
//! - [`eth_address`] — Derive a 20-byte Ethereum address (Keccak-256 of the
//!   uncompressed public key, last 20 bytes) and render it with EIP-55
//!   mixed-case checksum.
//!
//! # Cross-chain atomic swap relevance
//!
//! KuberCoin HTLCs (SHA-256 pre-image lock) use the same hash primitive as
//! Ethereum HTLC contracts.  The address and signing primitives in this crate
//! are the on/off ramp for cross-chain atomic swaps: a KuberCoin UTXO locked
//! to an Ethereum-derived key can be unlocked by the same private key that
//! controls an Ethereum account.  See `docs/ATOMIC_SWAPS.md` for the protocol
//! specification.

pub mod eip191;
pub mod eip712;
pub mod eth_address;

pub use eip191::{personal_sign_hash, EIP191Error};
pub use eip712::{encode_typed_data, Domain, TypedData, EIP712Error};
pub use eth_address::{eip55_checksum, eth_address_from_pubkey, EthAddressError};
