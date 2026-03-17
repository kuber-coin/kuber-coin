'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { HardwareWalletType } from '@/services/hardwareWallet';

interface HardwareWalletSetupProps {
  onCloseAction: () => void;
  onConnectAction: (type: HardwareWalletType) => void;
}

export default function HardwareWalletSetup({ onCloseAction, onConnectAction }: HardwareWalletSetupProps) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<HardwareWalletType>('ledger');

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onConnectAction(selectedType);
      onCloseAction();
    }
  };

  return (
    <Modal open onCloseAction={onCloseAction} title="Hardware Wallet Setup Guide">
      <div className="space-y-6">
        {/* Progress Bar */}
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full mx-1 ${
                s <= step ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1: Choose Your Device</h3>
              <p className="text-gray-600">
                Select the type of hardware wallet you want to connect.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => setSelectedType('ledger')}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
                    selectedType === 'ledger'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">💾</div>
                    <div>
                      <div className="font-semibold">Ledger</div>
                      <div className="text-sm text-gray-600">Nano S, Nano X, Nano S Plus</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedType('trezor')}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
                    selectedType === 'trezor'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">🔐</div>
                    <div>
                      <div className="font-semibold">Trezor</div>
                      <div className="text-sm text-gray-600">Model One, Model T, Safe 3</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedType('generic')}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
                    selectedType === 'generic'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">🛡️</div>
                    <div>
                      <div className="font-semibold">Other</div>
                      <div className="text-sm text-gray-600">Generic hardware wallet</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2: Prepare Your Device</h3>
              <p className="text-gray-600">Follow these steps to prepare your {selectedType} for connection:</p>

              <div className="space-y-3">
                <div className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl">1️⃣</div>
                  <div>
                    <div className="font-medium">Connect your device</div>
                    <div className="text-sm text-gray-600">
                      Plug your {selectedType} into your computer using the USB cable
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl">2️⃣</div>
                  <div>
                    <div className="font-medium">Unlock your device</div>
                    <div className="text-sm text-gray-600">Enter your PIN code to unlock</div>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl">3️⃣</div>
                  <div>
                    <div className="font-medium">Open the Kubercoin app</div>
                    <div className="text-sm text-gray-600">
                      Navigate to and open the Kubercoin application on your device
                    </div>
                  </div>
                </div>

                {selectedType === 'ledger' && (
                  <div className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                    <div className="text-xl">4️⃣</div>
                    <div>
                      <div className="font-medium">Enable browser support</div>
                      <div className="text-sm text-gray-600">
                        Make sure "Browser support" is enabled in Settings → Experimental features
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3: Browser Permissions</h3>
              <p className="text-gray-600">
                Your browser will ask for permission to connect to your hardware wallet.
              </p>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex gap-2">
                  <div className="text-xl">⚠️</div>
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-900">Important</div>
                    <div className="text-sm text-yellow-800">
                      Only grant permission to hardware wallets that you recognize and trust.
                      Never share your device with untrusted websites.
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Required permissions:</div>
                <ul className="text-sm text-gray-600 space-y-1 ml-4">
                  <li>✓ USB device access (for wired connection)</li>
                  <li>✓ WebUSB API (for Ledger/Trezor)</li>
                  {selectedType === 'ledger' && <li>✓ Bluetooth (for Ledger Nano X)</li>}
                  <li>✓ HID device access (for generic wallets)</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm">
                  <strong>What happens next:</strong>
                  <ol className="mt-2 space-y-1 ml-4">
                    <li>1. Click "Connect" below</li>
                    <li>2. Browser will show a device selection dialog</li>
                    <li>3. Select your {selectedType} from the list</li>
                    <li>4. Click "Connect" in the browser dialog</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 4: Verify Connection</h3>
              <p className="text-gray-600">
                Once connected, you can verify your device and start using it securely.
              </p>

              <div className="space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="font-semibold text-green-900 mb-2">✅ Security Checklist</div>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>✓ Device firmware is up to date</li>
                    <li>✓ Genuine device from official source</li>
                    <li>✓ Recovery phrase backed up securely offline</li>
                    <li>✓ PIN protection enabled</li>
                    <li>✓ Passphrase protection (optional but recommended)</li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="font-semibold text-blue-900 mb-2">💡 Best Practices</div>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Always verify addresses on device screen before sending</li>
                    <li>• Keep device firmware updated via official apps</li>
                    <li>• Never enter seed phrase on computer/phone</li>
                    <li>• Use official cables and avoid public USB ports</li>
                    <li>• Enable additional security features (U2F, passphrase)</li>
                  </ul>
                </div>
              </div>

              <div className="text-center text-sm text-gray-600">
                Click "Connect Device" below to establish the connection
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            onClick={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                onCloseAction();
              }
            }}
            className="bg-gray-500 hover:bg-gray-600"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          
          <div className="text-sm text-gray-600">Step {step} of 4</div>
          
          <Button onClick={handleNext}>
            {step === 4 ? 'Connect Device' : 'Next'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
