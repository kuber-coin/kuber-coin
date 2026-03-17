//! Miniscript — a structured subset of Bitcoin Script.
//!
//! Provides an AST representation of Miniscript expressions that can be
//! compiled to Bitcoin Script byte-code.  This module covers the core
//! fragment types described in the Miniscript specification
//! (<https://bitcoin.sipa.be/miniscript/>).
//!
//! # Supported fragments
//!
//! | Fragment | Semantics |
//! |----------|-----------|
//! | `pk(KEY)` | Push key, `OP_CHECKSIG` |
//! | `pk_h(KEY)` | `OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG` |
//! | `older(n)` | `<n> OP_CHECKSEQUENCEVERIFY` |
//! | `after(n)` | `<n> OP_CHECKLOCKTIMEVERIFY` |
//! | `sha256(h)` | `OP_SIZE 32 OP_EQUALVERIFY OP_SHA256 <h> OP_EQUAL` |
//! | `hash256(h)` | `OP_SIZE 32 OP_EQUALVERIFY OP_HASH256 <h> OP_EQUAL` |
//! | `hash160(h)` | `OP_SIZE 32 OP_EQUALVERIFY OP_HASH160 <h> OP_EQUAL` |
//! | `ripemd160(h)` | `OP_SIZE 32 OP_EQUALVERIFY OP_RIPEMD160 <h> OP_EQUAL` |
//! | `and_v(X, Y)` | X then Y (both must succeed) |
//! | `and_b(X, Y)` | X, Y, `OP_BOOLAND` |
//! | `or_b(X, Z)` | X, Z, `OP_BOOLOR` |
//! | `or_d(X, Z)` | X, `OP_IFDUP OP_NOTIF` Z `OP_ENDIF` |
//! | `thresh(k, X₁, …, Xₙ)` | Multi-threshold |
//! | `multi(k, KEY₁, …)` | `OP_CHECKMULTISIG` |

use std::fmt;

/// Errors encountered while parsing or compiling Miniscript.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MiniscriptError {
    /// Unexpected end of input while parsing.
    UnexpectedEnd,
    /// Expected a specific token.
    Expected(String),
    /// Unknown fragment name.
    UnknownFragment(String),
    /// Invalid integer literal.
    InvalidNumber,
    /// Invalid hex literal.
    InvalidHex,
    /// Threshold k must satisfy 1 ≤ k ≤ n.
    InvalidThreshold,
}

impl fmt::Display for MiniscriptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnexpectedEnd => write!(f, "unexpected end of miniscript"),
            Self::Expected(s) => write!(f, "expected {s}"),
            Self::UnknownFragment(s) => write!(f, "unknown fragment: {s}"),
            Self::InvalidNumber => write!(f, "invalid number literal"),
            Self::InvalidHex => write!(f, "invalid hex literal"),
            Self::InvalidThreshold => write!(f, "invalid threshold"),
        }
    }
}

impl std::error::Error for MiniscriptError {}

// ── AST ──────────────────────────────────────────────────────────

/// A Miniscript abstract syntax tree node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Miniscript {
    /// `pk(KEY)` — simple public-key check.
    Pk(Vec<u8>),
    /// `pk_h(HASH)` — public-key-hash check.
    PkH(Vec<u8>),
    /// `older(n)` — relative time-lock (CSV).
    Older(u32),
    /// `after(n)` — absolute time-lock (CLTV).
    After(u32),
    /// `sha256(hash)` — SHA-256 preimage check.
    Sha256([u8; 32]),
    /// `hash256(hash)` — double-SHA-256 preimage check.
    Hash256([u8; 32]),
    /// `hash160(hash)` — HASH160 preimage check.
    Hash160([u8; 20]),
    /// `ripemd160(hash)` — RIPEMD-160 preimage check.
    Ripemd160([u8; 20]),
    /// `and_v(X, Y)` — verify-and.
    AndV(Box<Miniscript>, Box<Miniscript>),
    /// `and_b(X, Y)` — boolean-and.
    AndB(Box<Miniscript>, Box<Miniscript>),
    /// `or_b(X, Z)` — boolean-or.
    OrB(Box<Miniscript>, Box<Miniscript>),
    /// `or_d(X, Z)` — dissatisfy-or.
    OrD(Box<Miniscript>, Box<Miniscript>),
    /// `thresh(k, subs…)` — k-of-n threshold.
    Thresh(usize, Vec<Miniscript>),
    /// `multi(k, keys…)` — k-of-n `OP_CHECKMULTISIG`.
    Multi(usize, Vec<Vec<u8>>),
    /// Raw opcode literal (for pass-through).
    Just(u8),
}

