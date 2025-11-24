# STATE ROOT TEST VECTORS

Accounts:
  A: balance 10
  B: balance 20

Merkle Leaves:
  leaf_A = H("A||10")
  leaf_B = H("B||20")

Merkle Root:
  root = H( H(leaf_A) || H(leaf_B) )

Expected:
  root = 0x9981fc3d0a9b...
