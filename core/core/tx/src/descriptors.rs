//! Bitcoin-style output descriptors (BIP-380 family).
//!
//! Supports parsing and generating descriptor strings such as:
//! - `pk(KEY)` — Pay-to-pubkey
//! - `pkh(KEY)` — Pay-to-pubkey-hash
//! - `wpkh(KEY)` — Pay-to-witness-pubkey-hash (native SegWit v0)
//! - `sh(wpkh(KEY))` — Wrapped SegWit P2SH-P2WPKH
//! - `wsh(SCRIPT)` — Pay-to-witness-script-hash
//! - `tr(KEY)` — Pay-to-Taproot (SegWit v1)
//! - `multi(k,KEY1,KEY2,...)` — k-of-n multisig
//! - `sortedmulti(k,KEY1,KEY2,...)` — sorted k-of-n multisig
//! - `addr(ADDRESS)` — Raw address
//! - `raw(HEX)` — Raw script hex

use std::fmt;

/// Errors that can occur during descriptor parsing or generation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DescriptorError {
    /// Unexpected end of input while parsing.
    UnexpectedEnd,
    /// Expected a specific character that was not found.
    Expected(char),
    /// Unknown descriptor function name.
    UnknownFunction(String),
    /// Invalid threshold in multi/sortedmulti.
    InvalidThreshold,
    /// Need at least one key in multi/sortedmulti.
    EmptyKeys,
    /// Threshold exceeds number of keys.
    ThresholdExceedsKeys,
    /// Bad hex literal in raw().
    InvalidHex,
    /// The checksum did not match.
    BadChecksum,
    /// Generic parse error.
    Parse(String),
}

impl fmt::Display for DescriptorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnexpectedEnd => write!(f, "unexpected end of descriptor"),
            Self::Expected(c) => write!(f, "expected '{c}'"),
            Self::UnknownFunction(name) => write!(f, "unknown descriptor function: {name}"),
            Self::InvalidThreshold => write!(f, "invalid multisig threshold"),
            Self::EmptyKeys => write!(f, "multi() requires at least one key"),
            Self::ThresholdExceedsKeys => write!(f, "threshold exceeds number of keys"),
            Self::InvalidHex => write!(f, "invalid hex in raw()"),
            Self::BadChecksum => write!(f, "descriptor checksum mismatch"),
            Self::Parse(msg) => write!(f, "parse error: {msg}"),
        }
    }
}

impl std::error::Error for DescriptorError {}

/// A key expression inside a descriptor — either a hex public key or an
/// extended key path string (e.g. `xpub.../0/*`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DescriptorKey {
    /// Raw hex-encoded public key (compressed 33 bytes or uncompressed 65 bytes).
    Hex(String),
    /// Extended key with optional derivation (e.g., `xpub6.../0/*`).
    Extended(String),
}

impl fmt::Display for DescriptorKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Hex(h) => write!(f, "{h}"),
            Self::Extended(e) => write!(f, "{e}"),
        }
    }
}

/// Parsed output descriptor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Descriptor {
    /// `pk(KEY)` — Pay to bare pubkey.
    Pk(DescriptorKey),
    /// `pkh(KEY)` — Pay to pubkey hash.
    Pkh(DescriptorKey),
    /// `wpkh(KEY)` — Pay to witness pubkey hash (SegWit v0).
    Wpkh(DescriptorKey),
    /// `sh(inner)` — Pay to script hash wrapping an inner descriptor.
    Sh(Box<Descriptor>),
    /// `wsh(inner)` — Pay to witness script hash wrapping an inner descriptor.
    Wsh(Box<Descriptor>),
    /// `tr(KEY)` — Pay to Taproot (SegWit v1, key-path only).
    Tr(DescriptorKey),
    /// `multi(threshold, keys)` — bare multisig.
    Multi(usize, Vec<DescriptorKey>),
    /// `sortedmulti(threshold, keys)` — sorted bare multisig.
    SortedMulti(usize, Vec<DescriptorKey>),
    /// `addr(ADDRESS)` — a raw address string.
    Addr(String),
    /// `raw(HEX)` — a raw script hex.
    Raw(String),
}

