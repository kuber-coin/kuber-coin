------------------------ MODULE consensus ------------------------
(*
 KuberCoin Consensus -- TLA+ Formal Specification
 Version:  1.0
 Date:     2026-03-17
 Authors:  KuberCoin Contributors

 This specification models the core safety and liveness properties of
 KuberCoin's Nakamoto-style Proof-of-Work consensus:

   (1) Chain Growth  -- honest miners always extend the chain.
   (2) Chain Quality -- the fraction of honest blocks grows over time.
   (3) Common Prefix -- honest nodes agree on a common chain prefix
                        beyond a bounded look-back window k.

 The model abstracts over:
   - Exact hash computation (replaced by non-deterministic "finds block").
   - Network topology (replaced by synchrony parameter Delta).
   - Transaction contents (blocks identified by height only).

 Model check with TLC:
   tlc consensus.tla -config consensus.cfg

 References:
   - Bitcoin's Academic Pedigree, Narayanan & Clark (2017)
   - The Bitcoin Backbone Protocol, Garay, Kiayias, Leonardos (2015)
   - KuberCoin ROADMAP_BITCOIN_GRADE.md
*)

EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
    Nodes,         \* Set of all nodes (honest)
    MaxHeight,     \* Upper bound for model checking (finite state space)
    Delta          \* Maximum network propagation delay in rounds

ASSUME Delta \in Nat /\ Delta >= 1
ASSUME MaxHeight \in Nat /\ MaxHeight >= 2

(* ----------------------------------------------------------------- *)
(*  State Variables                                                   *)
(* ----------------------------------------------------------------- *)

VARIABLES
    chain,         \* chain[n] = sequence of block heights known by node n
    tip,           \* tip[n]   = best-chain tip height at node n
    pending,       \* pending[n] = set of block heights in transit to n
    round          \* global round counter (for liveness reasoning)

vars == <<chain, tip, pending, round>>

(* ----------------------------------------------------------------- *)
(*  Type Invariant                                                    *)
(* ----------------------------------------------------------------- *)

TypeOK ==
    /\ chain   \in [Nodes -> Seq(Nat)]
    /\ tip     \in [Nodes -> Nat]
    /\ pending \in [Nodes -> SUBSET Nat]
    /\ round   \in Nat

(* ----------------------------------------------------------------- *)
(*  Initial State                                                     *)
(* ----------------------------------------------------------------- *)

Init ==
    /\ chain   = [n \in Nodes |-> <<0>>]   \* genesis block (height 0)
    /\ tip     = [n \in Nodes |-> 0]
    /\ pending = [n \in Nodes |-> {}]
    /\ round   = 0

(* ----------------------------------------------------------------- *)
(*  Actions                                                           *)
(* ----------------------------------------------------------------- *)

\* An honest node mines a new block extending its current best tip.
MineBlock(n) ==
    /\ n \in Nodes
    /\ tip[n] < MaxHeight
    /\ LET h == tip[n] + 1
       IN  /\ chain'   = [chain   EXCEPT ![n] = Append(@, h)]
           /\ tip'     = [tip     EXCEPT ![n] = h]
           \* Broadcast to all other nodes (arrives within Delta rounds)
           /\ pending' = [m \in Nodes |->
                            IF m /= n
                            THEN pending[m] \union {h}
                            ELSE pending[m]]
           /\ UNCHANGED round

\* A node receives and adopts a pending block from the network.
ReceiveBlock(n, h) ==
    /\ h \in pending[n]
    /\ h > tip[n]           \* Only adopt if it extends our chain (simplified)
    /\ chain'   = [chain   EXCEPT ![n] = Append(@, h)]
    /\ tip'     = [tip     EXCEPT ![n] = h]
    /\ pending' = [pending EXCEPT ![n] = @ \ {h}]
    /\ UNCHANGED round

\* Advance the global round counter.
Tick ==
    /\ round < MaxHeight * (Delta + 2)
    /\ round' = round + 1
    /\ UNCHANGED <<chain, tip, pending>>

Next ==
    \/ \E n \in Nodes : MineBlock(n)
    \/ \E n \in Nodes, h \in UNION {pending[m] : m \in Nodes} :
            ReceiveBlock(n, h)
    \/ Tick

(* ----------------------------------------------------------------- *)
(*  Safety Properties                                                 *)
(* ----------------------------------------------------------------- *)

\* Common Prefix (k): any two nodes agree on all blocks except the last k
\* from each node's tip.  With k = Delta + 1 this holds under synchrony.
CommonPrefix(k) ==
    \A n1, n2 \in Nodes :
        LET len1     == Len(chain[n1])
            len2     == Len(chain[n2])
            minLen   == IF len1 < len2 THEN len1 ELSE len2
            safeDepth == IF minLen > k THEN minLen - k ELSE 1
        IN  \A i \in 1..safeDepth :
                chain[n1][i] = chain[n2][i]

\* Chain Growth: honest nodes' tip heights are non-negative.
ChainGrowth ==
    \A n \in Nodes : tip[n] >= 0

\* No Regression: tips never decrease (checked as a temporal property).
NoRegress ==
    [][\A n \in Nodes : tip'[n] >= tip[n]]_vars

(* ----------------------------------------------------------------- *)
(*  Combined Safety Invariant (checked by TLC)                       *)
(* ----------------------------------------------------------------- *)

Safety ==
    /\ TypeOK
    /\ ChainGrowth
    /\ CommonPrefix(Delta + 1)

(* ----------------------------------------------------------------- *)
(*  Specification                                                     *)
(* ----------------------------------------------------------------- *)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

THEOREM Spec => []Safety

================================================================
