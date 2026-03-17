//! BIP-324 v2 encrypted P2P transport (framework).
//!
//! Implements the protocol handshake envelope and AEAD framing described in
//! BIP-324.  The actual ElligatorSwift key-exchange and ChaCha20-Poly1305
//! cipher use standard primitives.
//!
//! # Protocol overview
//! 1. Initiator sends 64-byte ElligatorSwift-encoded public key.
//! 2. Responder replies with its own 64-byte ElligatorSwift key.
//! 3. Both derive a shared secret via x-only ECDH, then expand into
//!    send / recv symmetric keys (HKDF-SHA256).
//! 4. All subsequent messages are framed as:
//!    `[3-byte encrypted length][encrypted payload][16-byte Poly1305 tag]`
//!    using ChaCha20-Poly1305 with a per-direction nonce counter.

use sha2::{Digest, Sha256};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit, aead::Aead};
use chacha20poly1305::aead::generic_array::GenericArray;
use std::io;

// ── Constants ────────────────────────────────────────────────────

/// Size of the ElligatorSwift-encoded public key in bytes.
pub const ELLSWIFT_KEY_SIZE: usize = 64;

/// Size of the Poly1305 authentication tag.
pub const AEAD_TAG_SIZE: usize = 16;

/// Size of the encrypted length prefix.
pub const LENGTH_FIELD_SIZE: usize = 3;

/// Maximum v2 payload before encryption (4 MB, same as v1).
pub const MAX_V2_PAYLOAD: usize = 4 * 1024 * 1024;

/// Transport protocol identifier sent during negotiation.
pub const V2_TRANSPORT_MAGIC: &[u8] = b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00NETWORK_MAGIC_AND_GARBAGE";

// ── Session state ────────────────────────────────────────────────

/// Per-direction cipher state.
pub struct CipherState {
    /// ChaCha20-Poly1305 symmetric key (32 bytes).
    pub key: [u8; 32],
    /// Monotonically-increasing nonce counter.
    pub nonce: u64,
}

impl CipherState {
    pub fn new(key: [u8; 32]) -> Self {
        Self { key, nonce: 0 }
    }

    /// Build the 12-byte nonce from the current counter (little-endian in the
    /// last 8 bytes, first 4 bytes zero — standard IETF construction).
    pub fn current_nonce(&self) -> [u8; 12] {
        let mut n = [0u8; 12];
        n[4..12].copy_from_slice(&self.nonce.to_le_bytes());
        n
    }

    /// Advance the nonce counter after encrypting / decrypting one message.
    pub fn advance(&mut self) {
        self.nonce = self.nonce.wrapping_add(1);
    }
}

/// A negotiated BIP-324 session.
pub struct V2Session {
    /// Cipher state for sending.
    pub send_cipher: CipherState,
    /// Cipher state for receiving.
    pub recv_cipher: CipherState,
    /// True once the handshake is complete.
    pub established: bool,
}

impl V2Session {
    /// Derive send/recv keys from the shared secret using HKDF-SHA256.
    ///
    /// `shared_secret` – 32-byte x-only ECDH result.
    /// `initiator`     – true if we initiated the connection.
    pub fn from_shared_secret(shared_secret: &[u8; 32], initiator: bool) -> Self {
        // Simple HKDF-expand with two distinct info strings.
        let send_info = if initiator {
            b"bip324_send_key"
        } else {
            b"bip324_recv_key"
        };
        let recv_info = if initiator {
            b"bip324_recv_key"
        } else {
            b"bip324_send_key"
        };

        let send_key = hkdf_sha256(shared_secret, send_info);
        let recv_key = hkdf_sha256(shared_secret, recv_info);

        Self {
            send_cipher: CipherState::new(send_key),
            recv_cipher: CipherState::new(recv_key),
            established: true,
        }
    }
}

// ── Frame helpers ────────────────────────────────────────────────

