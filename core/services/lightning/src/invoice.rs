//! Lightning invoices for payment requests

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Payment preimage (secret that unlocks payment)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaymentPreimage(pub [u8; 32]);

impl PaymentPreimage {
    pub fn new() -> Self {
        Self(rand::random())
    }
    
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Default for PaymentPreimage {
    fn default() -> Self {
        Self::new()
    }
}

/// Payment hash (SHA256 of preimage)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PaymentHash(pub [u8; 32]);

impl PaymentHash {
    pub fn from_preimage(preimage: &PaymentPreimage) -> Self {
        Self(crate::htlc::hash_preimage(&preimage.0))
    }
    
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
    
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

/// A Lightning invoice requesting payment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    /// Payment hash
    pub payment_hash: PaymentHash,
    /// Amount in satoshis (None = any amount)
    pub amount: Option<u64>,
    /// Invoice description
    pub description: String,
    /// Creation timestamp (Unix seconds)
    pub timestamp: u64,
    /// Expiry in seconds from timestamp
    pub expiry: u64,
    /// Recipient's public key
    pub payee_pubkey: String,
    /// Route hints for private channels
    pub route_hints: Vec<RouteHint>,
    /// Features supported
    pub features: u64,
}

/// Route hint for finding the payee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteHint {
    /// Pubkey of the hint node
    pub pubkey: String,
    /// Channel ID
    pub channel_id: [u8; 32],
    /// Fee base in millisatoshis
    pub fee_base_msat: u32,
    /// Fee proportional (millionths)
    pub fee_proportional_millionths: u32,
    /// CLTV expiry delta
    pub cltv_expiry_delta: u16,
}

impl Invoice {
    /// Create a new invoice
    pub fn new(
        amount: Option<u64>,
        description: impl Into<String>,
        payee_pubkey: String,
    ) -> (Self, PaymentPreimage) {
        let preimage = PaymentPreimage::new();
        let payment_hash = PaymentHash::from_preimage(&preimage);
        
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let invoice = Self {
            payment_hash,
            amount,
            description: description.into(),
            timestamp,
            expiry: 3600, // 1 hour default
            payee_pubkey,
            route_hints: Vec::new(),
            features: 0,
        };
        
        (invoice, preimage)
    }
    
