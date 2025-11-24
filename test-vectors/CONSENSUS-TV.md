# CONSENSUS TEST VECTORS

## Prevote
Input:
  height = 100
  round  = 2
  block_hash = H("block-100-r2")
Output:
  Signature over (height||round||block_hash)

## Precommit
Input:
  lock(B) where B = block hash 0xAA...
Output:
  Precommit(B) signed by validator.

## Commit Rule
Given:
  precommits = {V1, V2, V3}
  total_stake = 100
  signed_stake = 72
Condition:
  72 >= (2/3)*100 = 66.66
Output:
  COMMIT VALID