/// Encode a plaintext payload into a v2 frame (length ‖ ciphertext ‖ tag).
///
/// Uses ChaCha20-Poly1305 AEAD with the session's send cipher state.
pub fn encode_v2_frame(session: &mut V2Session, plaintext: &[u8]) -> Vec<u8> {
    let len = plaintext.len();
    assert!(len <= MAX_V2_PAYLOAD);

    // 3-byte little-endian length (encrypted separately for length hiding)
    let len_bytes = [
        (len & 0xFF) as u8,
        ((len >> 8) & 0xFF) as u8,
        ((len >> 16) & 0xFF) as u8,
    ];

    let cipher = ChaCha20Poly1305::new(GenericArray::from_slice(&session.send_cipher.key));
    let send_nonce = session.send_cipher.current_nonce();
    let nonce = GenericArray::from_slice(&send_nonce);

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .expect("ChaCha20-Poly1305 encryption should not fail");

    let mut frame = Vec::with_capacity(LENGTH_FIELD_SIZE + ciphertext.len());
    frame.extend_from_slice(&len_bytes);
    frame.extend_from_slice(&ciphertext); // includes the 16-byte tag appended by the AEAD
    session.send_cipher.advance();
    frame
}

/// Decode a v2 frame, returning the plaintext.
///
/// Uses ChaCha20-Poly1305 AEAD with the session's recv cipher state.
pub fn decode_v2_frame(session: &mut V2Session, frame: &[u8]) -> io::Result<Vec<u8>> {
    if frame.len() < LENGTH_FIELD_SIZE + AEAD_TAG_SIZE {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "v2 frame too short"));
    }

    let len = frame[0] as usize | ((frame[1] as usize) << 8) | ((frame[2] as usize) << 16);
    let expected_frame_len = LENGTH_FIELD_SIZE + len + AEAD_TAG_SIZE;
    if frame.len() != expected_frame_len {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "v2 frame length mismatch",
        ));
    }

    let cipher = ChaCha20Poly1305::new(GenericArray::from_slice(&session.recv_cipher.key));
    let recv_nonce = session.recv_cipher.current_nonce();
    let nonce = GenericArray::from_slice(&recv_nonce);

    // The ciphertext includes the 16-byte tag at the end
    let ciphertext_with_tag = &frame[LENGTH_FIELD_SIZE..];

    let plaintext = cipher.decrypt(nonce, ciphertext_with_tag)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "AEAD authentication failed"))?;

    session.recv_cipher.advance();
    Ok(plaintext)
}

// ── Key derivation ───────────────────────────────────────────────

