'use client';

import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

interface BackupWizardProps {
  onCompleteAction: (backupType: string, options: any) => void;
  onCancelAction: () => void;
  /** The wallet's BIP-39 mnemonic to display in step 3. Must be supplied by
   * the caller from an authenticated wallet-export API call; never hard-coded. */
  seedPhrase: string;
}

export function BackupWizard({ onCompleteAction, onCancelAction, seedPhrase }: BackupWizardProps) {
  const [step, setStep] = useState(1);
  const [backupType, setBackupType] = useState<'shamir' | 'social' | 'cloud' | 'local'>('shamir');
  const [shamirShares, setShamirShares] = useState(5);
  const [shamirThreshold, setShamirThreshold] = useState(3);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verified, setVerified] = useState(false);

  const handleNext = () => {
    if (step === 1) {
      // Validate backup type selection
      if (!backupType) {
        alert('Please select a backup type');
        return;
      }
    }

    if (step === 2) {
      // Validate options based on backup type
      if (backupType === 'shamir') {
        if (shamirThreshold > shamirShares) {
          alert('Threshold cannot exceed total shares');
          return;
        }
      }
      if ((backupType === 'cloud' || backupType === 'local') && !encryptionPassword) {
        alert('Please enter an encryption password');
        return;
      }
      if (encryptionPassword !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
    }

    if (step === 3) {
      if (!verified) {
        alert('Please verify your seed phrase before proceeding');
        return;
      }
    }

    setStep(step + 1);
  };

  const handleComplete = () => {
    const options: any = {
      encryptionPassword: encryptionPassword || undefined,
    };

    if (backupType === 'shamir') {
      options.shares = shamirShares;
      options.threshold = shamirThreshold;
    }

    onCompleteAction(backupType, options);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Create Backup</h2>
            <button onClick={onCancelAction} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Step {step} of 4</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Step 1: Choose Backup Type */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold mb-4">Choose Backup Method</h3>

              <div className="grid grid-cols-2 gap-4">
                <Card
                  className={`p-6 cursor-pointer transition-all ${
                    backupType === 'shamir' ? 'border-2 border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setBackupType('shamir')}
                >
                  <div className="text-4xl mb-3">🔐</div>
                  <h4 className="font-semibold text-lg mb-2">Shamir's Secret Sharing</h4>
                  <p className="text-sm text-gray-600">Split seed into N shares, require M to recover</p>
                </Card>

                <Card
                  className={`p-6 cursor-pointer transition-all ${
                    backupType === 'social' ? 'border-2 border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setBackupType('social')}
                >
                  <div className="text-4xl mb-3">👥</div>
                  <h4 className="font-semibold text-lg mb-2">Social Recovery</h4>
                  <p className="text-sm text-gray-600">Trusted contacts hold recovery shares</p>
                </Card>

                <Card
                  className={`p-6 cursor-pointer transition-all ${
                    backupType === 'cloud' ? 'border-2 border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setBackupType('cloud')}
                >
                  <div className="text-4xl mb-3">☁️</div>
                  <h4 className="font-semibold text-lg mb-2">Encrypted Cloud</h4>
                  <p className="text-sm text-gray-600">AES-256 encrypted backup to cloud storage</p>
                </Card>

                <Card
                  className={`p-6 cursor-pointer transition-all ${
                    backupType === 'local' ? 'border-2 border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setBackupType('local')}
                >
                  <div className="text-4xl mb-3">💾</div>
                  <h4 className="font-semibold text-lg mb-2">Local File</h4>
                  <p className="text-sm text-gray-600">Download encrypted backup file</p>
                </Card>
              </div>
            </div>
          )}

          {/* Step 2: Configure Options */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Configure Backup</h3>

              {backupType === 'shamir' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total Shares (N)
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={shamirShares}
                        onChange={(e) => setShamirShares(parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Threshold (M)
                      </label>
                      <input
                        type="number"
                        min="2"
                        max={shamirShares}
                        value={shamirThreshold}
                        onChange={(e) => setShamirThreshold(parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      Your seed will be split into {shamirShares} shares. You'll need any {shamirThreshold} shares to recover your wallet.
                    </p>
                  </div>
                </>
              )}

              {(backupType === 'cloud' || backupType === 'local') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Encryption Password
                    </label>
                    <input
                      type="password"
                      value={encryptionPassword}
                      onChange={(e) => setEncryptionPassword(e.target.value)}
                      placeholder="Enter strong password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>⚠️ Important:</strong> You must remember this password. Without it, you cannot recover your backup.
                    </p>
                  </div>
                </>
              )}

              {backupType === 'social' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    You'll assign recovery shares to trusted contacts on the next screen.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: View Seed Phrase */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Verify Seed Phrase</h3>

              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6">
                <p className="text-sm text-yellow-800 mb-4">
                  <strong>⚠️ Write this down on paper and store securely!</strong>
                </p>

                <div className="bg-white rounded-lg p-4 font-mono text-sm border-2 border-gray-300">
                  {seedPhrase
                    ? seedPhrase
                    : <span className="text-red-600">Seed phrase unavailable. Export your mnemonic from Wallet → Settings → Export Seed before starting this backup.</span>
                  }
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="verified"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="mt-1"
                />
                <label htmlFor="verified" className="text-sm">
                  I have written down my seed phrase and stored it in a secure location. I understand that without this seed phrase, I cannot recover my wallet.
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Backup Created Successfully!</h3>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h4 className="text-lg font-semibold text-green-900 mb-2">Backup Complete</h4>
                <p className="text-sm text-green-800">
                  Your wallet backup has been created using {backupType} method.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="font-semibold mb-2">Next Steps:</h5>
                <ul className="text-sm space-y-1 text-blue-800">
                  <li>• Test your backup by attempting a recovery</li>
                  <li>• Store backup materials in multiple secure locations</li>
                  <li>• Never share your seed phrase or recovery shares</li>
                  <li>• Verify your backup regularly (monthly recommended)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="secondary"
              onClick={step === 1 ? onCancelAction : () => setStep(step - 1)}
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>

            <Button
              variant="primary"
              onClick={step === 4 ? handleComplete : handleNext}
              disabled={step === 3 && !verified}
            >
              {step === 4 ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
