'use client';

import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

interface MultiSigSetupProps {
  onCompleteAction: (walletData: {
    name: string;
    requiredSignatures: number;
    coSigners: { name: string; address: string; role: 'admin' | 'signer' | 'viewer' }[];
    spendingLimit?: number;
    timeLockHours?: number;
  }) => void;
  onCancelAction: () => void;
}

export function MultiSigSetup({ onCompleteAction, onCancelAction }: MultiSigSetupProps) {
  const [step, setStep] = useState(1);
  const [walletName, setWalletName] = useState('');
  const [requiredSignatures, setRequiredSignatures] = useState(2);
  const [totalSigners, setTotalSigners] = useState(3);
  const [coSigners, setCoSigners] = useState<{ name: string; address: string; role: 'admin' | 'signer' | 'viewer' }[]>([
    { name: '', address: '', role: 'admin' },
    { name: '', address: '', role: 'signer' },
    { name: '', address: '', role: 'signer' },
  ]);
  const [spendingLimit, setSpendingLimit] = useState('');
  const [enableSpendingLimit, setEnableSpendingLimit] = useState(false);
  const [timeLockHours, setTimeLockHours] = useState('24');
  const [enableTimeLock, setEnableTimeLock] = useState(false);

  const handleNext = () => {
    if (step === 1) {
      if (!walletName.trim()) {
        alert('Please enter a wallet name');
        return;
      }
      if (requiredSignatures > totalSigners) {
        alert('Required signatures cannot exceed total signers');
        return;
      }
      if (requiredSignatures < 1) {
        alert('At least 1 signature is required');
        return;
      }
      
      // Adjust co-signers array to match totalSigners
      const newCoSigners = [...coSigners];
      while (newCoSigners.length < totalSigners) {
        newCoSigners.push({ name: '', address: '', role: 'signer' });
      }
      while (newCoSigners.length > totalSigners) {
        newCoSigners.pop();
      }
      setCoSigners(newCoSigners);
    }

    if (step === 2) {
      // Validate all co-signers
      for (let i = 0; i < coSigners.length; i++) {
        if (!coSigners[i].name.trim()) {
          alert(`Please enter name for co-signer ${i + 1}`);
          return;
        }
        if (!coSigners[i].address.trim()) {
          alert(`Please enter address for co-signer ${i + 1}`);
          return;
        }
        if (!coSigners[i].address.startsWith('KC1')) {
          alert(`Invalid address format for co-signer ${i + 1}`);
          return;
        }
      }

      // Check for duplicate addresses
      const addresses = coSigners.map(cs => cs.address);
      const uniqueAddresses = new Set(addresses);
      if (addresses.length !== uniqueAddresses.size) {
        alert('Duplicate addresses detected. Each co-signer must have a unique address.');
        return;
      }
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleComplete = () => {
    const walletData = {
      name: walletName,
      requiredSignatures,
      coSigners,
      spendingLimit: enableSpendingLimit && spendingLimit ? parseFloat(spendingLimit) : undefined,
      timeLockHours: enableTimeLock && timeLockHours ? parseFloat(timeLockHours) : undefined,
    };

    onCompleteAction(walletData);
  };

  const updateCoSigner = (index: number, field: 'name' | 'address' | 'role', value: string) => {
    const newCoSigners = [...coSigners];
    if (field === 'role') {
      newCoSigners[index][field] = value as 'admin' | 'signer' | 'viewer';
    } else {
      newCoSigners[index][field] = value;
    }
    setCoSigners(newCoSigners);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Create Multi-Sig Wallet</h2>
            <button onClick={onCancelAction} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Step {step} of 3</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* Step 1: Basic Configuration */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Basic Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wallet Name
                </label>
                <input
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="e.g., Company Treasury, Family Savings"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Required Signatures (M)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={totalSigners}
                    value={requiredSignatures}
                    onChange={(e) => setRequiredSignatures(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Signers (N)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={totalSigners}
                    onChange={(e) => setTotalSigners(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>M-of-N Signatures:</strong> This wallet will require {requiredSignatures} out of {totalSigners} co-signers to approve each transaction.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Co-Signers */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Add Co-Signers</h3>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {coSigners.map((coSigner, index) => (
                  <Card key={index} className="p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Co-Signer {index + 1}</span>
                      <select
                        value={coSigner.role}
                        onChange={(e) => updateCoSigner(index, 'role', e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="admin">Admin</option>
                        <option value="signer">Signer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={coSigner.name}
                        onChange={(e) => updateCoSigner(index, 'name', e.target.value)}
                        placeholder="Name (e.g., Alice, CFO)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />

                      <input
                        type="text"
                        value={coSigner.address}
                        onChange={(e) => updateCoSigner(index, 'address', e.target.value)}
                        placeholder="KC1..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                      />
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      {coSigner.role === 'admin' && '• Can approve transactions, manage settings, add/remove signers'}
                      {coSigner.role === 'signer' && '• Can approve transactions only'}
                      {coSigner.role === 'viewer' && '• Can view transactions only (no signing)'}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Security Settings */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Security Settings</h3>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableSpendingLimit"
                    checked={enableSpendingLimit}
                    onChange={(e) => setEnableSpendingLimit(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="enableSpendingLimit" className="font-medium">
                    Enable Spending Limit
                  </label>
                </div>

                {enableSpendingLimit && (
                  <div className="ml-7">
                    <input
                      type="number"
                      value={spendingLimit}
                      onChange={(e) => setSpendingLimit(e.target.value)}
                      placeholder="Maximum amount per transaction"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Transactions above this amount will be rejected automatically
                    </p>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableTimeLock"
                    checked={enableTimeLock}
                    onChange={(e) => setEnableTimeLock(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="enableTimeLock" className="font-medium">
                    Enable Time Lock
                  </label>
                </div>

                {enableTimeLock && (
                  <div className="ml-7">
                    <input
                      type="number"
                      value={timeLockHours}
                      onChange={(e) => setTimeLockHours(e.target.value)}
                      placeholder="Hours to wait before execution"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Approved transactions will wait this many hours before execution
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Important:</strong> These security settings can be modified later by wallet admins.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">Wallet Summary</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Name: {walletName}</li>
                  <li>• Signature Requirement: {requiredSignatures} of {totalSigners}</li>
                  <li>• Co-Signers: {coSigners.length}</li>
                  {enableSpendingLimit && <li>• Spending Limit: {spendingLimit} KC</li>}
                  {enableTimeLock && <li>• Time Lock: {timeLockHours} hours</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="secondary"
              onClick={step === 1 ? onCancelAction : handleBack}
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>

            <Button
              variant="primary"
              onClick={step === 3 ? handleComplete : handleNext}
            >
              {step === 3 ? 'Create Wallet' : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
