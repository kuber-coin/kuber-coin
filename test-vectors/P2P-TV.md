# P2P MESSAGE ENCODING TEST VECTORS

## BlockMessage
Encoding (protobuf-hex):
  0a 20 41 41 41 ... (block hash)
  12 0c 08 01 ...

## VoteMessage
Input:
  height  = 55
  round   = 1
  type    = PREVOTE
  hash    = 0xAADDBBCC
Output:
  Encoded Protobuf:
  08 37 10 01 1A 04 AA DD BB CC ...
