# KVM OPCODE TEST VECTORS

## ADD (0x40)
Input:
  stack: [0x01, 0x02]
Bytecode:
  0x40 (ADD)
Output:
  stack: [0x03]

## MUL (0x42)
Input:
  stack: [0x05, 0x06]
Bytecode:
  0x42 (MUL)
Output:
  stack: [0x1E]

## SHL (0x60)
Input:
  stack: [0x01], imm=4
Bytecode:
  0x60 0x04
Output:
  stack: [0x10]

## HASH_SHA256 (0x70)
Input:
  data: "kuber"
Output:
  SHA256("kuber") = 
  0x40 0x54 0x59 F3 0x19 0xFA 0xC8 0xE5 ...

## VERIFY_MINT_PROOF (0xF0)
Input:
  mint_id = H(owner||meta||nonce)
  proof   = H(mint_id)
Bytecode:
  0xF0
Output:
  MUST return success if proof == H(mint_id)
  ELSE error 0xE6 (ERR_SIGCHK_FAIL)