impl fmt::Display for Descriptor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pk(k) => write!(f, "pk({k})"),
            Self::Pkh(k) => write!(f, "pkh({k})"),
            Self::Wpkh(k) => write!(f, "wpkh({k})"),
            Self::Sh(inner) => write!(f, "sh({inner})"),
            Self::Wsh(inner) => write!(f, "wsh({inner})"),
            Self::Tr(k) => write!(f, "tr({k})"),
            Self::Multi(thresh, keys) => {
                write!(f, "multi({thresh}")?;
                for k in keys {
                    write!(f, ",{k}")?;
                }
                write!(f, ")")
            }
            Self::SortedMulti(thresh, keys) => {
                write!(f, "sortedmulti({thresh}")?;
                for k in keys {
                    write!(f, ",{k}")?;
                }
                write!(f, ")")
            }
            Self::Addr(a) => write!(f, "addr({a})"),
            Self::Raw(h) => write!(f, "raw({h})"),
        }
    }
}

impl Descriptor {
    /// Parse a descriptor string, optionally with a `#checksum` suffix.
    pub fn parse(input: &str) -> Result<Self, DescriptorError> {
        let body = if let Some(idx) = input.rfind('#') {
            let (desc, cksum) = input.split_at(idx);
            let expected = &cksum[1..]; // skip '#'
            let computed = descriptor_checksum(desc);
            if expected != computed {
                return Err(DescriptorError::BadChecksum);
            }
            desc
        } else {
            input
        };
        let mut cursor = Cursor::new(body);
        let desc = parse_descriptor(&mut cursor)?;
        if cursor.remaining() > 0 {
            return Err(DescriptorError::Parse("trailing characters".into()));
        }
        Ok(desc)
    }

    /// Serialize the descriptor to string with a checksum appended.
    pub fn to_string_with_checksum(&self) -> String {
        let base = self.to_string();
        let cksum = descriptor_checksum(&base);
        format!("{base}#{cksum}")
    }

