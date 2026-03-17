/// Extended Script Opcodes for P2SH and Multisig Support
///
/// This module adds the missing Bitcoin script opcodes needed for:
/// - OP_CHECKMULTISIG: Verify multiple signatures
/// - OP_CHECKLOCKTIMEVERIFY (BIP-65): Time-locked transactions
/// - OP_CHECKSEQUENCEVERIFY (BIP-112): Relative time locks
/// - Stack manipulation opcodes
use crate::Script;

/// Extended opcodes beyond the basic 4
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum OpCodeEx {
    // Constants
    Op0 = 0x00, // Also known as OP_FALSE
    Op1 = 0x51, // Also known as OP_TRUE
    Op2 = 0x52,
    Op3 = 0x53,
    Op4 = 0x54,
    Op5 = 0x55,
    Op6 = 0x56,
    Op7 = 0x57,
    Op8 = 0x58,
    Op9 = 0x59,
    Op10 = 0x5a,
    Op11 = 0x5b,
    Op12 = 0x5c,
    Op13 = 0x5d,
    Op14 = 0x5e,
    Op15 = 0x5f,
    Op16 = 0x60,

    // Flow control
    OpIf = 0x63,
    OpNotIf = 0x64,
    OpElse = 0x67,
    OpEndIf = 0x68,
    OpVerify = 0x69,
    OpReturn = 0x6a,

    // Stack operations
    OpToAltStack = 0x6b,
    OpFromAltStack = 0x6c,
    OpIfDup = 0x73,
    OpDepth = 0x74,
    OpDrop = 0x75,
    OpDup = 0x76,
    OpNip = 0x77,
    OpOver = 0x78,
    OpPick = 0x79,
    OpRoll = 0x7a,
    OpRot = 0x7b,
    OpSwap = 0x7c,
    OpTuck = 0x7d,
    Op2Drop = 0x6d,
    Op2Dup = 0x6e,
    Op3Dup = 0x6f,
    Op2Over = 0x70,
    Op2Rot = 0x71,
    Op2Swap = 0x72,

    // Splice operations
    OpSize = 0x82,

    // Bitwise logic
    OpEqual = 0x87,
    OpEqualVerify = 0x88,

    // Arithmetic
    Op1Add = 0x8b,
    Op1Sub = 0x8c,
    OpNegate = 0x8f,
    OpAbs = 0x90,
    OpNot = 0x91,
    Op0NotEqual = 0x92,
    OpAdd = 0x93,
    OpSub = 0x94,
    OpBoolAnd = 0x9a,
    OpBoolOr = 0x9b,
    OpNumEqual = 0x9c,
    OpNumEqualVerify = 0x9d,
    OpNumNotEqual = 0x9e,
    OpLessThan = 0x9f,
    OpGreaterThan = 0xa0,
    OpLessThanOrEqual = 0xa1,
    OpGreaterThanOrEqual = 0xa2,
    OpMin = 0xa3,
    OpMax = 0xa4,
    OpWithin = 0xa5,

    // Crypto
    OpRipemd160 = 0xa6,
    OpSha1 = 0xa7,
    OpSha256 = 0xa8,
    OpHash160 = 0xa9,
    OpHash256 = 0xaa,
    OpCodeSeparator = 0xab,
    OpCheckSig = 0xac,
    OpCheckSigVerify = 0xad,
    OpCheckMultisig = 0xae,
    OpCheckMultisigVerify = 0xaf,

    // Expansion
    OpNop1 = 0xb0,
    OpCheckLockTimeVerify = 0xb1, // BIP-65 (was NOP2)
    OpCheckSequenceVerify = 0xb2, // BIP-112 (was NOP3)
    OpNop4 = 0xb3,
    OpNop5 = 0xb4,
    OpNop6 = 0xb5,
    OpNop7 = 0xb6,
    OpNop8 = 0xb7,
    OpNop9 = 0xb8,
    OpNop10 = 0xb9,
}

