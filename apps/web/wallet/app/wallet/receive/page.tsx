'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import walletService, { WalletInfo } from '@/services/wallet';
import api from '@/services/api';

export default function ReceivePage() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletInfo | null>(null);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressHistory, setAddressHistory] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadWallets();
    loadAddressHistory();
  }, []);

  useEffect(() => {
    if (selectedAddress) {
      generateQRCode(selectedAddress);
    }
  }, [selectedAddress]);

  const loadWallets = async () => {
    const allWallets = walletService.getWallets();
    setWallets(allWallets);
    
    const active = walletService.getActiveWallet();
    setActiveWallet(active);
    
    if (active) {
      setSelectedAddress(active.address);
      await walletService.updateWalletBalance(active.address);
      const updated = walletService.getWallet(active.address);
      if (updated) {
        setActiveWallet(updated);
      }
    }
  };

  const loadAddressHistory = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('kubercoin_address_history');
      if (stored) {
        const history = JSON.parse(stored);
        setAddressHistory(history);
      }
    } catch (err) {
      console.error('Failed to load address history:', err);
    }
  };

  const saveAddressToHistory = (address: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const history = [...new Set([address, ...addressHistory])].slice(0, 10); // Keep last 10 unique
      setAddressHistory(history);
      localStorage.setItem('kubercoin_address_history', JSON.stringify(history));
    } catch (err) {
      console.error('Failed to save address history:', err);
    }
  };

  const generateQRCode = async (address: string) => {
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(address, {
        width: 300,
        margin: 2,
        color: {
          dark: '#8B5CF6',
          light: '#0F0F23',
        },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      setError('Failed to generate QR code');
    }
  };

  const handleGenerateNewAddress = async () => {
    if (!activeWallet) return;

    setLoading(true);
    setError(null);

    try {
      const newAddress = await api.getNewAddress(activeWallet.label);
      setSelectedAddress(newAddress);
      saveAddressToHistory(newAddress);
      
      // Reload wallets to get updated list
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate new address');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (!selectedAddress) return;

    navigator.clipboard.writeText(selectedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectWallet = (wallet: WalletInfo) => {
    setActiveWallet(wallet);
    setSelectedAddress(wallet.address);
    walletService.setActiveWallet(wallet.address);
  };

  const getAddressUsageCount = (address: string): number => {
    return addressHistory.filter(addr => addr === address).length;
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Receive KuberCoin
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
          Share your address to receive KBC
        </p>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* QR Code Section */}
        <Card variant="glass">
          <CardBody>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
              Your Receiving Address
            </h3>

            {activeWallet ? (
              <div>
                {/* QR Code */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '2rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '12px',
                  marginBottom: '1.5rem',
                }}>
                  {qrDataUrl ? (
                    <img data-testid="qr-code-image" src={qrDataUrl} alt="QR Code" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ width: '300px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' }}>
                      Loading QR code...
                    </div>
                  )}
                </div>

                {/* Address Display */}
                <div style={{
                  padding: '1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Address
                  </div>
                  <div data-testid="wallet-address" style={{
                    color: '#8B5CF6',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    wordBreak: 'break-all',
                    marginBottom: '1rem',
                  }}>
                    {selectedAddress}
                  </div>
                  <Button
                    data-testid="copy-address-button"
                    onClick={handleCopyAddress}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                      border: copied ? '1px solid #10B981' : '1px solid #8B5CF6',
                    }}
                  >
                    {copied ? '✓ Copied!' : '📋 Copy Address'}
                  </Button>
                </div>

                {/* Privacy Warning */}
                {getAddressUsageCount(selectedAddress) > 3 && (
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                  }}>
                    <div style={{ color: '#FBBF24', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      ⚠️ Address Reuse Warning
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                      This address has been used {getAddressUsageCount(selectedAddress)} times. For better privacy, consider generating a new address.
                    </div>
                  </div>
                )}

                {/* Generate New Address Button */}
                <Button
                  data-testid="generate-new-address-button"
                  onClick={handleGenerateNewAddress}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Generating...' : '🔄 Generate New Address'}
                </Button>
              </div>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                No wallet selected. Please create or import a wallet first.
              </div>
            )}
          </CardBody>
        </Card>

        {/* Wallet Info & Address History */}
        <div style={{ display: 'grid', gap: '1.5rem', height: 'fit-content' }}>
          {/* Active Wallet Info */}
          {activeWallet && (
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                  Wallet Balance
                </h3>
                <div style={{
                  padding: '1.5rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    {activeWallet.label}
                  </div>
                  <div style={{ color: '#fff', fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {activeWallet.balance.toFixed(8)}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>
                    KBC
                  </div>
                  {activeWallet.unconfirmedBalance > 0 && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.5rem',
                      background: 'rgba(251, 191, 36, 0.1)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      color: '#FBBF24',
                    }}>
                      Unconfirmed: {activeWallet.unconfirmedBalance.toFixed(8)} KBC
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Wallet Selection */}
          {wallets.length > 1 && (
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                  Switch Wallet
                </h3>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {wallets.map((wallet) => (
                    <button
                      key={wallet.address}
                      onClick={() => handleSelectWallet(wallet)}
                      style={{
                        padding: '0.75rem',
                        background: activeWallet?.address === wallet.address 
                          ? 'rgba(139, 92, 246, 0.2)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        border: activeWallet?.address === wallet.address 
                          ? '2px solid #8B5CF6' 
                          : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                        {wallet.label}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#8B5CF6' }}>
                        {wallet.address.slice(0, 12)}...{wallet.address.slice(-8)}
                      </div>
                      <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        {wallet.balance.toFixed(8)} KBC
                      </div>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Address History */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                Recent Addresses
              </h3>
              {addressHistory.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {addressHistory.slice(0, 5).map((addr, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedAddress(addr)}
                      style={{
                        padding: '0.75rem',
                        background: selectedAddress === addr 
                          ? 'rgba(139, 92, 246, 0.1)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        border: selectedAddress === addr 
                          ? '1px solid #8B5CF6' 
                          : '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        color: selectedAddress === addr ? '#8B5CF6' : 'rgba(255,255,255,0.8)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}>
                        {addr.slice(0, 16)}...{addr.slice(-12)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                  No address history yet
                </div>
              )}
            </CardBody>
          </Card>

          {/* Privacy Tips */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                💡 Privacy Tips
              </h3>
              <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                }}>
                  ✓ Use a new address for each transaction to improve privacy
                </div>
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                }}>
                  ✓ Avoid sharing addresses publicly when possible
                </div>
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                }}>
                  ✓ Generate new addresses regularly for better anonymity
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
