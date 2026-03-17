'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Checkbox } from '../components/Checkbox';
import { ProgressBar } from '../components/ProgressBar';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import walletService from '@/services/wallet';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const handleWalletNameChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setWalletName(e.target.value);
    setError(null);
  };

  const handlePasswordChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setPassword(e.target.value);
    setError(null);
  };

  const handleConfirmPasswordChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setConfirmPassword(e.target.value);
    setError(null);
  };

  const recoveryPhrase = createdMnemonic ? createdMnemonic.trim().split(/\s+/).filter(Boolean) : [];

  const completeOnboarding = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: walletName.trim(),
          passphrase: password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Wallet setup failed');
      }

      walletService.registerWallet({
        address: data.address,
        label: walletName.trim(),
        balance: 0,
        unconfirmedBalance: 0,
        createdAt: Date.now(),
      });

      setCreatedAddress(data.address || null);
      setCreatedMnemonic(typeof data.mnemonic === 'string' && data.mnemonic.trim() ? data.mnemonic : null);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setError(null);
      setStep((prev) => prev + 1);
    } else {
      void completeOnboarding();
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return true; // Welcome screen
      case 2:
        return walletName.length >= 3;
      case 3:
        return (
          password.length >= 8 &&
          password === confirmPassword &&
          /[A-Z]/.test(password) &&
          /\d/.test(password) &&
          /[^A-Za-z0-9]/.test(password)
        );
      case 4:
        return backupConfirmed;
      case 5:
        return termsAccepted;
      default:
        return false;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {error && (
          <div className={styles.warning} role="alert">
            <span className={styles.warningIcon}>⚠️</span>
            <div>
              <h4>Setup error</h4>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.stepLabel}>Step {step} of {totalSteps}</span>
            <Badge variant="info">{Math.round(progress)}%</Badge>
          </div>
          <ProgressBar value={progress} variant="gradient" />
        </div>

        <div className={styles.stepContent}>
          {step === 1 && (
            <div className={styles.step}>
              <div className={styles.icon}>🪙</div>
              <h1 className={styles.title}>Welcome to KuberCoin</h1>
              <p className={styles.description}>
                Let's set up your new wallet. This will only take a few minutes.
              </p>
              <div className={styles.features}>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>🔒</span>
                  <div>
                    <h3>Secure</h3>
                    <p>Your keys, your coins</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>💰</span>
                  <div>
                    <h3>Easy to Use</h3>
                    <p>Send and receive in seconds</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>🌐</span>
                  <div>
                    <h3>Decentralized</h3>
                    <p>Complete control over your funds</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.step}>
              <div className={styles.icon}>💼</div>
              <h1 className={styles.title}>Name Your Wallet</h1>
              <p className={styles.description}>
                Give your wallet a name to help you identify it later.
              </p>
              <div className={styles.form}>
                <Input
                  label="Wallet Name"
                  value={walletName}
                  onChange={handleWalletNameChange}
                  placeholder="My KuberCoin Wallet"
                  icon={<span>💼</span>}
                  helperText="Choose a memorable name"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.step}>
              <div className={styles.icon}>🔐</div>
              <h1 className={styles.title}>Create Password</h1>
              <p className={styles.description}>
                Protect your wallet with a strong password.
              </p>
              <div className={styles.form}>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter password"
                  icon={<span>🔒</span>}
                  helperText="Minimum 8 characters"
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  placeholder="Re-enter password"
                  icon={<span>🔒</span>}
                  error={
                    confirmPassword && password !== confirmPassword
                      ? 'Passwords do not match'
                      : undefined
                  }
                />
                <div className={styles.passwordTips}>
                  <h4>Password Tips:</h4>
                  <ul>
                    <li className={password.length >= 8 ? styles.met : ''}>
                      At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(password) ? styles.met : ''}>
                      One uppercase letter
                    </li>
                    <li className={/\d/.test(password) ? styles.met : ''}>
                      One number
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(password) ? styles.met : ''}>
                      One special character
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className={styles.step}>
              <div className={styles.icon}>💾</div>
              <h1 className={styles.title}>Backup Recovery Phrase</h1>
              <p className={styles.description}>
                This setup only shows a recovery phrase if the connected wallet backend returns one during wallet creation.
              </p>
              {recoveryPhrase.length > 0 ? (
                <div className={styles.recoveryPhrase}>
                  {recoveryPhrase.map((word, i) => (
                    <div key={`${i + 1}-${word}`} className={styles.phraseWord}>
                      <span className={styles.wordNumber}>{i + 1}</span>
                      <span className={styles.word}>{word}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.warning}>
                  <span className={styles.warningIcon}>ℹ️</span>
                  <div>
                    <h4>Backend required</h4>
                    <p>
                      The current backend creates the wallet file and encryption state, but may not return a mnemonic for display in this UI.
                    </p>
                  </div>
                </div>
              )}
              <div className={styles.warning}>
                <span className={styles.warningIcon}>⚠️</span>
                <div>
                  <h4>Important</h4>
                  <p>
                    Never share your recovery phrase. Store it securely offline.
                    Anyone with these words can access your wallet.
                  </p>
                </div>
              </div>
              <Checkbox
                label="I understand this setup should only be considered backed up after I verify how recovery data is exported from the wallet backend"
                checked={backupConfirmed}
                onChange={setBackupConfirmed}
              />
            </div>
          )}

          {step === 5 && (
            <div className={styles.step}>
              <div className={styles.icon}>✅</div>
              <h1 className={styles.title}>Almost Done!</h1>
              <p className={styles.description}>
                Review and accept the terms to complete your wallet setup.
              </p>
              <div className={styles.summary}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Wallet Name</span>
                  <span className={styles.summaryValue}>{walletName}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Password</span>
                  <span className={styles.summaryValue}>●●●●●●●●</span>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Recovery Flow:</span>
                    <span className={styles.summaryValue}>
                      {createdMnemonic ? 'Mnemonic returned by backend' : 'Backend-dependent'}
                    </span>
                  </div>
                  {createdAddress && (
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Created Address:</span>
                      <span className={styles.summaryValue}>{createdAddress}</span>
                    </div>
                  )}
                  <span className={styles.summaryLabel}>Recovery Phrase</span>
                  <Badge variant="warning">Pending</Badge>
                </div>
              </div>
              <Divider />
              <div className={styles.terms}>
                <Checkbox
                  label="I accept the Terms of Service and Privacy Policy"
                  checked={termsAccepted}
                  onChange={setTermsAccepted}
                />
                <div className={styles.termsLinks}>
                  <a href="/terms" target="_blank" rel="noreferrer" className={styles.link}>
                    Terms of Service
                  </a>
                  {' • '}
                  <a href="/privacy" target="_blank" rel="noreferrer" className={styles.link}>
                    Privacy Policy
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {step > 1 && (
            <Button
              variant="outline"
              onClick={handleBack}
              icon={<span>←</span>}
              disabled={step === 1 || loading}
            >
              Back
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleNext}
            icon={<span>{step === totalSteps ? '✓' : '→'}</span>}
            disabled={!canProceed() || loading}
          >
            {loading ? 'Creating Wallet…' : step === totalSteps ? 'Complete Setup' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
