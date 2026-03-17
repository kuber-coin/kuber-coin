'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import walletService, { WalletInfo } from '@/services/wallet';

export default function WalletManagePage() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletInfo | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [walletLabel, setWalletLabel] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backupData, setBackupData] = useState('');
  const [backupTitle, setBackupTitle] = useState('Wallet Backup');
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    const allWallets = walletService.getWallets();
    setWallets(allWallets);
    
    const active = walletService.getActiveWallet();
    setActiveWallet(active);
    
    // Update all balances
    await walletService.updateAllBalances();
    setWallets(walletService.getWallets());
  };

  const handleCreateWallet = async () => {
    setError(null);
    setSuccess(null);
    setCreatedMnemonic(null);

    if (!walletLabel.trim()) {
      setError('Wallet label is required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walletLabel.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create wallet');
      }

      const wallet = walletService.registerWallet({
        address: data.address,
        label: walletLabel.trim(),
        balance: 0,
        unconfirmedBalance: 0,
        createdAt: Date.now(),
      });

      setCreatedMnemonic(typeof data.mnemonic === 'string' && data.mnemonic.trim() ? data.mnemonic : null);
      setSuccess(`Wallet created successfully! Address: ${wallet.address}`);
      setShowCreateDialog(false);
      setWalletLabel('');
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImportWallet = async () => {
    setError(null);
    setSuccess(null);

    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    if (!walletLabel.trim()) {
      setError('Wallet label is required');
      return;
    }

    setLoading(true);
    try {
      const wallet = await walletService.importWallet(privateKey, walletLabel, false);
      setSuccess(`Wallet imported successfully! Address: ${wallet.address}`);
      setShowImportDialog(false);
      setWalletLabel('');
      setPrivateKey('');
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleSetActive = (address: string) => {
    const success = walletService.setActiveWallet(address);
    if (success) {
      setActiveWallet(walletService.getActiveWallet());
      setSuccess(`Active wallet set to: ${address.slice(0, 16)}...`);
    }
  };

  const handleDeleteWallet = (address: string) => {
    if (!confirm('Are you sure you want to delete this wallet? This action cannot be undone.')) {
      return;
    }

    const success = walletService.deleteWallet(address);
    if (success) {
      setSuccess('Wallet deleted successfully');
      loadWallets();
    } else {
      setError('Failed to delete wallet');
    }
  };

  const handleBackupWallet = (address: string) => {
    const backup = walletService.exportWallet(address);
    if (backup) {
      setBackupTitle('Wallet Metadata Export');
      setBackupData(backup);
      setShowBackupDialog(true);
    } else {
      setError('Failed to export wallet');
    }
  };

  const handleDownloadBackup = () => {
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubercoin-wallet-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccess('Backup downloaded successfully');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Wallet Management
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
            Manage your KuberCoin wallets
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            data-testid="create-wallet-button"
            onClick={() => setShowCreateDialog(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            }}
          >
            + Create Wallet
          </Button>
          <Button
            data-testid="import-wallet-button"
            onClick={() => setShowImportDialog(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(139, 92, 246, 0.5)',
            }}
          >
            📥 Import Wallet
          </Button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#EF4444',
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '1rem',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#10B981',
        }}>
          ✓ {success}
          {createdMnemonic && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
              Mnemonic returned by backend: <span style={{ fontFamily: 'monospace' }}>{createdMnemonic}</span>
            </div>
          )}
        </div>
      )}

      {/* Wallet List */}
      {wallets.length > 0 ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {wallets.map((wallet) => (
            <Card key={wallet.address} variant="glass">
              <CardBody>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                        {wallet.label}
                      </h3>
                      {activeWallet?.address === wallet.address && (
                        <Badge variant="success">Active</Badge>
                      )}
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        Address
                      </div>
                      <div style={{ color: '#8B5CF6', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {wallet.address}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                          Balance
                        </div>
                        <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600 }}>
                          {wallet.balance.toFixed(8)} KBC
                        </div>
                      </div>

                      {wallet.unconfirmedBalance > 0 && (
                        <div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            Unconfirmed
                          </div>
                          <div style={{ color: '#FBBF24', fontSize: '1.25rem', fontWeight: 600 }}>
                            {wallet.unconfirmedBalance.toFixed(8)} KBC
                          </div>
                        </div>
                      )}

                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                          Created
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
                          {new Date(wallet.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '2rem' }}>
                    {activeWallet?.address !== wallet.address && (
                      <Button
                        data-testid="set-active-wallet-button"
                        onClick={() => handleSetActive(wallet.address)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10B981',
                          fontSize: '0.85rem',
                        }}
                      >
                        Set Active
                      </Button>
                    )}
                    <Button
                      data-testid="backup-wallet-button"
                      onClick={() => handleBackupWallet(wallet.address)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: '#3B82F6',
                        fontSize: '0.85rem',
                      }}
                    >
                      Backup
                    </Button>
                    <Button
                      data-testid="delete-wallet-button"
                      onClick={() => handleDeleteWallet(wallet.address)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#EF4444',
                        fontSize: '0.85rem',
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="glass">
          <CardBody>
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.25rem', marginBottom: '1rem' }}>
                No wallets found
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Create or import a wallet to get started
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                  }}
                >
                  + Create Wallet
                </Button>
                <Button
                  onClick={() => setShowImportDialog(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.5)',
                  }}
                >
                  📥 Import Wallet
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Create Wallet Dialog */}
      {showCreateDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '500px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Create New Wallet
                </h3>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Wallet Label
                </label>
                <input
                  data-testid="wallet-label-input"
                  type="text"
                  value={walletLabel}
                  onChange={(e) => setWalletLabel(e.target.value)}
                  placeholder="My Wallet"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{
                padding: '1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ℹ️ This uses the backend wallet-create flow. If the backend is configured with a shared passphrase, the wallet will be encrypted there. Mnemonic display depends on backend support.
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowCreateDialog(false);
                    setWalletLabel('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="generate-wallet-button"
                  onClick={handleCreateWallet}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Creating...' : 'Create Wallet'}
                </Button>
              </div>
            </CardBody>
          </Card>
          </div>
        </div>
      )}

      {/* Import Wallet Dialog */}
      {showImportDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '500px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Import Wallet
                </h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Wallet Label
                </label>
                <input
                  data-testid="import-wallet-label-input"
                  type="text"
                  value={walletLabel}
                  onChange={(e) => setWalletLabel(e.target.value)}
                  placeholder="Imported Wallet"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Private Key
                </label>
                <textarea
                  data-testid="private-key-input"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="Enter your private key"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{
                padding: '1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: '#EF4444',
              }}>
                ⚠️ Never share your private key with anyone. Keep it secure and backed up.
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowImportDialog(false);
                    setWalletLabel('');
                    setPrivateKey('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="import-wallet-submit-button"
                  onClick={handleImportWallet}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Importing...' : 'Import Wallet'}
                </Button>
              </div>
            </CardBody>
          </Card>
          </div>
        </div>
      )}

      {/* Backup Dialog */}
      {showBackupDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '600px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  {backupTitle}
                </h3>

              <div style={{
                padding: '1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ℹ️ This export contains wallet metadata currently available to the browser. It is not a substitute for a full backend wallet export or verified recovery material.
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <textarea
                  value={backupData}
                  readOnly
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#8B5CF6',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowBackupDialog(false);
                    setBackupData('');
                    setBackupTitle('Wallet Backup');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={handleDownloadBackup}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  }}
                >
                  📥 Download Backup
                </Button>
              </div>
            </CardBody>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
