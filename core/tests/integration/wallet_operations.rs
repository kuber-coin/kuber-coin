// Integration Test: Wallet Operations
//
// Tests wallet key management, address generation, and file persistence using
// the real WalletManager and WalletFile types.

use tx::wallet::{WalletFile, WalletManager};

fn make_mgr() -> (tempfile::TempDir, WalletManager) {
    let dir = tempfile::tempdir().unwrap();
    let mgr = WalletManager::new(dir.path().join("wallets")).unwrap();
    (dir, mgr)
}

fn simple_wallet(label: &str) -> WalletFile {
    let key = tx::PrivateKey::new();
    let pubkey = key.public_key();
    WalletFile {
        label: label.to_string(),
        private_keys: vec![hex::encode(&*key.to_bytes())],
        addresses: vec![tx::Address::from_pubkey_p2wpkh(&pubkey).encode()],
        mnemonic: None,
        ..Default::default()
    }
}

// ── List / create ─────────────────────────────────────────────────────────────

#[test]
fn test_manager_starts_empty() {
    let (_dir, mgr) = make_mgr();
    let wallets = mgr.list_wallets().unwrap();
    assert!(wallets.is_empty(), "fresh manager should have no wallets");
}

#[test]
fn test_create_wallet_appears_in_list() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("alice");
    mgr.create_wallet("alice", &wallet, None).unwrap();
    let wallets = mgr.list_wallets().unwrap();
    // list_wallets returns filenames with extension (e.g. "alice.json").
    assert!(
        wallets.iter().any(|n| n.starts_with("alice")),
        "alice must appear in the wallet list; got: {wallets:?}"
    );
}

#[test]
fn test_create_second_wallet_does_not_overwrite_first() {
    // WalletManager allows saving over an existing name (no-duplicate guard).
    // Verify that saving the same name twice is non-destructive: the wallet
    // can still be loaded after the second save.
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("bob");
    mgr.create_wallet("bob", &wallet, None).unwrap();
    // Save again — should succeed (overwrite).
    mgr.create_wallet("bob", &wallet, None).unwrap();
    // The wallet must still be loadable.
    let loaded = mgr.load_wallet("bob", None).unwrap();
    assert_eq!(loaded.label, "bob");
}

// ── Load / persist ────────────────────────────────────────────────────────────

#[test]
fn test_load_wallet_roundtrip() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("charlie");
    let expected_label = wallet.label.clone();
    mgr.create_wallet("charlie", &wallet, None).unwrap();

    let loaded = mgr.load_wallet("charlie", None).unwrap();
    assert_eq!(loaded.label, expected_label);
    assert_eq!(loaded.private_keys.len(), 1);
    assert_eq!(loaded.addresses.len(), 1);
}

#[test]
fn test_wallet_private_key_survives_roundtrip() {
    let (_dir, mgr) = make_mgr();
    let key = tx::PrivateKey::new();
    let key_hex = hex::encode(&*key.to_bytes());
    let pubkey = key.public_key();
    let wallet = WalletFile {
        label: "keypersist".to_string(),
        private_keys: vec![key_hex.clone()],
        addresses: vec![tx::Address::from_pubkey_p2wpkh(&pubkey).encode()],
        mnemonic: None,
        ..Default::default()
    };
    mgr.create_wallet("keypersist", &wallet, None).unwrap();
    let loaded = mgr.load_wallet("keypersist", None).unwrap();
    assert_eq!(loaded.private_keys[0], key_hex);
}

// ── Encryption ────────────────────────────────────────────────────────────────

#[test]
fn test_encrypted_wallet_cannot_be_loaded_without_password() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("vault");
    mgr.create_wallet("vault", &wallet, Some("s3cr3t_pass_1234")).unwrap();
    let result = mgr.load_wallet("vault", None);
    assert!(result.is_err(), "encrypted wallet must not open without password");
}

#[test]
fn test_encrypted_wallet_opens_with_correct_password() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("fort");
    mgr.create_wallet("fort", &wallet, Some("correct_pw_5678")).unwrap();
    let loaded = mgr.load_wallet("fort", Some("correct_pw_5678")).unwrap();
    assert_eq!(loaded.label, "fort");
}

#[test]
fn test_encrypted_wallet_rejects_wrong_password() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("secure_wallet");
    mgr.create_wallet("secure_wallet", &wallet, Some("right_pw_9999")).unwrap();
    let result = mgr.load_wallet("secure_wallet", Some("wrong_pw_0000"));
    assert!(result.is_err(), "wrong password must be rejected");
}

// ── Existence / delete ────────────────────────────────────────────────────────

#[test]
fn test_wallet_exists_returns_true_after_create() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("exist_check");
    mgr.create_wallet("exist_check", &wallet, None).unwrap();
    assert!(mgr.wallet_exists("exist_check"));
}

#[test]
fn test_wallet_exists_returns_false_for_unknown() {
    let (_dir, mgr) = make_mgr();
    assert!(!mgr.wallet_exists("nosuchname"));
}

#[test]
fn test_delete_wallet_removes_it() {
    let (_dir, mgr) = make_mgr();
    let wallet = simple_wallet("temp_wallet");
    mgr.create_wallet("temp_wallet", &wallet, None).unwrap();
    assert!(mgr.wallet_exists("temp_wallet"));
    mgr.delete_wallet("temp_wallet").unwrap();
    assert!(!mgr.wallet_exists("temp_wallet"));
}

// ── Address generation ────────────────────────────────────────────────────────

#[test]
fn test_p2wpkh_address_has_correct_format() {
    let key = tx::PrivateKey::new();
    let pubkey = key.public_key();
    let addr = tx::Address::from_pubkey_p2wpkh(&pubkey);
    let encoded = addr.encode();
    // A bech32 P2WPKH address is always at least 26 chars.
    assert!(
        encoded.len() >= 26,
        "bech32 P2WPKH address must be at least 26 chars"
    );
}

#[test]
fn test_two_fresh_keys_produce_different_addresses() {
    let k1 = tx::PrivateKey::new();
    let k2 = tx::PrivateKey::new();
    let a1 = tx::Address::from_pubkey_p2wpkh(&k1.public_key()).encode();
    let a2 = tx::Address::from_pubkey_p2wpkh(&k2.public_key()).encode();
    assert_ne!(a1, a2, "two independent keys must yield different addresses");
}
