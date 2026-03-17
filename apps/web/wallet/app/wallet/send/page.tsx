'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import walletService, { WalletInfo, UnsignedTransaction } from '@/services/wallet';
import api from '@/services/api';

export default function SendPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletInfo | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [customFee, setCustomFee] = useState('');
  const [useCustomFee, setUseCustomFee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [unsignedTx, setUnsignedTx] = useState<UnsignedTransaction | null>(null);
  const [estimatedFees, setEstimatedFees] = useState({
    slow: 0,
    medium: 0,
    fast: 0,
  });

  useEffect(() => {
    loadWallets();
    loadFeeEstimates();
  }, []);

  const isLikelyKubercoinAddress = (value: string): boolean => {
    return /^KC1[a-zA-Z0-9]{6,}$/.test(value.trim());
  };

  const loadWallets = async () => {
    walletService.reloadFromStorage();
    const allWallets = walletService.getWallets();
    setWallets(allWallets);
    
    const active = walletService.getActiveWallet();
    setActiveWallet(active);
    
    if (active) {
      await walletService.updateWalletBalance(active.address);
      const updated = walletService.getWallet(active.address);
      if (updated) {
        setActiveWallet(updated);
      }
    }
  };

  const loadFeeEstimates = async () => {
    try {
      const slow = await api.estimateSmartFee(12);
      const medium = await api.estimateSmartFee(6);
      const fast = await api.estimateSmartFee(2);
      
      setEstimatedFees({
        slow: slow.feerate || 0.00001,
        medium: medium.feerate || 0.00002,
        fast: fast.feerate || 0.00005,
      });
    } catch (err) {
      console.error('Failed to load fee estimates:', err);
      setEstimatedFees({
        slow: 0.00001,
        medium: 0.00002,
        fast: 0.00005,
      });
    }
  };

  const validateInputs = (): boolean => {
    if (!activeWallet) {
      setError('No active wallet selected');
      return false;
    }

    if (!recipientAddress.trim()) {
      setError('Recipient address is required');
      return false;
    }

    if (!isLikelyKubercoinAddress(recipientAddress)) {
      setError('Invalid recipient address');
      return false;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return false;
    }

    if (amountNum > activeWallet.balance) {
      setError(`Insufficient balance. Available: ${activeWallet.balance.toFixed(8)} KBC`);
      return false;
    }

    if (useCustomFee) {
      const customFeeNum = parseFloat(customFee);
      if (isNaN(customFeeNum) || customFeeNum < 0) {
        setError('Invalid custom fee rate');
        return false;
      }
    }

    return true;
  };

  const handlePreviewTransaction = async () => {
    setError(null);
    setSuccess(null);

    if (!validateInputs()) return;

    setLoading(true);
    try {
      const amountNum = parseFloat(amount);
      const feeRateNum = useCustomFee ? parseFloat(customFee) : estimatedFees[feeRate];

      const tx = await walletService.createTransaction(
        activeWallet!.address,
        recipientAddress,
        amountNum,
        feeRateNum
      );

      setUnsignedTx(tx);
      setShowConfirmation(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!unsignedTx || !activeWallet) return;

    setLoading(true);
    setError(null);

    try {
      const txid = await walletService.sendTransaction(
        activeWallet.address,
        recipientAddress,
        parseFloat(amount),
        useCustomFee ? parseFloat(customFee) : estimatedFees[feeRate]
      );

      setSuccess(`Transaction sent successfully! TXID: ${txid}`);
      setShowConfirmation(false);
      setRecipientAddress('');
      setAmount('');
      setUnsignedTx(null);

      // Reload wallet balance
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmation(false);
    setUnsignedTx(null);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Send KuberCoin
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
          Send KBC to another address
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
        </div>
      )}

      {!showConfirmation ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {/* Wallet Selection */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                From Wallet
              </h3>
              {activeWallet ? (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        {activeWallet.label}
                      </div>
                      <div style={{ color: '#8B5CF6', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {activeWallet.address}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                        {activeWallet.balance.toFixed(8)}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                        KBC
                      </div>
                    </div>
                  </div>
                  {activeWallet.unconfirmedBalance > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#FBBF24' }}>
                      Unconfirmed: {activeWallet.unconfirmedBalance.toFixed(8)} KBC
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  No wallet selected. Please create or import a wallet first.
                </div>
              )}
            </CardBody>
          </Card>

          {/* Transaction Details */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                Transaction Details
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Recipient Address
                  </label>
                  <input
                    data-testid="recipient-address-input"
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="Enter KBC address"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Amount (KBC)
                  </label>
                  <input
                    data-testid="amount-input"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00000000"
                    step="0.00000001"
                    min="0"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '1rem',
                    }}
                  />
                  {activeWallet && (
                    <button
                      onClick={() => setAmount(activeWallet.balance.toString())}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.25rem 0.75rem',
                        background: 'transparent',
                        border: '1px solid rgba(139, 92, 246, 0.5)',
                        borderRadius: '6px',
                        color: '#8B5CF6',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Max: {activeWallet.balance.toFixed(8)} KBC
                    </button>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Fee Selection */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                Transaction Fee
              </h3>
              
              {!useCustomFee && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <button
                    onClick={() => setFeeRate('slow')}
                    style={{
                      padding: '1rem',
                      background: feeRate === 'slow' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: feeRate === 'slow' ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                      Slow
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      ~12 blocks
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#8B5CF6', marginTop: '0.25rem' }}>
                      {(estimatedFees.slow * 100000000).toFixed(2)} sat/vB
                    </div>
                  </button>

                  <button
                    onClick={() => setFeeRate('medium')}
                    style={{
                      padding: '1rem',
                      background: feeRate === 'medium' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: feeRate === 'medium' ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                      Medium
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      ~6 blocks
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#8B5CF6', marginTop: '0.25rem' }}>
                      {(estimatedFees.medium * 100000000).toFixed(2)} sat/vB
                    </div>
                  </button>

                  <button
                    onClick={() => setFeeRate('fast')}
                    style={{
                      padding: '1rem',
                      background: feeRate === 'fast' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: feeRate === 'fast' ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                      Fast
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      ~2 blocks
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#8B5CF6', marginTop: '0.25rem' }}>
                      {(estimatedFees.fast * 100000000).toFixed(2)} sat/vB
                    </div>
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: useCustomFee ? '1rem' : '0' }}>
                <input
                  data-testid="custom-fee-toggle"
                  type="checkbox"
                  checked={useCustomFee}
                  onChange={(e) => setUseCustomFee(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => setUseCustomFee(!useCustomFee)}>
                  Use custom fee rate
                </label>
              </div>

              {useCustomFee && (
                <div>
                  <input
                    data-testid="custom-fee-input"
                    type="number"
                    value={customFee}
                    onChange={(e) => setCustomFee(e.target.value)}
                    placeholder="Enter fee rate (KBC/vB)"
                    step="0.00000001"
                    min="0"
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
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                    Fee rate in KBC per virtual byte
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button
              data-testid="send-transaction-button"
              onClick={handlePreviewTransaction}
              disabled={loading || !activeWallet}
              style={{
                flex: 1,
                padding: '1rem',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                opacity: loading || !activeWallet ? 0.5 : 1,
                cursor: loading || !activeWallet ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating Transaction...' : 'Preview Transaction'}
            </Button>
          </div>
        </div>
      ) : (
        /* Confirmation Dialog */
        <Card variant="glass">
          <CardBody>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
              Confirm Transaction
            </h3>

            {unsignedTx && (
              <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Recipient
                  </div>
                  <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {recipientAddress}
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Amount
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                    {parseFloat(amount).toFixed(8)} KBC
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Transaction Fee
                  </div>
                  <div style={{ color: '#FBBF24', fontSize: '1.1rem', fontWeight: 600 }}>
                    {unsignedTx.fee.toFixed(8)} KBC
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {((useCustomFee ? parseFloat(customFee) : estimatedFees[feeRate]) * 100000000).toFixed(2)} sat/vB
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Total
                  </div>
                  <div style={{ color: '#8B5CF6', fontSize: '1.5rem', fontWeight: 700 }}>
                    {(parseFloat(amount) + unsignedTx.fee).toFixed(8)} KBC
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  color: '#FBBF24',
                }}>
                  ⚠️ Please verify all transaction details before confirming. This action cannot be undone.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button
                onClick={handleCancel}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendTransaction}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Sending...' : 'Confirm & Send'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