impl OpCodeEx {
    /// Convert byte to opcode
    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            0x00 => Some(Self::Op0),
            0x51 => Some(Self::Op1),
            0x52 => Some(Self::Op2),
            0x53 => Some(Self::Op3),
            0x54 => Some(Self::Op4),
            0x55 => Some(Self::Op5),
            0x56 => Some(Self::Op6),
            0x57 => Some(Self::Op7),
            0x58 => Some(Self::Op8),
            0x59 => Some(Self::Op9),
            0x5a => Some(Self::Op10),
            0x5b => Some(Self::Op11),
            0x5c => Some(Self::Op12),
            0x5d => Some(Self::Op13),
            0x5e => Some(Self::Op14),
            0x5f => Some(Self::Op15),
            0x60 => Some(Self::Op16),
            0x63 => Some(Self::OpIf),
            0x64 => Some(Self::OpNotIf),
            0x67 => Some(Self::OpElse),
            0x68 => Some(Self::OpEndIf),
            0x69 => Some(Self::OpVerify),
            0x6a => Some(Self::OpReturn),
            0x76 => Some(Self::OpDup),
            0x87 => Some(Self::OpEqual),
            0x88 => Some(Self::OpEqualVerify),
            0xa9 => Some(Self::OpHash160),
            0xac => Some(Self::OpCheckSig),
            0xad => Some(Self::OpCheckSigVerify),
            0xae => Some(Self::OpCheckMultisig),
            0xaf => Some(Self::OpCheckMultisigVerify),
            0xb1 => Some(Self::OpCheckLockTimeVerify),
            0xb2 => Some(Self::OpCheckSequenceVerify),
            _ => None,
        }
    }

    /// Check if opcode is a constant (0-16)
    pub fn is_constant(&self) -> bool {
        matches!(
            self,
            Self::Op0
                | Self::Op1
                | Self::Op2
                | Self::Op3
                | Self::Op4
                | Self::Op5
                | Self::Op6
                | Self::Op7
                | Self::Op8
                | Self::Op9
                | Self::Op10
                | Self::Op11
                | Self::Op12
                | Self::Op13
                | Self::Op14
                | Self::Op15
                | Self::Op16
        )
    }

    /// Get constant value (for OP_1 through OP_16)
    pub fn constant_value(&self) -> Option<i32> {
        match self {
            Self::Op0 => Some(0),
            Self::Op1 => Some(1),
            Self::Op2 => Some(2),
            Self::Op3 => Some(3),
            Self::Op4 => Some(4),
            Self::Op5 => Some(5),
            Self::Op6 => Some(6),
            Self::Op7 => Some(7),
            Self::Op8 => Some(8),
            Self::Op9 => Some(9),
            Self::Op10 => Some(10),
            Self::Op11 => Some(11),
            Self::Op12 => Some(12),
            Self::Op13 => Some(13),
            Self::Op14 => Some(14),
            Self::Op15 => Some(15),
            Self::Op16 => Some(16),
            _ => None,
        }
    }

    /// Check if opcode is disabled (security measure from Bitcoin)
    /// Disabled opcodes: OP_CAT, OP_SUBSTR, OP_LEFT, OP_RIGHT, OP_INVERT,
    /// OP_AND, OP_OR, OP_XOR, OP_2MUL, OP_2DIV, OP_MUL, OP_DIV, OP_MOD, OP_LSHIFT, OP_RSHIFT
    pub fn is_disabled(&self) -> bool {
        let byte = *self as u8;
        // Disabled string operations: 0x7e-0x81 (OP_CAT, OP_SUBSTR, OP_LEFT, OP_RIGHT)
        // Disabled bitwise operations: 0x83-0x86 (OP_INVERT, OP_AND, OP_OR, OP_XOR) - 0x82 is OP_SIZE which is allowed
        // Disabled arithmetic: 0x8d-0x8e (OP_2MUL, OP_2DIV), 0x95-0x99 (OP_MUL, OP_DIV, OP_MOD, OP_LSHIFT, OP_RSHIFT)
        matches!(byte,
            0x7e..=0x81 |  // String ops: CAT, SUBSTR, LEFT, RIGHT
            0x83..=0x86 |  // Bitwise ops: INVERT, AND, OR, XOR
            0x8d..=0x8e |  // Arithmetic: 2MUL, 2DIV
            0x95..=0x99    // Arithmetic: MUL, DIV, MOD, LSHIFT, RSHIFT
        )
    }
}

/// Script builder for easier script construction
pub struct ScriptBuilder {
    bytes: Vec<u8>,
}

impl ScriptBuilder {
    /// Create new script builder
    pub fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    /// Push an opcode
    pub fn push_opcode(mut self, opcode: OpCodeEx) -> Self {
        self.bytes.push(opcode as u8);
        self
    }

