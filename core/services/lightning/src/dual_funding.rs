//! Dual-funded channel (interactive-tx) protocol stubs.
//!
//! Implements the interactive transaction construction protocol where
//! both parties contribute inputs/outputs to the funding transaction.

use serde::{Deserialize, Serialize};

use crate::{LightningError, Result};

/// State of the interactive-tx negotiation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InteractiveTxState {
    /// Waiting for peer's input/output additions
    AwaitingPeer,
    /// We can add more inputs/outputs
    OurTurn,
    /// Both parties sent tx_complete
    Complete,
    /// Negotiation failed
    Failed,
}

/// An input contribution to the dual-funded channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxAddInput {
    /// Channel ID
    pub channel_id: [u8; 32],
    /// Serial ID for ordering
    pub serial_id: u64,
    /// Previous outpoint txid
    pub prevtx_txid: [u8; 32],
    /// Previous outpoint vout
    pub prevtx_vout: u32,
    /// Amount of the input (satoshis)
    pub amount: u64,
    /// Sequence number
    pub sequence: u32,
}

/// An output contribution to the dual-funded channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxAddOutput {
    /// Channel ID
    pub channel_id: [u8; 32],
    /// Serial ID for ordering
    pub serial_id: u64,
    /// Output value (satoshis)
    pub amount: u64,
    /// Output script
    pub script: Vec<u8>,
}

/// Remove a previously added input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxRemoveInput {
    pub channel_id: [u8; 32],
    pub serial_id: u64,
}

/// Remove a previously added output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxRemoveOutput {
    pub channel_id: [u8; 32],
    pub serial_id: u64,
}

/// Signal that we're done adding inputs/outputs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxComplete {
    pub channel_id: [u8; 32],
}

/// Manages the interactive-tx negotiation for dual-funded channels.
#[derive(Debug)]
pub struct DualFundingNegotiator {
    channel_id: [u8; 32],
    state: InteractiveTxState,
    is_initiator: bool,
    /// Our contributed inputs
    our_inputs: Vec<TxAddInput>,
    /// Our contributed outputs
    our_outputs: Vec<TxAddOutput>,
    /// Peer's contributed inputs
    peer_inputs: Vec<TxAddInput>,
    /// Peer's contributed outputs
    peer_outputs: Vec<TxAddOutput>,
    /// Whether we've sent tx_complete
    our_complete: bool,
    /// Whether peer has sent tx_complete
    peer_complete: bool,
    /// Next serial ID for our contributions (even if initiator, odd if not)
    next_serial: u64,
}

impl DualFundingNegotiator {
    /// Create a new negotiator.
    ///
    /// `is_initiator`: true if we sent open_channel2
    pub fn new(channel_id: [u8; 32], is_initiator: bool) -> Self {
        Self {
            channel_id,
            state: if is_initiator {
                InteractiveTxState::OurTurn
            } else {
                InteractiveTxState::AwaitingPeer
            },
            is_initiator,
            our_inputs: Vec::new(),
            our_outputs: Vec::new(),
            peer_inputs: Vec::new(),
            peer_outputs: Vec::new(),
            our_complete: false,
            peer_complete: false,
            // Initiator uses even serial IDs, responder uses odd
            next_serial: if is_initiator { 0 } else { 1 },
        }
    }

    /// Add one of our inputs to the negotiation.
    pub fn add_input(
        &mut self,
        prevtx_txid: [u8; 32],
        prevtx_vout: u32,
        amount: u64,
    ) -> Result<TxAddInput> {
        if self.state != InteractiveTxState::OurTurn {
            return Err(LightningError::PaymentFailed("not our turn".into()));
        }

        let serial_id = self.next_serial;
        self.next_serial += 2; // skip by 2 to maintain even/odd parity

        let input = TxAddInput {
            channel_id: self.channel_id,
            serial_id,
            prevtx_txid,
            prevtx_vout,
            amount,
            sequence: 0xFFFFFFFD, // RBF-enabled
        };

        self.our_inputs.push(input.clone());
        self.our_complete = false;
        self.state = InteractiveTxState::AwaitingPeer;

        Ok(input)
    }

    /// Add one of our outputs to the negotiation.
    pub fn add_output(&mut self, amount: u64, script: Vec<u8>) -> Result<TxAddOutput> {
        if self.state != InteractiveTxState::OurTurn {
            return Err(LightningError::PaymentFailed("not our turn".into()));
        }

        let serial_id = self.next_serial;
        self.next_serial += 2;

        let output = TxAddOutput {
            channel_id: self.channel_id,
            serial_id,
            amount,
            script,
        };

        self.our_outputs.push(output.clone());
        self.our_complete = false;
        self.state = InteractiveTxState::AwaitingPeer;

        Ok(output)
    }