    /// Check if invoice is expired
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now > self.timestamp + self.expiry
    }
    
    /// Set expiry time
    pub fn with_expiry(mut self, expiry_secs: u64) -> Self {
        self.expiry = expiry_secs;
        self
    }
    
    /// Add a route hint
    pub fn add_route_hint(&mut self, hint: RouteHint) {
        self.route_hints.push(hint);
    }
    
    /// Encode invoice as simple colon-separated string (legacy format).
    pub fn encode(&self) -> String {
        let amount_str = self.amount.map_or("any".to_string(), |a| a.to_string());
        format!(
            "lnkc:{}:{}:{}:{}",
            self.payment_hash.to_hex(),
            amount_str,
            self.timestamp,
            self.payee_pubkey
        )
    }

    /// Encode as a BOLT-11-style human-readable invoice string.
    ///
    /// Format: `lnkc<amount><sep>1<data><checksum>`
    /// where `<data>` is a sequence of tagged fields encoded as 5-bit groups.
    ///
    /// Tagged fields:
    ///   - `p` (1): 52×5-bit payment hash
    ///   - `d` (13): description (UTF-8)
    ///   - `x` (6): expiry in seconds
    ///   - `n` (19): payee public key (hex → bytes → 5-bit)
    pub fn encode_bolt11(&self) -> String {
        let hrp = match self.amount {
            Some(amt) => format!("lnkc{}", amt),
            None => "lnkc".to_string(),
        };

        let mut data5: Vec<u8> = Vec::new();

        // Timestamp: 7 groups of 5 bits (35 bits, covers Unix timestamps until ~2^35)
        push_u64_as_5bit(&mut data5, self.timestamp, 7);

        // Tagged field: payment_hash (tag=1, len=52)
        push_tagged_field(&mut data5, 1, &bytes_to_5bit(&self.payment_hash.0));

        // Tagged field: description (tag=13)
        push_tagged_field(&mut data5, 13, &bytes_to_5bit(self.description.as_bytes()));

        // Tagged field: expiry (tag=6)
        let expiry5 = encode_u64_minimal_5bit(self.expiry);
        push_tagged_field(&mut data5, 6, &expiry5);

        // Tagged field: payee pubkey (tag=19)
        if let Ok(pk_bytes) = hex::decode(&self.payee_pubkey) {
            push_tagged_field(&mut data5, 19, &bytes_to_5bit(&pk_bytes));
        }

        // Checksum
        let cs = bolt11_checksum(&hrp, &data5);
        data5.extend_from_slice(&cs);

        // Convert 5-bit data to bech32 charset
        const CHARSET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";
        let encoded: String = data5.iter().map(|&v| CHARSET[v as usize] as char).collect();

        format!("{}1{}", hrp, encoded)
    }

    /// Decode a BOLT-11 style invoice string.
    pub fn decode_bolt11(s: &str) -> Option<Self> {
        let s_lower = s.to_lowercase();
        // Split at last '1'
        let sep = s_lower.rfind('1')?;
        if sep == 0 { return None; }

        let hrp = &s_lower[..sep];
        let data_str = &s_lower[sep + 1..];

        if !hrp.starts_with("lnkc") { return None; }

        // Parse amount from HRP
        let amount_str = &hrp[4..];
        let amount: Option<u64> = if amount_str.is_empty() {
            None
        } else {
            Some(amount_str.parse().ok()?)
        };

        // Decode bech32 charset to 5-bit
        const CHARSET: &str = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
        let data5: Vec<u8> = data_str.bytes()
            .map(|b| CHARSET.find(b as char).map(|i| i as u8))
            .collect::<Option<Vec<_>>>()?;

        // Verify checksum (last 6 values)
        if data5.len() < 6 { return None; }
        let (payload, _checksum) = data5.split_at(data5.len() - 6);
        let expected_cs = bolt11_checksum(hrp, payload);
        if _checksum != expected_cs.as_slice() { return None; }

        // Timestamp: first 7 groups
        if payload.len() < 7 { return None; }
        let timestamp = read_u64_from_5bit(&payload[..7]);
        let mut pos = 7;

        let mut payment_hash = [0u8; 32];
        let mut description = String::new();
        let mut expiry = 3600u64;
        let mut payee_pubkey = String::new();

        // Parse tagged fields
        while pos + 3 <= payload.len() {
            let tag = payload[pos];
            let data_len = (payload[pos + 1] as usize) * 32 + (payload[pos + 2] as usize);
            pos += 3;
            if pos + data_len > payload.len() { break; }
            let field_data = &payload[pos..pos + data_len];
            pos += data_len;

            match tag {
                1 => { // payment hash
                    let bytes = bits5_to_bytes(field_data);
                    if bytes.len() >= 32 { payment_hash.copy_from_slice(&bytes[..32]); }
                }
                13 => { // description
                    let bytes = bits5_to_bytes(field_data);
                    description = String::from_utf8_lossy(&bytes).to_string();
                }
                6 => { // expiry
                    expiry = read_u64_from_5bit(field_data);
                }
                19 => { // payee pubkey
                    let bytes = bits5_to_bytes(field_data);
                    payee_pubkey = hex::encode(&bytes);
                }
                _ => {} // skip unknown tags
            }
        }

        Some(Self {
            payment_hash: PaymentHash(payment_hash),
            amount,
            description,
            timestamp,
            expiry,
            payee_pubkey,
            route_hints: Vec::new(),
            features: 0,
        })
    }

    /// Decode invoice from either legacy or BOLT-11 format.
    pub fn decode(s: &str) -> Option<Self> {
        // Try BOLT-11 first (starts with "lnkc" and contains "1" separator)
        if s.to_lowercase().starts_with("lnkc") && s.contains('1') && !s.contains(':') {
            return Self::decode_bolt11(s);
        }
        // Legacy colon-separated format
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() < 5 || parts[0] != "lnkc" {
            return None;
        }
        
        let hash_bytes = hex::decode(parts[1]).ok()?;
        if hash_bytes.len() != 32 {
            return None;
        }
        let mut payment_hash = [0u8; 32];
        payment_hash.copy_from_slice(&hash_bytes);
        
        let amount = if parts[2] == "any" {
            None
        } else {
            Some(parts[2].parse().ok()?)
        };
        
        let timestamp: u64 = parts[3].parse().ok()?;
        let payee_pubkey = parts[4].to_string();
        
        Some(Self {
            payment_hash: PaymentHash(payment_hash),
            amount,
            description: String::new(),
            timestamp,
            expiry: 3600,
            payee_pubkey,
            route_hints: Vec::new(),
            features: 0,
        })
    }
}