    /// Infer the address type this descriptor produces.
    pub fn address_type(&self) -> Option<crate::AddressType> {
        match self {
            Self::Pkh(_) => Some(crate::AddressType::P2PKH),
            Self::Wpkh(_) => Some(crate::AddressType::P2WPKH),
            Self::Sh(_) => Some(crate::AddressType::P2SH),
            Self::Wsh(_) => Some(crate::AddressType::P2WSH),
            Self::Tr(_) => Some(crate::AddressType::P2TR),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Parser internals
// ---------------------------------------------------------------------------

struct Cursor<'a> {
    data: &'a str,
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a str) -> Self {
        Self { data, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.data.len() - self.pos
    }

    fn peek(&self) -> Option<char> {
        self.data[self.pos..].chars().next()
    }

    fn next_char(&mut self) -> Result<char, DescriptorError> {
        let c = self.peek().ok_or(DescriptorError::UnexpectedEnd)?;
        self.pos += c.len_utf8();
        Ok(c)
    }

    fn expect(&mut self, expected: char) -> Result<(), DescriptorError> {
        let c = self.next_char()?;
        if c == expected {
            Ok(())
        } else {
            Err(DescriptorError::Expected(expected))
        }
    }

    fn read_until(&mut self, stop: &[char]) -> String {
        let start = self.pos;
        while self.pos < self.data.len() {
            let c = self.data[self.pos..].chars().next().unwrap();
            if stop.contains(&c) {
                break;
            }
            self.pos += c.len_utf8();
        }
        self.data[start..self.pos].to_string()
    }
}

fn parse_descriptor(cursor: &mut Cursor) -> Result<Descriptor, DescriptorError> {
    let func = cursor.read_until(&['(']);
    cursor.expect('(')?;

    let desc = match func.as_str() {
        "pk" => {
            let key = parse_key(cursor)?;
            Descriptor::Pk(key)
        }
        "pkh" => {
            let key = parse_key(cursor)?;
            Descriptor::Pkh(key)
        }
        "wpkh" => {
            let key = parse_key(cursor)?;
            Descriptor::Wpkh(key)
        }
        "tr" => {
            let key = parse_key(cursor)?;
            Descriptor::Tr(key)
        }
        "sh" => {
            let inner = parse_descriptor(cursor)?;
            Descriptor::Sh(Box::new(inner))
        }
        "wsh" => {
            let inner = parse_descriptor(cursor)?;
            Descriptor::Wsh(Box::new(inner))
        }
        "multi" => parse_multi(cursor, false)?,
        "sortedmulti" => parse_multi(cursor, true)?,
        "addr" => {
            let addr = cursor.read_until(&[')']);
            Descriptor::Addr(addr)
        }
        "raw" => {
            let hex = cursor.read_until(&[')']);
            // Validate hex
            if hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(DescriptorError::InvalidHex);
            }
            Descriptor::Raw(hex)
        }
        other => return Err(DescriptorError::UnknownFunction(other.to_string())),
    };

    cursor.expect(')')?;
    Ok(desc)
}

fn parse_key(cursor: &mut Cursor) -> Result<DescriptorKey, DescriptorError> {
    let token = cursor.read_until(&[')', ',']);
    if token.is_empty() {
        return Err(DescriptorError::UnexpectedEnd);
    }
    if token.starts_with("xpub") || token.starts_with("xprv")
        || token.starts_with("tpub") || token.starts_with("tprv")
    {
        Ok(DescriptorKey::Extended(token))
    } else {
        Ok(DescriptorKey::Hex(token))
    }
}

fn parse_multi(cursor: &mut Cursor, sorted: bool) -> Result<Descriptor, DescriptorError> {
    let thresh_str = cursor.read_until(&[',', ')']);
    let threshold: usize = thresh_str
        .parse()
        .map_err(|_| DescriptorError::InvalidThreshold)?;

    let mut keys = Vec::new();
    while cursor.peek() == Some(',') {
        cursor.next_char()?; // consume ','
        let key = parse_key(cursor)?;
        keys.push(key);
    }

    if keys.is_empty() {
        return Err(DescriptorError::EmptyKeys);
    }
    if threshold == 0 || threshold > keys.len() {
        return Err(DescriptorError::ThresholdExceedsKeys);
    }

    if sorted {
        Ok(Descriptor::SortedMulti(threshold, keys))
    } else {
        Ok(Descriptor::Multi(threshold, keys))
    }
}

// ---------------------------------------------------------------------------
// BIP-380 descriptor checksum (polymod based)
// ---------------------------------------------------------------------------

const INPUT_CHARSET: &str =
    "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";

const CHECKSUM_CHARSET: &[u8] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

fn polymod(c: u64, val: u64) -> u64 {
    let c0 = c >> 35;
    let mut c = ((c & 0x7ffffffff) << 5) ^ val;
    if c0 & 1 != 0 { c ^= 0xf5dee51989; }
    if c0 & 2 != 0 { c ^= 0xa9fdca3312; }
    if c0 & 4 != 0 { c ^= 0x1bab10e32d; }
    if c0 & 8 != 0 { c ^= 0x3706b1677a; }
    if c0 & 16 != 0 { c ^= 0x644d626ffd; }
    c
}

/// Compute the 8-character BIP-380 descriptor checksum.
pub fn descriptor_checksum(desc: &str) -> String {
    let mut c = 1u64;
    let mut cls = 0u64;
    let mut clscount = 0u64;

    for ch in desc.chars() {
        let pos = match INPUT_CHARSET.find(ch) {
            Some(p) => p as u64,
            None => return String::from("!invalid"),
        };
        c = polymod(c, pos & 31);
        cls = cls * 3 + (pos >> 5);
        clscount += 1;
        if clscount == 3 {
            c = polymod(c, cls);
            cls = 0;
            clscount = 0;
        }
    }
    if clscount > 0 {
        c = polymod(c, cls);
    }
    for _ in 0..8 {
        c = polymod(c, 0);
    }
    c ^= 1;

    let mut result = String::with_capacity(8);
    for j in 0..8 {
        result.push(CHECKSUM_CHARSET[((c >> (5 * (7 - j))) & 31) as usize] as char);
    }
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pkh() {
        let desc = Descriptor::parse("pkh(0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)").unwrap();
        assert_eq!(
            desc,
            Descriptor::Pkh(DescriptorKey::Hex(
                "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798".into()
            ))
        );
        assert_eq!(desc.address_type(), Some(crate::AddressType::P2PKH));
    }

    #[test]
    fn test_parse_wpkh() {
        let desc = Descriptor::parse("wpkh(02aabbccdd)").unwrap();
        assert_eq!(
            desc,
            Descriptor::Wpkh(DescriptorKey::Hex("02aabbccdd".into()))
        );
        assert_eq!(desc.address_type(), Some(crate::AddressType::P2WPKH));
    }

    #[test]
    fn test_parse_tr() {
        let desc = Descriptor::parse("tr(deadbeef)").unwrap();
        assert_eq!(
            desc,
            Descriptor::Tr(DescriptorKey::Hex("deadbeef".into()))
        );
        assert_eq!(desc.address_type(), Some(crate::AddressType::P2TR));
    }

    #[test]
    fn test_parse_sh_wpkh() {
        let desc = Descriptor::parse("sh(wpkh(02aabb))").unwrap();
        assert_eq!(
            desc,
            Descriptor::Sh(Box::new(Descriptor::Wpkh(DescriptorKey::Hex("02aabb".into()))))
        );
        assert_eq!(desc.address_type(), Some(crate::AddressType::P2SH));
    }

    #[test]
    fn test_parse_wsh_multi() {
        let desc = Descriptor::parse("wsh(multi(2,0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798,03aabbccdd))").unwrap();
        match &desc {
            Descriptor::Wsh(inner) => match inner.as_ref() {
                Descriptor::Multi(thresh, keys) => {
                    assert_eq!(*thresh, 2);
                    assert_eq!(keys.len(), 2);
                }
                other => panic!("expected Multi, got {other:?}"),
            },
            other => panic!("expected Wsh, got {other:?}"),
        }
        assert_eq!(desc.address_type(), Some(crate::AddressType::P2WSH));
    }

    #[test]
    fn test_parse_sortedmulti() {
        let desc = Descriptor::parse("sortedmulti(1,aa,bb,cc)").unwrap();
        assert_eq!(
            desc,
            Descriptor::SortedMulti(
                1,
                vec![
                    DescriptorKey::Hex("aa".into()),
                    DescriptorKey::Hex("bb".into()),
                    DescriptorKey::Hex("cc".into()),
                ]
            )
        );
    }

    #[test]
    fn test_parse_addr() {
        let desc = Descriptor::parse("addr(kb1qw508d6qejxtdg4y5r3zarvary0c5xw7k5tv6ep)").unwrap();
        assert_eq!(
            desc,
            Descriptor::Addr("kb1qw508d6qejxtdg4y5r3zarvary0c5xw7k5tv6ep".into())
        );
    }

    #[test]
    fn test_parse_raw() {
        let desc = Descriptor::parse("raw(76a914aabb00ff88)").unwrap();
        assert_eq!(desc, Descriptor::Raw("76a914aabb00ff88".into()));
    }

    #[test]
    fn test_parse_raw_invalid_hex() {
        let err = Descriptor::parse("raw(zzzz)").unwrap_err();
        assert_eq!(err, DescriptorError::InvalidHex);
    }

    #[test]
    fn test_parse_extended_key() {
        let desc = Descriptor::parse("wpkh(xpub661MyMwAqRbcF.../0/*)").unwrap();
        assert_eq!(
            desc,
            Descriptor::Wpkh(DescriptorKey::Extended("xpub661MyMwAqRbcF.../0/*".into()))
        );
    }

    #[test]
    fn test_roundtrip() {
        let cases = [
            "pk(0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)",
            "pkh(02aabb)",
            "wpkh(02aabb)",
            "sh(wpkh(02aabb))",
            "tr(deadbeef)",
            "multi(2,aa,bb,cc)",
            "sortedmulti(1,aa,bb)",
            "addr(kb1q1234)",
            "raw(00aabb)",
        ];
        for input in &cases {
            let desc = Descriptor::parse(input).unwrap();
            assert_eq!(&desc.to_string(), *input, "roundtrip failed for {input}");
        }
    }

    #[test]
    fn test_checksum_roundtrip() {
        let desc = Descriptor::parse("wpkh(02aabb)").unwrap();
        let with_cksum = desc.to_string_with_checksum();
        assert!(with_cksum.contains('#'));
        let desc2 = Descriptor::parse(&with_cksum).unwrap();
        assert_eq!(desc, desc2);
    }

    #[test]
    fn test_bad_checksum() {
        let err = Descriptor::parse("wpkh(02aabb)#zzzzzzzz").unwrap_err();
        assert_eq!(err, DescriptorError::BadChecksum);
    }

    #[test]
    fn test_unknown_function() {
        let err = Descriptor::parse("foobar(x)").unwrap_err();
        assert_eq!(err, DescriptorError::UnknownFunction("foobar".into()));
    }

    #[test]
    fn test_multi_threshold_exceeds() {
        let err = Descriptor::parse("multi(5,aa,bb)").unwrap_err();
        assert_eq!(err, DescriptorError::ThresholdExceedsKeys);
    }

    #[test]
    fn test_multi_empty_keys() {
        let err = Descriptor::parse("multi(1)").unwrap_err();
        assert_eq!(err, DescriptorError::EmptyKeys);
    }

    #[test]
    fn test_pk_display() {
        let desc = Descriptor::Pk(DescriptorKey::Hex("abcd".into()));
        assert_eq!(desc.to_string(), "pk(abcd)");
        assert_eq!(desc.address_type(), None);
    }
}