    /// Push raw bytes
    pub fn push_bytes(mut self, data: &[u8]) -> Self {
        if data.len() <= 75 {
            self.bytes.push(data.len() as u8);
            self.bytes.extend_from_slice(data);
        } else if data.len() <= 255 {
            self.bytes.push(0x4c); // OP_PUSHDATA1
            self.bytes.push(data.len() as u8);
            self.bytes.extend_from_slice(data);
        } else if data.len() <= 65535 {
            self.bytes.push(0x4d); // OP_PUSHDATA2
            self.bytes
                .extend_from_slice(&(data.len() as u16).to_le_bytes());
            self.bytes.extend_from_slice(data);
        }
        self
    }

    /// Push a number (as script number)
    pub fn push_number(mut self, num: i64) -> Self {
        if num == 0 {
            self.bytes.push(OpCodeEx::Op0 as u8);
        } else if (1..=16).contains(&num) {
            self.bytes.push(OpCodeEx::Op1 as u8 + (num - 1) as u8);
        } else {
            // Encode as script number (little-endian, minimal encoding)
            let bytes = Self::encode_number(num);
            self = self.push_bytes(&bytes);
        }
        self
    }

    /// Build the script
    pub fn build(self) -> Script {
        Script::new(self.bytes)
    }

    /// Encode a number as script number
    fn encode_number(num: i64) -> Vec<u8> {
        if num == 0 {
            return vec![];
        }

        let negative = num < 0;
        let mut abs_value = num.unsigned_abs();
        let mut result = Vec::new();

        while abs_value > 0 {
            result.push((abs_value & 0xff) as u8);
            abs_value >>= 8;
        }

        // SAFETY: result is non-empty because abs_value > 0 entered the loop at least once
        if result.last().unwrap() & 0x80 != 0 {
            result.push(if negative { 0x80 } else { 0x00 });
        } else if negative {
            let len = result.len();
            result[len - 1] |= 0x80;
        }

        result
    }
}

