//! On-chain funding and closing transactions for Lightning channels.
//!
//! Bridges the in-memory channel state to real blockchain transactions
//! using the `tx` crate primitives.

use sha2::{Digest, Sha256};
use tx::{OutPoint, PrivateKey, PublicKey, Script, Transaction, TxInput, TxOutput};

use crate::channel::Channel;
use crate::{LightningError, Result};

/// Parameters for opening a channel
pub struct FundingParams {
    /// UTXO to spend for funding
    pub funding_utxo: OutPoint,
    /// Value of the funding UTXO (satoshis)
    pub funding_value: u64,
    /// Channel capacity (must be <= funding_value - fee)
    pub capacity: u64,
    /// Local initial balance
    pub push_amount: u64,
    /// Estimated on-chain fee
    pub fee: u64,
    /// Our private key for signing the funding input
    pub local_key: PrivateKey,
    /// Remote party's public key
    pub remote_pubkey: PublicKey,
}

/// A constructed funding transaction with its output details
pub struct FundingTx {
    /// The signed funding transaction
    pub tx: Transaction,
    /// The channel's output index within the transaction
    pub output_index: u32,
    /// The 2-of-2 multisig script used for the channel output
    pub redeem_script: Vec<u8>,
}

/// Build a channel funding transaction.
///
/// Creates a P2WSH 2-of-2 multisig output that locks `capacity` satoshis
/// and returns any change to the funder.
pub fn build_funding_tx(params: &FundingParams) -> Result<FundingTx> {
    if params.capacity == 0 {
        return Err(LightningError::PaymentFailed("zero capacity".into()));
    }
    let total_needed = params
        .capacity
        .checked_add(params.fee)
        .ok_or_else(|| LightningError::PaymentFailed("capacity + fee overflow".into()))?;
    if params.funding_value < total_needed {
        return Err(LightningError::InsufficientBalance);
    }

    let local_pub = params.local_key.public_key();
    let remote_pub = &params.remote_pubkey;

    // 2-of-2 multisig redeem script: OP_2 <pubA> <pubB> OP_2 OP_CHECKMULTISIG
    let redeem_script = build_2of2_script(&local_pub, remote_pub);

    // P2WSH = SHA256 of the redeem script → witness program
    let script_hash = sha256_hash(&redeem_script);
    // OP_0 <32-byte-hash>
    let mut witness_program = vec![0x00, 0x20];
    witness_program.extend_from_slice(&script_hash);

    let channel_output = TxOutput::new(params.capacity, witness_program);

    let mut outputs = vec![channel_output];

    // Change output back to the funder
    let change = params.funding_value.saturating_sub(total_needed);
    if change > 546 {
        // dust threshold
        let change_script = Script::new_p2pkh(&local_pub.hash());
        outputs.push(TxOutput::new(change, change_script.bytes));
    }

    let input = TxInput::new(params.funding_utxo, vec![]);
    let mut funding_tx = Transaction::new(vec![input], outputs, 0);

    // Sign the input
    funding_tx
        .sign_input(0, &params.local_key)
        .map_err(|e| LightningError::PaymentFailed(format!("signing failed: {}", e)))?;

    Ok(FundingTx {
        tx: funding_tx,
        output_index: 0,
        redeem_script,
    })
}

/// Parameters for cooperatively closing a channel
pub struct ClosingParams {
    /// The channel to close
    pub channel: Channel,
    /// Our private key for signing
    pub local_key: PrivateKey,
    /// Remote party's public key (for their output)
    pub remote_pubkey: PublicKey,
    /// On-chain fee split equally between both parties
    pub fee: u64,
}

/// Build a cooperative closing transaction.
///
/// Distributes the channel balance according to the latest commitment
/// state minus the on-chain fee.
pub fn build_closing_tx(params: &ClosingParams) -> Result<Transaction> {
    let ch = &params.channel;
    let half_fee = params.fee / 2;

    let local_pub = params.local_key.public_key();

    let local_receives = ch.local_balance.saturating_sub(half_fee);
    let remote_receives = ch.remote_balance.saturating_sub(half_fee);

    let funding_outpoint = OutPoint::new(ch.funding_txid, ch.funding_vout);
    let input = TxInput::new(funding_outpoint, vec![]);

    let mut outputs = Vec::new();

    // Local output
    if local_receives > 546 {
        let script = Script::new_p2pkh(&local_pub.hash());
        outputs.push(TxOutput::new(local_receives, script.bytes));
    }

    // Remote output
    if remote_receives > 546 {
        let remote_hash = params.remote_pubkey.hash();
        let script = Script::new_p2pkh(&remote_hash);
        outputs.push(TxOutput::new(remote_receives, script.bytes));
    }

    if outputs.is_empty() {
        return Err(LightningError::PaymentFailed(
            "both outputs below dust after fees".into(),
        ));
    }

    let mut closing_tx = Transaction::new(vec![input], outputs, 0);

    // Sign our side
    closing_tx
        .sign_input(0, &params.local_key)
        .map_err(|e| LightningError::PaymentFailed(format!("signing failed: {}", e)))?;

    Ok(closing_tx)
}

