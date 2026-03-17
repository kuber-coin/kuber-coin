'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { Tabs } from '../../components/Tabs';
import { Divider } from '../../components/Divider';
import { CopyButton } from '../../components/CopyButton';
import Modal from '../../components/Modal';
import styles from './key-manager.module.css';

export default function KeyManagerPage() {
  const [activeTab, setActiveTab] = useState('generate');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [importMnemonic, setImportMnemonic] = useState('');
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  const sidebarItems = [
    { icon: '💰', label: 'Wallet', href: '/dashboard' },
    { icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
    { icon: '📍', label: 'Addresses', href: '/wallet/addresses' },
    { icon: '💎', label: 'UTXOs', href: '/wallet/utxos' },
    { icon: '📝', label: 'Transaction Builder', href: '/wallet/tx-builder' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const generateMnemonic = () => {
    alert('Mnemonic generation requires a configured wallet backend.');
  };

  const generate24Words = () => {
    alert('Mnemonic generation requires a configured wallet backend.');
  };

  const importWallet = () => {
    if (!importMnemonic || !walletName || !password) {
      alert('Please fill all fields');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    alert('Wallet import requires a configured wallet backend.');
  };

  const exportWallet = () => {
    setShowExportModal(true);
  };

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Key Manager</h1>
            <p className={styles.subtitle}>
              HD Wallet Generation (BIP-32/39/44) • Watch-Only Mode • Hybrid Signatures (Classical + PQ)
            </p>
          </div>
          <div className={styles.badges}>
            <Badge variant="success">HD Wallet</Badge>
            <Badge variant="info">BIP-32/39/44</Badge>
            <Badge variant="custom" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
              PQ-Hybrid
            </Badge>
          </div>
        </header>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'generate', label: 'Generate Wallet' },
                { id: 'import', label: 'Import Wallet' },
                { id: 'export', label: 'Export Wallet' },
                { id: 'watch', label: 'Watch-Only Mode' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="pills"
            />

            {activeTab === 'generate' && (
              <div className={styles.tabContent}>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Generate New HD Wallet</h3>
                  <p className={styles.sectionDescription}>
                    Create a new hierarchical deterministic wallet using BIP-32/39/44 standards with hybrid classical + post-quantum signatures.
                  </p>

                  <div className={styles.buttonGroup}>
                    <Button variant="primary" size="lg" onClick={generateMnemonic}>
                      🎲 Generate 12-Word Mnemonic
                    </Button>
                    <Button variant="secondary" size="lg" onClick={generate24Words}>
                      🔐 Generate 24-Word Mnemonic
                    </Button>
                  </div>

                  {showMnemonic && (
                    <div className={styles.mnemonicContainer}>
                      <div className={styles.warningBox}>
                        <span className={styles.warningIcon}>⚠️</span>
                        <div>
                          <strong>Critical Security Warning</strong>
                          <p>Write down these words in order and store them securely. Never share them with anyone. Anyone with these words can access your funds.</p>
                        </div>
                      </div>

                      <div className={styles.mnemonicGrid}>
                        {mnemonicWords.map((word, index) => (
                          <div key={index} className={styles.mnemonicWord}>
                            <span className={styles.wordNumber}>{index + 1}</span>
                            <span className={styles.word}>{word}</span>
                          </div>
                        ))}
                      </div>

                      <div className={styles.actions}>
                        <Button variant="outline" onClick={() => navigator.clipboard.writeText(mnemonicWords.join(' '))}>
                          📋 Copy to Clipboard
                        </Button>
                        <Button variant="primary" onClick={() => setActiveTab('import')}>
                          ✅ I've Saved These Words
                        </Button>
                      </div>

                      <div className={styles.infoBox}>
                        <strong>Derivation Path:</strong> m/44'/0'/0'/0
                        <br />
                        <strong>Signature Scheme:</strong> ECDSA secp256k1 + Dilithium3 (PQ-Hybrid)
                        <br />
                        <strong>Key Generation:</strong> BIP-32 hierarchical deterministic
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'import' && (
              <div className={styles.tabContent}>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Import Existing Wallet</h3>
                  <p className={styles.sectionDescription}>
                    Restore your wallet using a BIP-39 mnemonic phrase. All keys will be encrypted with your password.
                  </p>

                  <div className={styles.form}>
                    <Input
                      label="Wallet Name"
                      value={walletName}
                      onChange={(e) => setWalletName(e.target.value)}
                      placeholder="My KuberCoin Wallet"
                    />

                    <Input
                      label="Mnemonic Phrase (12 or 24 words)"
                      value={importMnemonic}
                      onChange={(e) => setImportMnemonic(e.target.value)}
                      placeholder="word1 word2 word3 ..."
                      helperText="Space-separated BIP-39 mnemonic words"
                    />

                    <Input
                      label="Encryption Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter strong password"
                    />

                    <Input
                      label="Confirm Password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                    />

                    <div className={styles.securityNotes}>
                      <h4>🔒 Security Features</h4>
                      <ul>
                        <li>Keys encrypted with AES-256-GCM</li>
                        <li>Argon2id key derivation (high memory cost)</li>
                        <li>Never stored unencrypted in memory</li>
                        <li>Secure memory sanitization on cleanup</li>
                      </ul>
                    </div>

                    <Button variant="primary" size="lg" fullWidth onClick={importWallet}>
                      Import Wallet
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div className={styles.tabContent}>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Export Wallet (Encrypted)</h3>
                  <p className={styles.sectionDescription}>
                    Export your wallet in encrypted format. Keys are never exported in plaintext.
                  </p>

                  <div className={styles.warningBox}>
                    <span className={styles.warningIcon}>🛡️</span>
                    <div>
                      <strong>Encrypted Export Only</strong>
                      <p>For security, KuberCoin only exports encrypted wallet files. Never share your encryption password.</p>
                    </div>
                  </div>

                  <div className={styles.exportOptions}>
                    <Card variant="hover" className={styles.exportCard}>
                      <CardBody>
                        <h4>📦 Full Wallet Export</h4>
                        <p>Export complete wallet including all keys, addresses, and metadata</p>
                        <Button variant="primary" fullWidth onClick={exportWallet}>
                          Export Full Wallet
                        </Button>
                      </CardBody>
                    </Card>

                    <Card variant="hover" className={styles.exportCard}>
                      <CardBody>
                        <h4>🔑 Public Keys Only</h4>
                        <p>Export watch-only wallet with public keys (no signing capability)</p>
                        <Button variant="secondary" fullWidth>
                          Export Watch-Only
                        </Button>
                      </CardBody>
                    </Card>

                    <Card variant="hover" className={styles.exportCard}>
                      <CardBody>
                        <h4>🎫 Offline Signing Bundle</h4>
                        <p>Export for offline signing on air-gapped device</p>
                        <Button variant="outline" fullWidth>
                          Create Offline Bundle
                        </Button>
                      </CardBody>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'watch' && (
              <div className={styles.tabContent}>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Watch-Only Mode</h3>
                  <p className={styles.sectionDescription}>
                    Monitor addresses without holding private keys. Transactions must be signed externally.
                  </p>

                  <div className={styles.infoBox}>
                    <strong>📺 Watch-Only Benefits</strong>
                    <ul>
                      <li>Monitor balances and transactions</li>
                      <li>No private keys on this device</li>
                      <li>Build unsigned transactions</li>
                      <li>Sign on external/hardware devices</li>
                      <li>Enhanced security for large holdings</li>
                    </ul>
                  </div>

                  <div className={styles.form}>
                    <Input
                      label="Extended Public Key (xpub)"
                      placeholder="xpub6..."
                      helperText="BIP-32 extended public key for watch-only mode"
                    />

                    <Input
                      label="Derivation Path"
                      placeholder="m/44'/0'/0'"
                      helperText="Standard: m/44'/0'/0' (BIP-44)"
                    />

                    <Button variant="primary" size="lg" fullWidth>
                      Add Watch-Only Wallet
                    </Button>
                  </div>

                  <Divider />

                  <div className={styles.importAddress}>
                    <h4>Import Individual Addresses</h4>
                    <Input
                      label="KuberCoin Address"
                      placeholder="kc1q..."
                      helperText="Add single address to watch"
                    />
                    <Button variant="secondary" fullWidth>
                      Add Address
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <h3>Active Wallets</h3>
          </CardHeader>
          <CardBody>
            <div className={styles.walletList}>
              <div className={styles.walletItem}>
                <div className={styles.walletInfo}>
                  <div className={styles.walletIcon}>💎</div>
                  <div>
                    <h4>Main Wallet</h4>
                    <p>HD Wallet • 5 addresses • Full signing capability</p>
                  </div>
                </div>
                <div className={styles.walletBadges}>
                  <Badge variant="success">Active</Badge>
                  <Badge variant="info">HD</Badge>
                </div>
              </div>

              <div className={styles.walletItem}>
                <div className={styles.walletInfo}>
                  <div className={styles.walletIcon}>👁️</div>
                  <div>
                    <h4>Cold Storage Monitor</h4>
                    <p>Watch-Only • 12 addresses • No keys</p>
                  </div>
                </div>
                <div className={styles.walletBadges}>
                  <Badge variant="warning">Watch-Only</Badge>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Modal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Export Wallet"
          size="md"
        >
          <div className={styles.modalContent}>
            <p>Enter your password to export encrypted wallet:</p>
            <Input
              label="Wallet Password"
              type="password"
              placeholder="Enter password"
            />
            <div className={styles.modalActions}>
              <Button variant="outline" onClick={() => setShowExportModal(false)}>
                Cancel
              </Button>
              <Button variant="primary">
                Export Encrypted File
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
