'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import styles from './faucet.module.css';

export default function TestnetFaucetPage() {
  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💧', label: 'Testnet Faucet', href: '/faucet' },
    { icon: '🌐', label: 'Network', href: '/explorer/network' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('1');
  const [requesting, setRequesting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [faucetInfoState, setFaucetInfo] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);

  const faucetUrl = process.env.NEXT_PUBLIC_FAUCET_URL || '';
  const faucetInfo = faucetInfoState || {
    balance: 0,
    dailyLimit: 0,
    perRequestLimit: 0,
    cooldownPeriod: 0,
    totalDispensed: 0,
    requestsToday: 0,
    yourRequestsToday: 0,
    cooldownRemaining: 0,
    ipRateLimit: { current: 0, max: 0, resetIn: 0 },
    abuseDetection: { score: 0, threshold: 0, status: 'unknown' },
  };

  useEffect(() => {
    const loadInfo = async () => {
      if (!faucetUrl) {
        setError('Faucet API not configured');
        return;
      }
      try {
        const res = await fetch(`${faucetUrl}/info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setFaucetInfo(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load faucet info');
      }
    };

    const loadHistory = () => {
      const stored = localStorage.getItem('kubercoin_faucet_requests');
      if (stored) {
        setRecentRequests(
          JSON.parse(stored).map((r: any) => ({ ...r, timestamp: new Date(r.timestamp) }))
        );
      }
    };

    loadInfo();
    loadHistory();
  }, [faucetUrl]);

  const handleRequest = async () => {
    if (!faucetUrl) {
      setError('Faucet API not configured');
      return;
    }

    setRequesting(true);
    setError(null);
    try {
      const response = await fetch(`${faucetUrl}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount: Number(amount) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTxHash(data.txid || 'pending');

      const nextRequests = [
        {
          address,
          amount: Number(amount),
          txHash: data.txid || 'pending',
          timestamp: new Date(),
          status: data.status || 'pending',
        },
        ...recentRequests,
      ].slice(0, 10);

      setRecentRequests(nextRequests);
      localStorage.setItem('kubercoin_faucet_requests', JSON.stringify(nextRequests));
    } catch (err: any) {
      setError(err.message || 'Faucet request failed');
    } finally {
      setRequesting(false);
    }
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Testnet Faucet</h1>
            <p className={styles.subtitle}>
              Free Test Coins for Development • Testnet Only
            </p>
          </div>
          <Badge variant="warning" size="lg">
            ⚠️ TESTNET
          </Badge>
        </header>

        <div className={styles.warningBanner}>
          <div className={styles.warningIcon}>⚠️</div>
          <div className={styles.warningContent}>
            <h3>Testnet Coins Have No Value</h3>
            <p>
              These are test coins for development and testing purposes only. They have no monetary value and cannot
              be exchanged for real cryptocurrency. Do not use mainnet addresses!
            </p>
          </div>
        </div>

        {error && (
          <div className={styles.warningBanner}>
            <div className={styles.warningIcon}>⚠️</div>
            <div className={styles.warningContent}>
              <h3>Faucet Unavailable</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className={styles.grid}>
          <div className={styles.mainColumn}>
            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Request Test Coins</h3>
                <div className={styles.requestForm}>
                  <div className={styles.formGroup}>
                    <Input
                      label="Testnet Address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="tb1q..."
                      helperText="Enter a valid testnet address (starts with tb1, m, or n)"
                      fullWidth
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <Input
                      label="Amount (KC)"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="0.1"
                      max={faucetInfo.perRequestLimit.toString()}
                      step="0.1"
                      helperText={`Maximum ${faucetInfo.perRequestLimit} KC per request`}
                      fullWidth
                    />
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleRequest}
                    disabled={requesting || !address || Number.parseFloat(amount) > faucetInfo.perRequestLimit}
                    className={styles.requestButton}
                  >
                    {requesting ? '⏳ Processing...' : '💧 Request Testnet Coins'}
                  </Button>

                  {txHash && (
                    <div className={styles.successBox}>
                      <div className={styles.successIcon}>✓</div>
                      <div>
                        <h4>Request Successful!</h4>
                        <p>Transaction Hash:</p>
                        <code className={styles.txHash}>{txHash}</code>
                        <p className={styles.confirmNote}>
                          Coins will arrive after 1 confirmation (~10 minutes)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Recent Requests</h3>
                <div className={styles.requestsList}>
                  {recentRequests.map((req) => (
                    <div key={`${req.txHash}-${req.address}`} className={styles.requestItem}>
                      <div className={styles.requestHeader}>
                        <code className={styles.requestAddress}>{req.address}</code>
                        <Badge variant={req.status === 'confirmed' ? 'success' : 'warning'}>
                          {req.status}
                        </Badge>
                      </div>
                      <div className={styles.requestDetails}>
                        <span>💰 {req.amount} KC</span>
                        <span>•</span>
                        <span>📦 {req.txHash}</span>
                        <span>•</span>
                        <span>⏱️ {formatTime(req.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className={styles.sideColumn}>
            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Faucet Statistics</h3>
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <div className={styles.statIcon}>💰</div>
                    <div>
                      <div className={styles.statLabel}>Faucet Balance</div>
                      <div className={styles.statValue}>{faucetInfo.balance.toLocaleString()} KC</div>
                    </div>
                  </div>

                  <div className={styles.statItem}>
                    <div className={styles.statIcon}>📊</div>
                    <div>
                      <div className={styles.statLabel}>Total Dispensed</div>
                      <div className={styles.statValue}>{faucetInfo.totalDispensed.toLocaleString()} KC</div>
                    </div>
                  </div>

                  <div className={styles.statItem}>
                    <div className={styles.statIcon}>📅</div>
                    <div>
                      <div className={styles.statLabel}>Requests Today</div>
                      <div className={styles.statValue}>{faucetInfo.requestsToday}</div>
                    </div>
                  </div>

                  <div className={styles.statItem}>
                    <div className={styles.statIcon}>🎯</div>
                    <div>
                      <div className={styles.statLabel}>Daily Limit</div>
                      <div className={styles.statValue}>{faucetInfo.dailyLimit} KC</div>
                    </div>
                  </div>

                  <div className={styles.statItem}>
                    <div className={styles.statIcon}>⏰</div>
                    <div>
                      <div className={styles.statLabel}>Cooldown Period</div>
                      <div className={styles.statValue}>{faucetInfo.cooldownPeriod}h</div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Rate Limiting Status</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Your Requests Today</span>
                      <Badge variant={faucetInfo.yourRequestsToday >= faucetInfo.dailyLimit ? 'error' : 'success'}>
                        {faucetInfo.yourRequestsToday} / {faucetInfo.dailyLimit}
                      </Badge>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(faucetInfo.yourRequestsToday / faucetInfo.dailyLimit) * 100}%`,
                        height: '100%',
                        background: faucetInfo.yourRequestsToday >= faucetInfo.dailyLimit ? '#EF4444' : '#10B981',
                      }}></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>IP Rate Limit</span>
                      <Badge variant={faucetInfo.ipRateLimit.current >= faucetInfo.ipRateLimit.max ? 'warning' : 'info'}>
                        {faucetInfo.ipRateLimit.current} / {faucetInfo.ipRateLimit.max}
                      </Badge>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(faucetInfo.ipRateLimit.current / faucetInfo.ipRateLimit.max) * 100}%`,
                        height: '100%',
                        background: faucetInfo.ipRateLimit.current >= faucetInfo.ipRateLimit.max ? '#F59E0B' : '#3B82F6',
                      }}></div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Resets in {faucetInfo.ipRateLimit.resetIn}h
                    </div>
                  </div>

                  {faucetInfo.cooldownRemaining > 0 && (
                    <div style={{
                      padding: '0.75rem',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ color: '#F59E0B', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        ⏳ Cooldown Active
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                        Next request available in {faucetInfo.cooldownRemaining}h
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Abuse Detection</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Abuse Score</span>
                      <Badge variant={
                        faucetInfo.abuseDetection.score < 50 ? 'success' :
                        faucetInfo.abuseDetection.score < 80 ? 'warning' : 'error'
                      }>
                        {faucetInfo.abuseDetection.score} / {faucetInfo.abuseDetection.threshold}
                      </Badge>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(faucetInfo.abuseDetection.score / faucetInfo.abuseDetection.threshold) * 100}%`,
                        height: '100%',
                        background: faucetInfo.abuseDetection.score < 50 ? '#10B981' :
                                  faucetInfo.abuseDetection.score < 80 ? '#F59E0B' : '#EF4444',
                      }}></div>
                    </div>
                  </div>

                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                  }}>
                    <div style={{ color: '#10B981', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      ✓ {faucetInfo.abuseDetection.status === 'clean' ? 'No Abuse Detected' : 'Account Flagged'}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                      Your usage patterns are normal
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Monitored Factors:</div>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                      <li>Request frequency and timing</li>
                      <li>Address reuse patterns</li>
                      <li>IP address reputation</li>
                      <li>Captcha completion rate</li>
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>`n
                <h3 className={styles.cardTitle}>Usage Rules</h3>
                <div className={styles.rulesList}>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>1️⃣</span>
                    <span>Maximum {faucetInfo.perRequestLimit} KC per request</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>2️⃣</span>
                    <span>One request per address every {faucetInfo.cooldownPeriod} hours</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>3️⃣</span>
                    <span>Testnet addresses only (tb1, m, or n prefix)</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>4️⃣</span>
                    <span>Coins arrive after 1 confirmation</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>5️⃣</span>
                    <span>Fair usage policy enforced</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        <Card variant="glass">
          <CardBody>
            <h4 className={styles.noteTitle}>💡 About This Faucet</h4>
            <div className={styles.noteContent}>
              <p>
                This testnet faucet provides free test coins for developers and testers. The faucet operates
                autonomously by reading from a funded testnet wallet and creating transactions according to
                predefined rules.
              </p>
              <div className={styles.importantNote}>
                <strong>⚠️ Critical Principle:</strong> The faucet UI submits requests to the node, which creates
                and broadcasts transactions following standard wallet rules. The UI does not create transactions
                directly, bypass mempool admission, or modify any blockchain consensus rules.
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}