/// Build a 2-of-2 multisig redeem script with lexicographic key ordering.
fn build_2of2_script(key_a: &PublicKey, key_b: &PublicKey) -> Vec<u8> {
    let a = key_a.to_bytes();
    let b = key_b.to_bytes();

    // Lexicographic ordering for deterministic script
    let (first, second) = if a <= b { (&a, &b) } else { (&b, &a) };

    let mut script = Vec::with_capacity(3 + first.len() + second.len() + 2);
    script.push(0x52); // OP_2
    script.push(first.len() as u8);
    script.extend_from_slice(first);
    script.push(second.len() as u8);
    script.extend_from_slice(second);
    script.push(0x52); // OP_2
    script.push(0xae); // OP_CHECKMULTISIG
    script
}

/// Build a commitment transaction for local force-close.
///
/// Gives the remote party their balance immediately and the local party's
/// balance is locked behind a relative timelock (CSV).
pub fn build_commitment_tx(
    channel: &Channel,
    local_key: &PrivateKey,
    remote_pubkey: &PublicKey,
    csv_delay: u32,
    fee: u64,
) -> Result<Transaction> {
    let half_fee = fee / 2;
    let local_receives = channel.local_balance.saturating_sub(half_fee);
    let remote_receives = channel.remote_balance.saturating_sub(half_fee);

    let funding_outpoint = OutPoint::new(channel.funding_txid, channel.funding_vout);
    let input = TxInput::new(funding_outpoint, vec![]);

    let local_pub = local_key.public_key();
    let mut outputs = Vec::new();

    // Remote output — immediately spendable
    if remote_receives > 546 {
        let script = Script::new_p2pkh(&remote_pubkey.hash());
        outputs.push(TxOutput::new(remote_receives, script.bytes));
    }

    // Local output — CSV-locked
    if local_receives > 546 {
        let local_hash = local_pub.hash();
        // Simple CSV script: <delay> OP_CSV OP_DROP OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG
        let csv_script = build_csv_script(csv_delay, &local_hash);
        outputs.push(TxOutput::new(local_receives, csv_script));
    }

    if outputs.is_empty() {
        return Err(LightningError::PaymentFailed(
            "both outputs below dust after fees".into(),
        ));
    }

    let mut commitment_tx = Transaction::new(vec![input], outputs, 0);
    commitment_tx
        .sign_input(0, local_key)
        .map_err(|e| LightningError::PaymentFailed(format!("signing failed: {}", e)))?;

    Ok(commitment_tx)
}

/// Build a CSV-locked script for the local party's delayed output.
fn build_csv_script(delay: u32, pubkey_hash: &[u8; 20]) -> Vec<u8> {
    let mut script = Vec::new();
    // Push delay as minimal LE integer
    push_number(&mut script, delay as i64);
    script.push(0xb2); // OP_CHECKSEQUENCEVERIFY
    script.push(0x75); // OP_DROP
    script.push(0x76); // OP_DUP
    script.push(0xa9); // OP_HASH160
    script.push(0x14); // push 20 bytes
    script.extend_from_slice(pubkey_hash);
    script.push(0x88); // OP_EQUALVERIFY
    script.push(0xac); // OP_CHECKSIG
    script
}

/// Push a script number (minimal encoding).
fn push_number(script: &mut Vec<u8>, n: i64) {
    if n == 0 {
        script.push(0x00); // OP_0
        return;
    }
    if (1..=16).contains(&n) {
        script.push(0x50 + n as u8); // OP_1 .. OP_16
        return;
    }
    // Encode as minimal LE signed integer
    let negative = n < 0;
    let mut abs = if negative { -(n as i128) } else { n as i128 } as u64;
    let mut buf = Vec::new();
    while abs > 0 {
        buf.push((abs & 0xff) as u8);
        abs >>= 8;
    }
    // If high bit set, add sign byte
    if !buf.is_empty() && (buf.last().unwrap() & 0x80) != 0 {
        buf.push(if negative { 0x80 } else { 0x00 });
    } else if negative && !buf.is_empty() {
        let last = buf.len() - 1;
        buf[last] |= 0x80;
    }
    script.push(buf.len() as u8);
    script.extend_from_slice(&buf);
}