    /// Handle a peer's input addition.
    pub fn handle_peer_input(&mut self, input: TxAddInput) -> Result<()> {
        if self.state != InteractiveTxState::AwaitingPeer {
            return Err(LightningError::PaymentFailed(
                "unexpected peer input".into(),
            ));
        }
        // Verify serial ID parity (peer uses opposite parity)
        let expected_odd = self.is_initiator;
        if (input.serial_id % 2 == 1) != expected_odd {
            return Err(LightningError::PaymentFailed(
                "peer serial_id has wrong parity".into(),
            ));
        }

        self.peer_inputs.push(input);
        self.peer_complete = false;
        self.state = InteractiveTxState::OurTurn;

        Ok(())
    }

    /// Handle a peer's output addition.
    pub fn handle_peer_output(&mut self, output: TxAddOutput) -> Result<()> {
        if self.state != InteractiveTxState::AwaitingPeer {
            return Err(LightningError::PaymentFailed(
                "unexpected peer output".into(),
            ));
        }

        self.peer_outputs.push(output);
        self.peer_complete = false;
        self.state = InteractiveTxState::OurTurn;

        Ok(())
    }

    /// Signal that we're done adding inputs/outputs.
    pub fn send_tx_complete(&mut self) -> Result<TxComplete> {
        if self.state != InteractiveTxState::OurTurn {
            return Err(LightningError::PaymentFailed("not our turn".into()));
        }

        self.our_complete = true;
        self.state = if self.peer_complete {
            InteractiveTxState::Complete
        } else {
            InteractiveTxState::AwaitingPeer
        };

        Ok(TxComplete {
            channel_id: self.channel_id,
        })
    }

    /// Handle peer's tx_complete message.
    pub fn handle_peer_complete(&mut self) -> Result<()> {
        self.peer_complete = true;
        if self.our_complete {
            self.state = InteractiveTxState::Complete;
        } else {
            self.state = InteractiveTxState::OurTurn;
        }
        Ok(())
    }

    /// Check if negotiation is complete.
    pub fn is_complete(&self) -> bool {
        self.state == InteractiveTxState::Complete
    }

    /// Get total input amount from both parties.
    pub fn total_input_amount(&self) -> u64 {
        let ours: u64 = self.our_inputs.iter().map(|i| i.amount).sum();
        let theirs: u64 = self.peer_inputs.iter().map(|i| i.amount).sum();
        ours.saturating_add(theirs)
    }

    /// Get total output amount from both parties.
    pub fn total_output_amount(&self) -> u64 {
        let ours: u64 = self.our_outputs.iter().map(|o| o.amount).sum();
        let theirs: u64 = self.peer_outputs.iter().map(|o| o.amount).sum();
        ours.saturating_add(theirs)
    }

    /// Get current state.
    pub fn state(&self) -> InteractiveTxState {
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dual_funding_basic_flow() {
        let channel_id = [1u8; 32];
        let mut initiator = DualFundingNegotiator::new(channel_id, true);
        let mut responder = DualFundingNegotiator::new(channel_id, false);

        // Initiator adds input
        let input = initiator.add_input([0xAA; 32], 0, 100_000).unwrap();
        assert_eq!(input.serial_id % 2, 0); // even
        responder.handle_peer_input(input).unwrap();

        // Responder adds input
        let input2 = responder.add_input([0xBB; 32], 0, 50_000).unwrap();
        assert_eq!(input2.serial_id % 2, 1); // odd
        initiator.handle_peer_input(input2).unwrap();

        // Initiator adds output + sends complete
        let _output = initiator.add_output(140_000, vec![0x00, 0x14]).unwrap();
        responder
            .handle_peer_output(_output)
            .unwrap();

        // Responder sends complete
        responder.send_tx_complete().unwrap();
        initiator.handle_peer_complete().unwrap();

        // Initiator sends complete
        initiator.send_tx_complete().unwrap();
        responder.handle_peer_complete().unwrap();

        assert!(initiator.is_complete());
        assert!(responder.is_complete());
    }

    #[test]
    fn test_wrong_turn_rejected() {
        let mut neg = DualFundingNegotiator::new([1u8; 32], false);
        // Responder tries to add input before it's their turn
        let result = neg.add_input([0xAA; 32], 0, 100_000);
        assert!(result.is_err());
    }

    #[test]
    fn test_serial_parity_enforcement() {
        let mut initiator = DualFundingNegotiator::new([1u8; 32], true);
        // Initiator expects peer to use odd serial IDs
        let bad_input = TxAddInput {
            channel_id: [1u8; 32],
            serial_id: 2, // even — wrong for responder
            prevtx_txid: [0xCC; 32],
            prevtx_vout: 0,
            amount: 50_000,
            sequence: 0xFFFFFFFD,
        };
        // First we need to be in AwaitingPeer state
        let _input = initiator.add_input([0xAA; 32], 0, 100_000).unwrap();
        let result = initiator.handle_peer_input(bad_input);
        assert!(result.is_err());
    }

    #[test]
    fn test_total_amounts() {
        let mut neg = DualFundingNegotiator::new([1u8; 32], true);
        neg.add_input([0xAA; 32], 0, 100_000).unwrap();
        assert_eq!(neg.total_input_amount(), 100_000);
        assert_eq!(neg.total_output_amount(), 0);
    }
}