impl Default for ScriptBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opcode_from_byte() {
        assert_eq!(OpCodeEx::from_byte(0x00), Some(OpCodeEx::Op0));
        assert_eq!(OpCodeEx::from_byte(0x51), Some(OpCodeEx::Op1));
        assert_eq!(OpCodeEx::from_byte(0xae), Some(OpCodeEx::OpCheckMultisig));
        assert_eq!(OpCodeEx::from_byte(0xff), None);
    }

    #[test]
    fn test_is_constant() {
        assert!(OpCodeEx::Op0.is_constant());
        assert!(OpCodeEx::Op1.is_constant());
        assert!(OpCodeEx::Op16.is_constant());
        assert!(!OpCodeEx::OpDup.is_constant());
    }

    #[test]
    fn test_constant_value() {
        assert_eq!(OpCodeEx::Op0.constant_value(), Some(0));
        assert_eq!(OpCodeEx::Op1.constant_value(), Some(1));
        assert_eq!(OpCodeEx::Op16.constant_value(), Some(16));
        assert_eq!(OpCodeEx::OpDup.constant_value(), None);
    }

    #[test]
    fn test_script_builder_opcode() {
        let script = ScriptBuilder::new()
            .push_opcode(OpCodeEx::OpDup)
            .push_opcode(OpCodeEx::OpHash160)
            .build();

        assert_eq!(script.bytes.len(), 2);
        assert_eq!(script.bytes[0], 0x76); // OP_DUP
        assert_eq!(script.bytes[1], 0xa9); // OP_HASH160
    }

    #[test]
    fn test_from_byte_all_handled_variants() {
        let expected: &[(u8, OpCodeEx)] = &[
            (0x00, OpCodeEx::Op0), (0x51, OpCodeEx::Op1), (0x52, OpCodeEx::Op2),
            (0x53, OpCodeEx::Op3), (0x54, OpCodeEx::Op4), (0x55, OpCodeEx::Op5),
            (0x56, OpCodeEx::Op6), (0x57, OpCodeEx::Op7), (0x58, OpCodeEx::Op8),
            (0x59, OpCodeEx::Op9), (0x5a, OpCodeEx::Op10), (0x5b, OpCodeEx::Op11),
            (0x5c, OpCodeEx::Op12), (0x5d, OpCodeEx::Op13), (0x5e, OpCodeEx::Op14),
            (0x5f, OpCodeEx::Op15), (0x60, OpCodeEx::Op16),
            (0x63, OpCodeEx::OpIf), (0x64, OpCodeEx::OpNotIf),
            (0x67, OpCodeEx::OpElse), (0x68, OpCodeEx::OpEndIf),
            (0x69, OpCodeEx::OpVerify), (0x6a, OpCodeEx::OpReturn),
            (0x76, OpCodeEx::OpDup), (0x87, OpCodeEx::OpEqual),
            (0x88, OpCodeEx::OpEqualVerify), (0xa9, OpCodeEx::OpHash160),
            (0xac, OpCodeEx::OpCheckSig), (0xad, OpCodeEx::OpCheckSigVerify),
            (0xae, OpCodeEx::OpCheckMultisig), (0xaf, OpCodeEx::OpCheckMultisigVerify),
            (0xb1, OpCodeEx::OpCheckLockTimeVerify), (0xb2, OpCodeEx::OpCheckSequenceVerify),
        ];
        for &(byte, expected_op) in expected {
            assert_eq!(OpCodeEx::from_byte(byte), Some(expected_op), "byte 0x{:02x}", byte);
        }
    }

    #[test]
    fn test_from_byte_unhandled_returns_none() {
        // Stack ops not in from_byte: OpToAltStack(0x6b), OpDrop(0x75), OpSwap(0x7c)
        for byte in [0x6b_u8, 0x75, 0x7c, 0x93, 0x94, 0x01, 0x50, 0xfe] {
            assert_eq!(OpCodeEx::from_byte(byte), None, "byte 0x{:02x} should be None", byte);
        }
    }

    #[test]
    fn test_is_disabled_string_ops() {
        // 0x7e..=0x81 are disabled string ops
        for byte in 0x7e..=0x81_u8 {
            let opcode = unsafe { std::mem::transmute::<u8, OpCodeEx>(byte) };
            assert!(opcode.is_disabled(), "byte 0x{:02x} should be disabled", byte);
        }
    }

    #[test]
    fn test_is_disabled_bitwise_and_arithmetic() {
        // 0x83..=0x86 bitwise, 0x8d..=0x8e 2MUL/2DIV, 0x95..=0x99 MUL/DIV/MOD/LSHIFT/RSHIFT
        let disabled_ranges: &[std::ops::RangeInclusive<u8>] = &[0x83..=0x86, 0x8d..=0x8e, 0x95..=0x99];
        for range in disabled_ranges {
            for byte in range.clone() {
                let opcode = unsafe { std::mem::transmute::<u8, OpCodeEx>(byte) };
                assert!(opcode.is_disabled(), "byte 0x{:02x} should be disabled", byte);
            }
        }
    }

    #[test]
    fn test_is_disabled_allowed_opcodes() {
        let allowed = [
            OpCodeEx::OpDup, OpCodeEx::OpHash160, OpCodeEx::OpCheckSig,
            OpCodeEx::OpEqual, OpCodeEx::OpAdd, OpCodeEx::OpSub,
            OpCodeEx::Op0, OpCodeEx::Op1, OpCodeEx::OpSize,
        ];
        for op in &allowed {
            assert!(!op.is_disabled(), "{:?} should NOT be disabled", op);
        }
    }

    #[test]
    fn test_constant_value_exhaustive() {
        let ops = [
            OpCodeEx::Op0, OpCodeEx::Op1, OpCodeEx::Op2, OpCodeEx::Op3,
            OpCodeEx::Op4, OpCodeEx::Op5, OpCodeEx::Op6, OpCodeEx::Op7,
            OpCodeEx::Op8, OpCodeEx::Op9, OpCodeEx::Op10, OpCodeEx::Op11,
            OpCodeEx::Op12, OpCodeEx::Op13, OpCodeEx::Op14, OpCodeEx::Op15,
            OpCodeEx::Op16,
        ];
        for (i, op) in ops.iter().enumerate() {
            assert_eq!(op.constant_value(), Some(i as i32), "{:?}", op);
        }
    }

    #[test]
    fn test_encode_number_boundary_128() {
        // 127 fits in 1 byte: [0x7f]
        let enc127 = ScriptBuilder::encode_number(127);
        assert_eq!(enc127, vec![0x7f]);
        // 128 needs extra byte because 0x80 is sign bit: [0x80, 0x00]
        let enc128 = ScriptBuilder::encode_number(128);
        assert_eq!(enc128, vec![0x80, 0x00]);
        // -127: [0xff] (0x7f | 0x80)
        let enc_neg127 = ScriptBuilder::encode_number(-127);
        assert_eq!(enc_neg127, vec![0xff]);
        // -128: [0x80, 0x80]
        let enc_neg128 = ScriptBuilder::encode_number(-128);
        assert_eq!(enc_neg128, vec![0x80, 0x80]);
    }

    #[test]
    fn test_encode_number_large_multi_byte() {
        // 256 = 0x0100 -> LE [0x00, 0x01]
        let enc256 = ScriptBuilder::encode_number(256);
        assert_eq!(enc256, vec![0x00, 0x01]);
        // 32767 = 0x7FFF -> LE [0xff, 0x7f]
        let enc32767 = ScriptBuilder::encode_number(32767);
        assert_eq!(enc32767, vec![0xff, 0x7f]);
        // 32768 needs sign byte: [0x00, 0x80, 0x00]
        let enc32768 = ScriptBuilder::encode_number(32768);
        assert_eq!(enc32768, vec![0x00, 0x80, 0x00]);
    }

    #[test]
    fn test_push_number_op_n_range() {
        // Numbers 1-16 should use OP_1 through OP_16 (single byte)
        for n in 1..=16_i64 {
            let script = ScriptBuilder::new().push_number(n).build();
            assert_eq!(script.bytes.len(), 1, "number {} should be single byte", n);
            let expected_byte = 0x50 + n as u8; // OP_1=0x51 .. OP_16=0x60
            assert_eq!(script.bytes[0], expected_byte, "number {}", n);
        }
        // Number 0 should use OP_0 (0x00)
        let script0 = ScriptBuilder::new().push_number(0).build();
        assert_eq!(script0.bytes, vec![0x00]);
    }

    #[test]
    fn test_push_bytes_pushdata1() {
        // 76 bytes triggers OP_PUSHDATA1
        let data = vec![0xAB; 76];
        let script = ScriptBuilder::new().push_bytes(&data).build();
        assert_eq!(script.bytes[0], 0x4c); // OP_PUSHDATA1
        assert_eq!(script.bytes[1], 76);
        assert_eq!(&script.bytes[2..], &data[..]);
    }

    #[test]
    fn test_push_bytes_pushdata2() {
        // 256 bytes triggers OP_PUSHDATA2
        let data = vec![0xCD; 256];
        let script = ScriptBuilder::new().push_bytes(&data).build();
        assert_eq!(script.bytes[0], 0x4d); // OP_PUSHDATA2
        let len = u16::from_le_bytes([script.bytes[1], script.bytes[2]]);
        assert_eq!(len, 256);
        assert_eq!(&script.bytes[3..], &data[..]);
    }

    #[test]
    fn test_script_builder_complex_p2pkh() {
        // Standard P2PKH: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
        let hash = [0x42u8; 20];
        let script = ScriptBuilder::new()
            .push_opcode(OpCodeEx::OpDup)
            .push_opcode(OpCodeEx::OpHash160)
            .push_bytes(&hash)
            .push_opcode(OpCodeEx::OpEqualVerify)
            .push_opcode(OpCodeEx::OpCheckSig)
            .build();
        assert_eq!(script.bytes[0], 0x76); // OP_DUP
        assert_eq!(script.bytes[1], 0xa9); // OP_HASH160
        assert_eq!(script.bytes[2], 20);   // push 20 bytes
        assert_eq!(&script.bytes[3..23], &hash);
        assert_eq!(script.bytes[23], 0x88); // OP_EQUALVERIFY
        assert_eq!(script.bytes[24], 0xac); // OP_CHECKSIG
        assert_eq!(script.bytes.len(), 25);
    }

    #[test]
    fn test_script_builder_bytes() {
        let data = b"hello";
        let script = ScriptBuilder::new().push_bytes(data).build();

        assert_eq!(script.bytes[0], 5); // Length
        assert_eq!(&script.bytes[1..6], data);
    }

    #[test]
    fn test_script_builder_number() {
        let script = ScriptBuilder::new()
            .push_number(0)
            .push_number(1)
            .push_number(16)
            .build();

        assert_eq!(script.bytes[0], 0x00); // OP_0
        assert_eq!(script.bytes[1], 0x51); // OP_1
        assert_eq!(script.bytes[2], 0x60); // OP_16
    }

    #[test]
    fn test_encode_number_positive() {
        let bytes = ScriptBuilder::encode_number(127);
        assert_eq!(bytes, vec![0x7f]);
    }

    #[test]
    fn test_encode_number_negative() {
        let bytes = ScriptBuilder::encode_number(-127);
        assert_eq!(bytes, vec![0xff]);
    }

    #[test]
    fn test_encode_number_zero() {
        let bytes = ScriptBuilder::encode_number(0);
        assert!(bytes.is_empty());
    }
}
