# MINTPROOF TEST VECTORS

owner      = 0xABCDEF1234
metadata   = "ipfs://kuber-test"
nonce      = 42

mint_id =
  SHA256(owner || SHA256(metadata) || nonce)
  = 0xa4f3c98bc1d2...

proof =
  SHA256(mint_id)
  = 0xf34c9aa12cd...

Chain MUST accept:
  VERIFY_MINT_PROOF(mint_id, proof) == TRUE