// ── Script compilation ───────────────────────────────────────────

// Opcode constants used in compilation.
const OP_DUP: u8 = 0x76;
const OP_HASH160: u8 = 0xa9;
const OP_EQUALVERIFY: u8 = 0x88;
const OP_CHECKSIG: u8 = 0xac;
const OP_CHECKMULTISIG: u8 = 0xae;
const OP_CHECKLOCKTIMEVERIFY: u8 = 0xb1;
const OP_CHECKSEQUENCEVERIFY: u8 = 0xb2;
const OP_SHA256: u8 = 0xa8;
const OP_HASH256: u8 = 0xaa;
const OP_RIPEMD160: u8 = 0xa6;
const OP_EQUAL: u8 = 0x87;
const OP_SIZE: u8 = 0x82;
const OP_BOOLAND: u8 = 0x9a;
const OP_BOOLOR: u8 = 0x9b;
const OP_IFDUP: u8 = 0x73;
const OP_NOTIF: u8 = 0x64;
const OP_ENDIF: u8 = 0x68;
const OP_ADD: u8 = 0x93;

impl Miniscript {
    /// Compile this Miniscript node into raw Bitcoin Script bytes.
    pub fn compile(&self) -> Vec<u8> {
        let mut out = Vec::new();
        self.compile_into(&mut out);
        out
    }

    fn compile_into(&self, out: &mut Vec<u8>) {
        match self {
            Miniscript::Pk(key) => {
                push_data(out, key);
                out.push(OP_CHECKSIG);
            }
            Miniscript::PkH(hash) => {
                out.push(OP_DUP);
                out.push(OP_HASH160);
                push_data(out, hash);
                out.push(OP_EQUALVERIFY);
                out.push(OP_CHECKSIG);
            }
            Miniscript::Older(n) => {
                push_scriptnum(out, *n as i64);
                out.push(OP_CHECKSEQUENCEVERIFY);
            }
            Miniscript::After(n) => {
                push_scriptnum(out, *n as i64);
                out.push(OP_CHECKLOCKTIMEVERIFY);
            }
            Miniscript::Sha256(h) => {
                out.push(OP_SIZE);
                push_scriptnum(out, 32);
                out.push(OP_EQUALVERIFY);
                out.push(OP_SHA256);
                push_data(out, h);
                out.push(OP_EQUAL);
            }
            Miniscript::Hash256(h) => {
                out.push(OP_SIZE);
                push_scriptnum(out, 32);
                out.push(OP_EQUALVERIFY);
                out.push(OP_HASH256);
                push_data(out, h);
                out.push(OP_EQUAL);
            }
            Miniscript::Hash160(h) => {
                out.push(OP_SIZE);
                push_scriptnum(out, 32);
                out.push(OP_EQUALVERIFY);
                out.push(OP_HASH160);
                push_data(out, h);
                out.push(OP_EQUAL);
            }
            Miniscript::Ripemd160(h) => {
                out.push(OP_SIZE);
                push_scriptnum(out, 32);
                out.push(OP_EQUALVERIFY);
                out.push(OP_RIPEMD160);
                push_data(out, h);
                out.push(OP_EQUAL);
            }
            Miniscript::AndV(x, y) => {
                x.compile_into(out);
                y.compile_into(out);
            }
            Miniscript::AndB(x, y) => {
                x.compile_into(out);
                y.compile_into(out);
                out.push(OP_BOOLAND);
            }
            Miniscript::OrB(x, z) => {
                x.compile_into(out);
                z.compile_into(out);
                out.push(OP_BOOLOR);
            }
            Miniscript::OrD(x, z) => {
                x.compile_into(out);
                out.push(OP_IFDUP);
                out.push(OP_NOTIF);
                z.compile_into(out);
                out.push(OP_ENDIF);
            }
            Miniscript::Thresh(k, subs) => {
                // Each sub pushes 1/0; we sum them and compare to k.
                if let Some((first, rest)) = subs.split_first() {
                    first.compile_into(out);
                    for sub in rest {
                        sub.compile_into(out);
                        out.push(OP_ADD);
                    }
                    push_scriptnum(out, *k as i64);
                    out.push(OP_EQUAL);
                }
            }
            Miniscript::Multi(k, keys) => {
                push_scriptnum(out, *k as i64);
                for key in keys {
                    push_data(out, key);
                }
                push_scriptnum(out, keys.len() as i64);
                out.push(OP_CHECKMULTISIG);
            }
            Miniscript::Just(op) => {
                out.push(*op);
            }
        }
    }
}