// ── BOLT-11 encoding helpers ────────────────────────────────────────────

/// Convert 8-bit bytes to 5-bit groups (with optional padding).
fn bytes_to_5bit(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for &b in data {
        acc = (acc << 8) | (b as u32);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(((acc >> bits) & 0x1f) as u8);
        }
    }
    if bits > 0 {
        out.push(((acc << (5 - bits)) & 0x1f) as u8);
    }
    out
}

/// Convert 5-bit groups back to 8-bit bytes (drops incomplete trailing byte).
fn bits5_to_bytes(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for &v in data {
        acc = (acc << 5) | ((v & 0x1f) as u32);
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            out.push(((acc >> bits) & 0xff) as u8);
        }
    }
    out
}

/// Push a u64 value as `count` 5-bit groups (big-endian).
fn push_u64_as_5bit(out: &mut Vec<u8>, val: u64, count: usize) {
    for i in (0..count).rev() {
        let shift = i * 5;
        if shift >= 64 {
            out.push(0);
        } else {
            out.push(((val >> shift) & 0x1f) as u8);
        }
    }
}

/// Read a u64 from 5-bit groups (big-endian).
fn read_u64_from_5bit(data: &[u8]) -> u64 {
    let mut val = 0u64;
    for &v in data {
        val = (val << 5) | ((v & 0x1f) as u64);
    }
    val
}

/// Push a tagged field: tag(1) + data_length(2, big-endian in 5-bit) + data.
fn push_tagged_field(out: &mut Vec<u8>, tag: u8, field_data: &[u8]) {
    out.push(tag & 0x1f);
    let len = field_data.len();
    out.push(((len >> 5) & 0x1f) as u8);
    out.push((len & 0x1f) as u8);
    out.extend_from_slice(field_data);
}

/// Encode a u64 value using the minimum number of 5-bit groups needed.
fn encode_u64_minimal_5bit(val: u64) -> Vec<u8> {
    if val == 0 { return vec![0]; }
    let bits_needed = 64 - val.leading_zeros() as usize;
    let groups = (bits_needed + 4) / 5; // ceil division
    let mut out = Vec::with_capacity(groups);
    push_u64_as_5bit(&mut out, val, groups);
    out
}

