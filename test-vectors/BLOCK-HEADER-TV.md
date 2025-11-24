# BLOCK HEADER TEST VECTORS

height        = 5000
prev_hash     = H("block-4999")
state_root    = 0xDEADBEEF...
proposer      = validator_4
timestamp     = 1712345000

HeaderHash =
  SHA256(height || prev_hash || state_root || proposer || timestamp)

Expected:
  0xe59c49a7a1f9...