fn sha256_hash(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Anchor output value (330 satoshis per BOLT-03)
const ANCHOR_VALUE: u64 = 330;

/// Build a commitment transaction with anchor outputs (BOLT-03 anchors).
///
/// Adds two small anchor outputs (one per party) that either party can
/// spend to CPFP (child-pays-for-parent) bump the commitment tx fee.
pub fn build_anchor_commitment_tx(
    channel: &Channel,
    local_key: &PrivateKey,
    remote_pubkey: &PublicKey,
    csv_delay: u32,
    fee: u64,
) -> Result<Transaction> {
    let half_fee = fee / 2;
    let local_pub = local_key.public_key();

    // Deduct anchor costs from balances
    let anchor_cost = ANCHOR_VALUE * 2;
    let local_receives = channel
        .local_balance
        .saturating_sub(half_fee)
        .saturating_sub(anchor_cost / 2);
    let remote_receives = channel
        .remote_balance
        .saturating_sub(half_fee)
        .saturating_sub(anchor_cost / 2);

    let funding_outpoint = OutPoint::new(channel.funding_txid, channel.funding_vout);
    let input = TxInput::new(funding_outpoint, vec![]);

    let mut outputs = Vec::new();

    // Remote output — immediately spendable
    if remote_receives > 546 {
        let script = Script::new_p2pkh(&remote_pubkey.hash());
        outputs.push(TxOutput::new(remote_receives, script.bytes));
    }

    // Local output — CSV-locked
    if local_receives > 546 {
        let local_hash = local_pub.hash();
        let csv_script = build_csv_script(csv_delay, &local_hash);
        outputs.push(TxOutput::new(local_receives, csv_script));
    }

    // Anchor output for local party (OP_TRUE-like, anyone can spend after 16 blocks)
    let local_anchor_script = build_anchor_script(&local_pub.hash());
    outputs.push(TxOutput::new(ANCHOR_VALUE, local_anchor_script));

    // Anchor output for remote party
    let remote_anchor_script = build_anchor_script(&remote_pubkey.hash());
    outputs.push(TxOutput::new(ANCHOR_VALUE, remote_anchor_script));

    if outputs.is_empty() {
        return Err(LightningError::PaymentFailed(
            "all outputs below dust after fees + anchors".into(),
        ));
    }

    let mut commitment_tx = Transaction::new(vec![input], outputs, 0);
    commitment_tx
        .sign_input(0, local_key)
        .map_err(|e| LightningError::PaymentFailed(format!("signing failed: {}", e)))?;

    Ok(commitment_tx)
}

/// Build an anchor output script.
///
/// `<pubkey_hash> OP_CHECKSIG OP_IFDUP OP_NOTIF <16> OP_CSV OP_ENDIF`
///
/// The keyholder can spend immediately; anyone else after 16 blocks.
fn build_anchor_script(pubkey_hash: &[u8; 20]) -> Vec<u8> {
    let mut script = Vec::new();
    script.push(0x76); // OP_DUP
    script.push(0xa9); // OP_HASH160
    script.push(0x14); // push 20 bytes
    script.extend_from_slice(pubkey_hash);
    script.push(0x88); // OP_EQUALVERIFY
    script.push(0xac); // OP_CHECKSIG
    script.push(0x73); // OP_IFDUP
    script.push(0x64); // OP_NOTIF
    script.push(0x60); // OP_16
    script.push(0xb2); // OP_CHECKSEQUENCEVERIFY
    script.push(0x68); // OP_ENDIF
    script
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_keypair() -> (PrivateKey, PublicKey) {
        let key = PrivateKey::new();
        let pub_key = key.public_key();
        (key, pub_key)
    }

    #[test]
    fn test_funding_tx_basic() {
        let (local_key, _local_pub) = make_keypair();
        let (_remote_key, remote_pub) = make_keypair();

        let params = FundingParams {
            funding_utxo: OutPoint::new([1u8; 32], 0),
            funding_value: 100_000,
            capacity: 90_000,
            push_amount: 0,
            fee: 5_000,
            local_key,
            remote_pubkey: remote_pub,
        };

        let result = build_funding_tx(&params).unwrap();
        assert_eq!(result.output_index, 0);
        // Channel output
        assert_eq!(result.tx.outputs[0].value, 90_000);
        // Change output (100_000 - 90_000 - 5_000 = 5_000 > 546)
        assert_eq!(result.tx.outputs.len(), 2);
        assert_eq!(result.tx.outputs[1].value, 5_000);
    }

    #[test]
    fn test_funding_tx_no_change_below_dust() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let params = FundingParams {
            funding_utxo: OutPoint::new([2u8; 32], 0),
            funding_value: 10_000,
            capacity: 9_500,
            push_amount: 0,
            fee: 450,
            local_key,
            remote_pubkey: remote_pub,
        };

        let result = build_funding_tx(&params).unwrap();
        // Change = 10000 - 9500 - 450 = 50 < 546 → no change output
        assert_eq!(result.tx.outputs.len(), 1);
    }

    #[test]
    fn test_funding_tx_insufficient_balance() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let params = FundingParams {
            funding_utxo: OutPoint::new([3u8; 32], 0),
            funding_value: 1_000,
            capacity: 10_000,
            push_amount: 0,
            fee: 500,
            local_key,
            remote_pubkey: remote_pub,
        };

        assert!(build_funding_tx(&params).is_err());
    }

    #[test]
    fn test_funding_tx_zero_capacity() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let params = FundingParams {
            funding_utxo: OutPoint::new([4u8; 32], 0),
            funding_value: 10_000,
            capacity: 0,
            push_amount: 0,
            fee: 500,
            local_key,
            remote_pubkey: remote_pub,
        };

        assert!(build_funding_tx(&params).is_err());
    }

    #[test]
    fn test_closing_tx_cooperative() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let channel = Channel::new(
            [5u8; 32],
            [6u8; 32],
            0,
            100_000,
            60_000,
            "local".into(),
            "remote".into(),
        );

        let params = ClosingParams {
            channel,
            local_key,
            remote_pubkey: remote_pub,
            fee: 2_000,
        };

        let closing_tx = build_closing_tx(&params).unwrap();
        // Local: 60000 - 1000 = 59000, Remote: 40000 - 1000 = 39000
        assert_eq!(closing_tx.outputs.len(), 2);
        let total: u64 = closing_tx.outputs.iter().map(|o| o.value).sum();
        assert_eq!(total, 98_000); // 100k - 2k fee
    }

    #[test]
    fn test_commitment_tx_with_csv() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let channel = Channel::new(
            [7u8; 32],
            [8u8; 32],
            0,
            200_000,
            120_000,
            "local".into(),
            "remote".into(),
        );

        let commitment = build_commitment_tx(&channel, &local_key, &remote_pub, 144, 2_000)
            .unwrap();
        assert_eq!(commitment.outputs.len(), 2);
        // First output = remote (immediately spendable), second = local (CSV-locked)
        let total: u64 = commitment.outputs.iter().map(|o| o.value).sum();
        assert_eq!(total, 198_000); // 200k - 2k fee
    }

    #[test]
    fn test_2of2_script_deterministic() {
        let (_, pub_a) = make_keypair();
        let (_, pub_b) = make_keypair();

        let script1 = build_2of2_script(&pub_a, &pub_b);
        let script2 = build_2of2_script(&pub_b, &pub_a);
        // Lexicographic ordering means both calls produce the same script
        assert_eq!(script1, script2);
    }

    #[test]
    fn test_push_number_small() {
        let mut buf = Vec::new();
        push_number(&mut buf, 0);
        assert_eq!(buf, vec![0x00]);

        buf.clear();
        push_number(&mut buf, 1);
        assert_eq!(buf, vec![0x51]); // OP_1

        buf.clear();
        push_number(&mut buf, 16);
        assert_eq!(buf, vec![0x60]); // OP_16

        buf.clear();
        push_number(&mut buf, 144);
        // 144 = 0x90, high bit set → needs sign byte
        assert_eq!(buf, vec![0x02, 0x90, 0x00]);
    }

    #[test]
    fn test_anchor_commitment_tx() {
        let (local_key, _) = make_keypair();
        let (_, remote_pub) = make_keypair();

        let channel = Channel::new(
            [10u8; 32],
            [11u8; 32],
            0,
            200_000,
            120_000,
            "local".into(),
            "remote".into(),
        );

        let tx = build_anchor_commitment_tx(&channel, &local_key, &remote_pub, 144, 2_000)
            .unwrap();
        // Should have 4 outputs: remote, local CSV, local anchor, remote anchor
        assert_eq!(tx.outputs.len(), 4);
        // Last two are anchor outputs
        assert_eq!(tx.outputs[2].value, ANCHOR_VALUE);
        assert_eq!(tx.outputs[3].value, ANCHOR_VALUE);
    }
}