/// Compute BOLT-11 bech32 checksum over hrp + data (6 values).
fn bolt11_checksum(hrp: &str, data: &[u8]) -> [u8; 6] {
    const GEN: [u32; 5] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

    fn polymod(values: &[u8]) -> u32 {
        let mut chk: u32 = 1;
        for &v in values {
            let b = chk >> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ (v as u32);
            for (i, &g) in GEN.iter().enumerate() {
                if (b >> i) & 1 != 0 { chk ^= g; }
            }
        }
        chk
    }

    // Expand HRP
    let mut values: Vec<u8> = Vec::new();
    for c in hrp.bytes() { values.push(c >> 5); }
    values.push(0);
    for c in hrp.bytes() { values.push(c & 0x1f); }
    values.extend_from_slice(data);
    values.extend_from_slice(&[0, 0, 0, 0, 0, 0]);

    // BOLT-11 uses bech32 constant (1), not bech32m
    let pm = polymod(&values) ^ 1;
    let mut cs = [0u8; 6];
    for i in 0..6 {
        cs[i] = ((pm >> (5 * (5 - i))) & 0x1f) as u8;
    }
    cs
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_payment_preimage() {
        let preimage = PaymentPreimage::new();
        let hash = PaymentHash::from_preimage(&preimage);
        
        // Hash should be different from preimage
        assert_ne!(preimage.0, hash.0);
        
        // Same preimage should give same hash
        let hash2 = PaymentHash::from_preimage(&preimage);
        assert_eq!(hash.0, hash2.0);
    }
    
    #[test]
    fn test_invoice_creation() {
        let (invoice, preimage) = Invoice::new(
            Some(100_000),
            "Test payment",
            "pubkey123".to_string(),
        );
        
        assert_eq!(invoice.amount, Some(100_000));
        assert_eq!(invoice.description, "Test payment");
        assert!(!invoice.is_expired());
        
        // Verify preimage matches hash
        let computed_hash = PaymentHash::from_preimage(&preimage);
        assert_eq!(invoice.payment_hash, computed_hash);
    }
    
    #[test]
    fn test_invoice_encode_decode() {
        let (invoice, _) = Invoice::new(
            Some(50_000),
            "Coffee",
            "testpubkey".to_string(),
        );
        
        let encoded = invoice.encode();
        assert!(encoded.starts_with("lnkc:"));
        
        let decoded = Invoice::decode(&encoded).expect("decode should work");
        assert_eq!(decoded.amount, invoice.amount);
        assert_eq!(decoded.payment_hash, invoice.payment_hash);
    }
    
    #[test]
    fn test_invoice_no_amount() {
        let (invoice, _) = Invoice::new(
            None,
            "Donation",
            "pubkey".to_string(),
        );
        
        let encoded = invoice.encode();
        assert!(encoded.contains(":any:"));
        
        let decoded = Invoice::decode(&encoded).unwrap();
        assert_eq!(decoded.amount, None);
    }

    #[test]
    fn test_bolt11_encode_decode_roundtrip() {
        let (invoice, _) = Invoice::new(
            Some(250_000),
            "BOLT-11 test",
            hex::encode([0xABu8; 33]),
        );
        let encoded = invoice.encode_bolt11();
        assert!(encoded.starts_with("lnkc250000"));
        assert!(encoded.contains('1')); // bech32 separator

        let decoded = Invoice::decode_bolt11(&encoded).expect("should decode");
        assert_eq!(decoded.amount, Some(250_000));
        assert_eq!(decoded.payment_hash, invoice.payment_hash);
        assert_eq!(decoded.description, "BOLT-11 test");
        assert_eq!(decoded.expiry, invoice.expiry);
    }

    #[test]
    fn test_bolt11_no_amount() {
        let (invoice, _) = Invoice::new(
            None,
            "Donation",
            hex::encode([0xCDu8; 33]),
        );
        let encoded = invoice.encode_bolt11();
        assert!(encoded.starts_with("lnkc1")); // no amount, straight to separator

        let decoded = Invoice::decode_bolt11(&encoded).unwrap();
        assert_eq!(decoded.amount, None);
        assert_eq!(decoded.description, "Donation");
    }

    #[test]
    fn test_bolt11_bad_checksum_rejected() {
        let (invoice, _) = Invoice::new(Some(1000), "x", "aa".to_string());
        let mut encoded = invoice.encode_bolt11();
        // Corrupt last character
        let last = encoded.pop().unwrap();
        let replacement = if last == 'q' { 'p' } else { 'q' };
        encoded.push(replacement);
        assert!(Invoice::decode_bolt11(&encoded).is_none());
    }

    #[test]
    fn test_decode_dispatches_correctly() {
        // Legacy format (contains colons)
        let (inv, _) = Invoice::new(Some(1000), "x", "pk".to_string());
        let legacy = inv.encode();
        assert!(Invoice::decode(&legacy).is_some());

        // BOLT-11 format (no colons)
        let bolt11 = inv.encode_bolt11();
        assert!(Invoice::decode(&bolt11).is_some());
    }
}
