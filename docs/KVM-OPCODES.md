# KUBER VIRTUAL MACHINE — OPCODES SPEC (KVM-OPCODES.md)

## Overview
This document defines the full KVM instruction set, bytecode format, execution semantics, cost model, and deterministic guarantees. KVM is minimal, deterministic, 256-bit, and designed for verifiable on-chain execution.

---

# 1. Machine Model
- Word size: 256-bit unsigned (uint256)
- Registers: R0–R7 (8 general registers)
- Stack: LIFO, max depth 1024
- Memory: 64 KB linear memory
- Storage: host-controlled deterministic key/value DB
- Hash: SHA-256 (required)
- No floats, no randomness, no system-time

---

# 2. Bytecode Layout
```
| MAGIC "KVM1" (4B) |
| VERSION (1B)      |
| FLAGS (1B)        |
| CODE_SIZE (4B)    |
| DATA_SIZE (4B)    |
| RESERVED (6B)     |
| CODE_BYTES (...)  |
| DATA_BYTES (...)  |
```

---

# 3. Error Codes
- ERR_INVALID_OPCODE (0xE1)
- ERR_STACK_UNDERFLOW (0xE2)
- ERR_STACK_OVERFLOW (0xE3)
- ERR_DIV_ZERO (0xE4)
- ERR_MEMORY_OOB (0xE5)
- ERR_SIGCHK_FAIL (0xE6)
- ERR_INVALID_JUMP (0xE7)
- ERR_NO_END (0xE8)
- ERR_COST_EXCEEDED (0xE9)
- ERR_STORAGE_FAIL (0xEA)
- ERR_INVALID_IMMEDIATE (0xEB)

---

# 4. Cost Model
Constant per-op execution cost:
- Basic ops: 1
- Memory ops: 2
- Crypto ops: 5
- Signature ops: 10
- Control flow: 3
- Storage ops: 8

`COST_LIMIT` = max cost per TX.

---

# 5. Execution Loop
```
pc = 0
cost = 0
while true:
  op = code[pc++]
  cost += COST(op)
  if cost > COST_LIMIT: fail(ERR_COST_EXCEEDED)
  execute(op)
```

Execution must end with opcode `END`.

---

# 6. Opcode Table

## 0x00–0x0F : Control & Misc
```
0x00 END
0x01 NOP
```

## 0x10–0x1F : Constants / Pushes
```
0x10 PUSH_IMM (32B immediate)
0x11 PUSH_8   (8B immediate)
0x12 PUSH_DATA (offset,len)
```

## 0x20–0x2F : Stack Ops
```
0x20 POP
0x21 DUP n
0x22 SWAP n
```

## 0x30–0x3F : Register Ops
```
0x30 LOADR reg
0x31 STRR reg
0x32 MOVR dst,src
```

## 0x40–0x4F : Arithmetic (uint256)
```
0x40 ADD
0x41 SUB
0x42 MUL
0x43 DIV
0x44 MOD
0x45 POW
```

## 0x50–0x5F : Bitwise Ops
```
0x50 AND
0x51 OR
0x52 XOR
0x53 NOT
```

## 0x60–0x6F : Shifts
```
0x60 SHL bits
0x61 SHR bits
```

## 0x70–0x7F : Hash Ops
```
0x70 HASH_SHA256 n
0x71 HASH_SHA256_BYTES len
0x72 HASH_BLAKE3 n (optional)
```

## 0x80–0x8F : Crypto / Signatures
```
0x80 SIGCHK (type)
0x81 EC_RECOVER
```

## 0x90–0x9F : Memory Ops
```
0x90 MEM_READ offset,len
0x91 MEM_WRITE offset,len
```

## 0xA0–0xAF : Storage Ops
```
0xA0 SLOAD key(32B)
0xA1 SSTORE key(32B)
```

## 0xB0–0xBF : Control Flow
```
0xB0 JUMP target
0xB1 JUMPI target
0xB2 CALL target
0xB3 RET
```

## 0xC0–0xCF : Logging
```
0xC0 LOG n_topics,data_len
```

## 0xD0–0xDF : Comparators & Extras
```
0xD0 PUSH_IMM32
0xD1 EQ
0xD2 LT
0xD3 GT
```

## 0xE0–0xEF : Debug
```
0xE0 BREAKPOINT
```

## 0xF0–0xFF : System
```
0xF0 VERIFY_MINT_PROOF
```

---

# 7. Example: Simple Arithmetic
```
PUSH_IMM 0x...01
PUSH_IMM 0x...02
ADD
END
```

---

# 8. Example: MintProof Verification
```
; stack: [mint_id, owner, meta_hash, nonce]
VERIFY_MINT_PROOF
SSTORE <mint_key>
END
```

---

# 9. Determinism Guarantees
- No floating point
- All arithmetic modulo 2^256
- No nondeterministic syscalls
- Hashes must be canonical SHA-256
- Signature verification deterministic
- Identical bytecode → identical execution trace

---

# 10. Appendix: Quick Reference (Compact)
```
END NOP PUSH POP DUP SWAP
LOADR STRR MOVR
ADD SUB MUL DIV MOD POW
AND OR XOR NOT
SHL SHR
HASH_SHA256 HASH_SHA256_BYTES
SIGCHK EC_RECOVER
MEM_READ MEM_WRITE
SLOAD SSTORE
JUMP JUMPI CALL RET
LOG EQ LT GT
VERIFY_MINT_PROOF
```

---