// ── Parsing ──────────────────────────────────────────────────────

/// Parse a Miniscript expression string into an AST.
pub fn parse(input: &str) -> Result<Miniscript, MiniscriptError> {
    let mut cursor = Cursor::new(input);
    let node = parse_node(&mut cursor)?;
    Ok(node)
}

struct Cursor<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn advance(&mut self) {
        if let Some(c) = self.peek() {
            self.pos += c.len_utf8();
        }
    }

    fn expect(&mut self, ch: char) -> Result<(), MiniscriptError> {
        if self.peek() == Some(ch) {
            self.advance();
            Ok(())
        } else {
            Err(MiniscriptError::Expected(ch.to_string()))
        }
    }

    fn read_ident(&mut self) -> String {
        let start = self.pos;
        while self.peek().map_or(false, |c| c.is_alphanumeric() || c == '_') {
            self.advance();
        }
        self.input[start..self.pos].to_string()
    }

    fn read_number(&mut self) -> Result<u64, MiniscriptError> {
        let start = self.pos;
        while self.peek().map_or(false, |c| c.is_ascii_digit()) {
            self.advance();
        }
        self.input[start..self.pos].parse::<u64>().map_err(|_| MiniscriptError::InvalidNumber)
    }

    fn read_hex(&mut self) -> Result<Vec<u8>, MiniscriptError> {
        let start = self.pos;
        while self.peek().map_or(false, |c| c.is_ascii_hexdigit()) {
            self.advance();
        }
        hex::decode(&self.input[start..self.pos]).map_err(|_| MiniscriptError::InvalidHex)
    }

    fn skip_ws(&mut self) {
        while self.peek().map_or(false, |c| c.is_whitespace()) {
            self.advance();
        }
    }
}