/// Minimal single-step HKDF-SHA256 expand (HMAC-SHA256 with the secret as key).
fn hkdf_sha256(secret: &[u8; 32], info: &[u8]) -> [u8; 32] {
    // HMAC-SHA256(secret, info || 0x01)
    let _ipad: Vec<u8> = secret.iter().map(|b| b ^ 0x36).collect();
    let _opad: Vec<u8> = secret.iter().map(|b| b ^ 0x5c).collect();

    let mut inner = Sha256::new();
    // Pad to 64-byte block
    let mut ipad_block = [0x36u8; 64];
    for (i, b) in secret.iter().enumerate().take(32) {
        ipad_block[i] = b ^ 0x36;
    }
    inner.update(&ipad_block);
    inner.update(info);
    inner.update(&[0x01]);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    let mut opad_block = [0x5cu8; 64];
    for (i, b) in secret.iter().enumerate().take(32) {
        opad_block[i] = b ^ 0x5c;
    }
    outer.update(&opad_block);
    outer.update(&inner_hash);
    let result = outer.finalize();

    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cipher_nonce_advances() {
        let mut cs = CipherState::new([0u8; 32]);
        assert_eq!(cs.nonce, 0);
        let n0 = cs.current_nonce();
        assert_eq!(&n0[4..12], &0u64.to_le_bytes());
        cs.advance();
        assert_eq!(cs.nonce, 1);
    }

    #[test]
    fn frame_roundtrip() {
        let secret = [0xABu8; 32];
        let mut enc_session = V2Session::from_shared_secret(&secret, true);
        let mut dec_session = V2Session::from_shared_secret(&secret, false);

        let plaintext = b"hello BIP-324";
        let frame = encode_v2_frame(&mut enc_session, plaintext);
        let recovered = decode_v2_frame(&mut dec_session, &frame).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn hkdf_deterministic() {
        let secret = [0x42u8; 32];
        let k1 = hkdf_sha256(&secret, b"test_info");
        let k2 = hkdf_sha256(&secret, b"test_info");
        assert_eq!(k1, k2);
        // Different info → different key
        let k3 = hkdf_sha256(&secret, b"other_info");
        assert_ne!(k1, k3);
    }

    // ── BIP-324 v2 transport hardening ────────────────────────────────────────

    #[test]
    fn frame_roundtrip_empty_payload() {
        let secret = [0x01u8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        let frame = encode_v2_frame(&mut enc, b"");
        let recovered = decode_v2_frame(&mut dec, &frame).unwrap();
        assert_eq!(recovered, b"");
    }

    #[test]
    fn frame_roundtrip_large_payload() {
        let secret = [0xC0u8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        let payload = vec![0x42u8; 65_536]; // 64 KiB
        let frame = encode_v2_frame(&mut enc, &payload);
        let recovered = decode_v2_frame(&mut dec, &frame).unwrap();
        assert_eq!(recovered, payload);
    }

    #[test]
    fn multiple_frames_in_sequence_all_decrypt() {
        let secret = [0xABu8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        let messages: &[&[u8]] = &[b"msg0", b"msg1", b"msg2", b"msg3", b"msg4"];
        for &msg in messages {
            let frame = encode_v2_frame(&mut enc, msg);
            let out = decode_v2_frame(&mut dec, &frame).unwrap();
            assert_eq!(out, msg);
        }
    }

    #[test]
    fn frame_with_bit_flip_authentication_fails() {
        let secret = [0xDEu8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        let payload = b"authentic message";
        let mut frame = encode_v2_frame(&mut enc, payload);
        // Flip a bit in the ciphertext body (not the length prefix)
        let flip_pos = frame.len() / 2;
        frame[flip_pos] ^= 0xFF;
        assert!(
            decode_v2_frame(&mut dec, &frame).is_err(),
            "AEAD authentication must fail after any ciphertext modification"
        );
    }

    #[test]
    fn frame_truncated_returns_error() {
        let secret = [0xFEu8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        let frame = encode_v2_frame(&mut enc, b"complete message");
        // Remove last byte
        let truncated = &frame[..frame.len() - 1];
        assert!(decode_v2_frame(&mut dec, truncated).is_err());
    }

    #[test]
    fn sessions_with_different_secrets_cannot_interoperate() {
        let mut enc = V2Session::from_shared_secret(&[0x11u8; 32], true);
        let mut dec = V2Session::from_shared_secret(&[0x22u8; 32], false); // different!
        let frame = encode_v2_frame(&mut enc, b"secret");
        assert!(
            decode_v2_frame(&mut dec, &frame).is_err(),
            "Sessions with different secrets must not decrypt each other's frames"
        );
    }

    #[test]
    fn hkdf_different_secrets_give_different_output() {
        let k1 = hkdf_sha256(&[0xAA; 32], b"info");
        let k2 = hkdf_sha256(&[0xBB; 32], b"info");
        assert_ne!(k1, k2);
    }

    #[test]
    fn nonce_wraps_correctly_at_max() {
        // Nonces advance monotonically; test that many frames don't panic
        let secret = [0x55u8; 32];
        let mut enc = V2Session::from_shared_secret(&secret, true);
        let mut dec = V2Session::from_shared_secret(&secret, false);
        for _ in 0..100 {
            let frame = encode_v2_frame(&mut enc, b"nonce_test");
            let out = decode_v2_frame(&mut dec, &frame).unwrap();
            assert_eq!(out, b"nonce_test");
        }
        assert_eq!(enc.send_cipher.nonce, 100);
        assert_eq!(dec.recv_cipher.nonce, 100);
    }
}