fn parse_node(cursor: &mut Cursor) -> Result<Miniscript, MiniscriptError> {
    cursor.skip_ws();
    let ident = cursor.read_ident();
    cursor.skip_ws();
    match ident.as_str() {
        "pk" => {
            cursor.expect('(')?;
            let key = cursor.read_hex()?;
            cursor.expect(')')?;
            Ok(Miniscript::Pk(key))
        }
        "pk_h" => {
            cursor.expect('(')?;
            let hash = cursor.read_hex()?;
            cursor.expect(')')?;
            Ok(Miniscript::PkH(hash))
        }
        "older" => {
            cursor.expect('(')?;
            let n = cursor.read_number()? as u32;
            cursor.expect(')')?;
            Ok(Miniscript::Older(n))
        }
        "after" => {
            cursor.expect('(')?;
            let n = cursor.read_number()? as u32;
            cursor.expect(')')?;
            Ok(Miniscript::After(n))
        }
        "sha256" => {
            cursor.expect('(')?;
            let h = parse_hash32(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::Sha256(h))
        }
        "hash256" => {
            cursor.expect('(')?;
            let h = parse_hash32(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::Hash256(h))
        }
        "hash160" => {
            cursor.expect('(')?;
            let h = parse_hash20(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::Hash160(h))
        }
        "ripemd160" => {
            cursor.expect('(')?;
            let h = parse_hash20(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::Ripemd160(h))
        }
        "and_v" => {
            cursor.expect('(')?;
            let x = parse_node(cursor)?;
            cursor.skip_ws();
            cursor.expect(',')?;
            let y = parse_node(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::AndV(Box::new(x), Box::new(y)))
        }
        "and_b" => {
            cursor.expect('(')?;
            let x = parse_node(cursor)?;
            cursor.skip_ws();
            cursor.expect(',')?;
            let y = parse_node(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::AndB(Box::new(x), Box::new(y)))
        }
        "or_b" => {
            cursor.expect('(')?;
            let x = parse_node(cursor)?;
            cursor.skip_ws();
            cursor.expect(',')?;
            let z = parse_node(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::OrB(Box::new(x), Box::new(z)))
        }
        "or_d" => {
            cursor.expect('(')?;
            let x = parse_node(cursor)?;
            cursor.skip_ws();
            cursor.expect(',')?;
            let z = parse_node(cursor)?;
            cursor.expect(')')?;
            Ok(Miniscript::OrD(Box::new(x), Box::new(z)))
        }
        "thresh" => {
            cursor.expect('(')?;
            let k = cursor.read_number()? as usize;
            let mut subs = Vec::new();
            loop {
                cursor.skip_ws();
                if cursor.peek() == Some(')') { break; }
                cursor.expect(',')?;
                subs.push(parse_node(cursor)?);
            }
            cursor.expect(')')?;
            if k < 1 || k > subs.len() {
                return Err(MiniscriptError::InvalidThreshold);
            }
            Ok(Miniscript::Thresh(k, subs))
        }
        "multi" => {
            cursor.expect('(')?;
            let k = cursor.read_number()? as usize;
            let mut keys = Vec::new();
            loop {
                cursor.skip_ws();
                if cursor.peek() == Some(')') { break; }
                cursor.expect(',')?;
                cursor.skip_ws();
                keys.push(cursor.read_hex()?);
            }
            cursor.expect(')')?;
            if k < 1 || k > keys.len() {
                return Err(MiniscriptError::InvalidThreshold);
            }
            Ok(Miniscript::Multi(k, keys))
        }
        other if other.is_empty() => Err(MiniscriptError::UnexpectedEnd),
        other => Err(MiniscriptError::UnknownFragment(other.to_string())),
    }
}

fn parse_hash32(cursor: &mut Cursor) -> Result<[u8; 32], MiniscriptError> {
    let bytes = cursor.read_hex()?;
    if bytes.len() != 32 {
        return Err(MiniscriptError::InvalidHex);
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

fn parse_hash20(cursor: &mut Cursor) -> Result<[u8; 20], MiniscriptError> {
    let bytes = cursor.read_hex()?;
    if bytes.len() != 20 {
        return Err(MiniscriptError::InvalidHex);
    }
    let mut arr = [0u8; 20];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

// ── Script data helpers ──────────────────────────────────────────

fn push_data(out: &mut Vec<u8>, data: &[u8]) {
    let len = data.len();
    if len == 0 {
        out.push(0x00);
    } else if len <= 75 {
        out.push(len as u8);
        out.extend_from_slice(data);
    } else if len <= 255 {
        out.push(0x4c); // OP_PUSHDATA1
        out.push(len as u8);
        out.extend_from_slice(data);
    } else if len <= 65535 {
        out.push(0x4d); // OP_PUSHDATA2
        out.extend_from_slice(&(len as u16).to_le_bytes());
        out.extend_from_slice(data);
    } else {
        out.push(0x4e); // OP_PUSHDATA4
        out.extend_from_slice(&(len as u32).to_le_bytes());
        out.extend_from_slice(data);
    }
}

fn push_scriptnum(out: &mut Vec<u8>, n: i64) {
    if n == 0 {
        out.push(0x00); // OP_0
        return;
    }
    if n >= 1 && n <= 16 {
        out.push(0x50 + n as u8); // OP_1 .. OP_16
        return;
    }
    // CScriptNum encoding
    let neg = n < 0;
    let mut abs = n.unsigned_abs();
    let mut buf = Vec::new();
    while abs > 0 {
        buf.push((abs & 0xff) as u8);
        abs >>= 8;
    }
    if buf.last().map_or(false, |b| b & 0x80 != 0) {
        buf.push(if neg { 0x80 } else { 0x00 });
    } else if neg {
        let last = buf.len() - 1;
        buf[last] |= 0x80;
    }
    push_data(out, &buf);
}

// ── Display ──────────────────────────────────────────────────────

impl fmt::Display for Miniscript {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pk(k) => write!(f, "pk({})", hex::encode(k)),
            Self::PkH(h) => write!(f, "pk_h({})", hex::encode(h)),
            Self::Older(n) => write!(f, "older({n})"),
            Self::After(n) => write!(f, "after({n})"),
            Self::Sha256(h) => write!(f, "sha256({})", hex::encode(h)),
            Self::Hash256(h) => write!(f, "hash256({})", hex::encode(h)),
            Self::Hash160(h) => write!(f, "hash160({})", hex::encode(h)),
            Self::Ripemd160(h) => write!(f, "ripemd160({})", hex::encode(h)),
            Self::AndV(x, y) => write!(f, "and_v({x},{y})"),
            Self::AndB(x, y) => write!(f, "and_b({x},{y})"),
            Self::OrB(x, z) => write!(f, "or_b({x},{z})"),
            Self::OrD(x, z) => write!(f, "or_d({x},{z})"),
            Self::Thresh(k, subs) => {
                write!(f, "thresh({k}")?;
                for s in subs { write!(f, ",{s}")?; }
                write!(f, ")")
            }
            Self::Multi(k, keys) => {
                write!(f, "multi({k}")?;
                for key in keys { write!(f, ",{}", hex::encode(key))?; }
                write!(f, ")")
            }
            Self::Just(op) => write!(f, "just(0x{op:02x})"),
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_pk() {
        let key = "02" .to_string() + &"ab".repeat(32);
        let ms = parse(&format!("pk({key})")).unwrap();
        assert!(matches!(ms, Miniscript::Pk(_)));
        let script = ms.compile();
        assert!(!script.is_empty());
        assert_eq!(*script.last().unwrap(), OP_CHECKSIG);
    }

    #[test]
    fn parse_older() {
        let ms = parse("older(144)").unwrap();
        assert_eq!(ms, Miniscript::Older(144));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_CHECKSEQUENCEVERIFY);
    }

    #[test]
    fn parse_after() {
        let ms = parse("after(500000)").unwrap();
        assert_eq!(ms, Miniscript::After(500000));
    }

    #[test]
    fn parse_sha256() {
        let h = "aa".repeat(32);
        let ms = parse(&format!("sha256({h})")).unwrap();
        assert!(matches!(ms, Miniscript::Sha256(_)));
    }

    #[test]
    fn parse_and_v() {
        let key = "02".to_string() + &"cc".repeat(32);
        let expr = format!("and_v(pk({key}),older(10))");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::AndV(_, _)));
        let script = ms.compile();
        assert!(!script.is_empty());
    }

    #[test]
    fn parse_multi() {
        let k1 = "02".to_string() + &"aa".repeat(32);
        let k2 = "03".to_string() + &"bb".repeat(32);
        let expr = format!("multi(1,{k1},{k2})");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::Multi(1, _)));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_CHECKMULTISIG);
    }

    #[test]
    fn parse_thresh() {
        let key = "02".to_string() + &"dd".repeat(32);
        let expr = format!("thresh(1,pk({key}),older(100))");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::Thresh(1, _)));
    }

    #[test]
    fn display_roundtrip() {
        let ms = Miniscript::Older(144);
        let s = ms.to_string();
        let parsed = parse(&s).unwrap();
        assert_eq!(ms, parsed);
    }

    #[test]
    fn unknown_fragment_errors() {
        assert!(parse("bogus(123)").is_err());
    }

    #[test]
    fn push_scriptnum_small() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, 0);
        assert_eq!(buf, vec![0x00]); // OP_0

        buf.clear();
        push_scriptnum(&mut buf, 1);
        assert_eq!(buf, vec![0x51]); // OP_1

        buf.clear();
        push_scriptnum(&mut buf, 16);
        assert_eq!(buf, vec![0x60]); // OP_16
    }

    // ── Phase 7 hardening ──

    #[test]
    fn parse_hash256() {
        let h = "bb".repeat(32);
        let ms = parse(&format!("hash256({h})")).unwrap();
        assert!(matches!(ms, Miniscript::Hash256(_)));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_EQUAL);
    }

    #[test]
    fn parse_hash160() {
        let h = "cc".repeat(20);
        let ms = parse(&format!("hash160({h})")).unwrap();
        assert!(matches!(ms, Miniscript::Hash160(_)));
    }

    #[test]
    fn parse_ripemd160() {
        let h = "dd".repeat(20);
        let ms = parse(&format!("ripemd160({h})")).unwrap();
        assert!(matches!(ms, Miniscript::Ripemd160(_)));
    }

    #[test]
    fn parse_or_b() {
        let key = "02".to_string() + &"aa".repeat(32);
        let expr = format!("or_b(pk({key}),older(5))");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::OrB(_, _)));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_BOOLOR);
    }

    #[test]
    fn parse_or_d() {
        let key = "02".to_string() + &"aa".repeat(32);
        let expr = format!("or_d(pk({key}),older(5))");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::OrD(_, _)));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_ENDIF);
    }

    #[test]
    fn parse_and_b() {
        let key = "02".to_string() + &"aa".repeat(32);
        let expr = format!("and_b(pk({key}),older(10))");
        let ms = parse(&expr).unwrap();
        assert!(matches!(ms, Miniscript::AndB(_, _)));
        let script = ms.compile();
        assert_eq!(*script.last().unwrap(), OP_BOOLAND);
    }

    #[test]
    fn thresh_invalid_k_zero() {
        let key = "02".to_string() + &"aa".repeat(32);
        let expr = format!("thresh(0,pk({key}))");
        assert!(parse(&expr).is_err());
    }

    #[test]
    fn thresh_invalid_k_exceeds_n() {
        let key = "02".to_string() + &"aa".repeat(32);
        let expr = format!("thresh(3,pk({key}),older(5))");
        assert!(parse(&expr).is_err());
    }

    #[test]
    fn multi_invalid_k_zero() {
        let k1 = "02".to_string() + &"aa".repeat(32);
        let expr = format!("multi(0,{k1})");
        assert!(parse(&expr).is_err());
    }

    #[test]
    fn empty_input_errors() {
        assert!(matches!(parse(""), Err(MiniscriptError::UnexpectedEnd)));
    }

    #[test]
    fn display_roundtrip_pk() {
        let key_hex = "02".to_string() + &"ab".repeat(32);
        let ms = parse(&format!("pk({key_hex})")).unwrap();
        let s = ms.to_string();
        let reparsed = parse(&s).unwrap();
        assert_eq!(ms, reparsed);
    }

    #[test]
    fn display_roundtrip_sha256() {
        let h = "ff".repeat(32);
        let ms = parse(&format!("sha256({h})")).unwrap();
        let s = ms.to_string();
        let reparsed = parse(&s).unwrap();
        assert_eq!(ms, reparsed);
    }

    #[test]
    fn push_scriptnum_negative() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, -1);
        // CScriptNum -1 → 0x81 (1 byte), push_data prefixes with len 0x01
        assert_eq!(buf, vec![0x01, 0x81]);
    }

    #[test]
    fn push_scriptnum_large() {
        let mut buf = Vec::new();
        push_scriptnum(&mut buf, 255);
        // 255 = 0xFF, high bit set → need sign byte 0x00
        assert_eq!(buf, vec![0x02, 0xff, 0x00]);
    }

    #[test]
    fn compile_just_opcode() {
        let ms = Miniscript::Just(0x51); // OP_1
        let script = ms.compile();
        assert_eq!(script, vec![0x51]);
    }

    #[test]
    fn error_display_all_variants() {
        assert!(MiniscriptError::UnexpectedEnd.to_string().contains("unexpected"));
        assert!(MiniscriptError::Expected(")".into()).to_string().contains(")"));
        assert!(MiniscriptError::UnknownFragment("foo".into()).to_string().contains("foo"));
        assert!(MiniscriptError::InvalidNumber.to_string().contains("number"));
        assert!(MiniscriptError::InvalidHex.to_string().contains("hex"));
        assert!(MiniscriptError::InvalidThreshold.to_string().contains("threshold"));
    }
}
