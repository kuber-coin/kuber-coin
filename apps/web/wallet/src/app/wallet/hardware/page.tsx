'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import HardwareWalletSetup from '@/components/HardwareWalletSetup';
import hardwareWallet, { HardwareDevice, HardwareWalletType } from '@/services/hardwareWallet';

export default function HardwareWalletPage() {
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<HardwareDevice | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = () => {
    setDevices(hardwareWallet.getConnectedDevices());
  };

  const handleConnect = async (type: HardwareWalletType) => {
    setIsConnecting(true);
    try {
      const device = await hardwareWallet.connectDevice(type);
      setSelectedDevice(device);
      loadDevices();
      alert(`Successfully connected to ${device.name}!`);
      
      // Load addresses
      const addrs = await hardwareWallet.getAddresses(device.id, 0, 5);
      setAddresses(addrs);
    } catch (error: any) {
      alert(`Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = (deviceId: string) => {
    hardwareWallet.disconnectDevice(deviceId);
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice(null);
      setAddresses([]);
    }
    loadDevices();
  };

  const handleSignTransaction = async () => {
    if (!selectedDevice) {
      alert('Please connect a hardware wallet first');
      return;
    }

    try {
      // Example transaction
      const tx = {
        to: 'KC1abc123...',
        amount: 1.5,
        fee: 0.001,
      };

      alert('Please confirm the transaction on your hardware wallet device...');
      const signature = await hardwareWallet.signTransaction(selectedDevice.id, tx);
      alert(`Transaction signed successfully!\n\nSignature: ${signature.slice(0, 20)}...`);
    } catch (error: any) {
      alert(`Signing failed: ${error.message}`);
    }
  };

  const handleVerifyAddress = async (address: string) => {
    if (!selectedDevice) return;

    try {
      alert('Please check the address on your hardware wallet screen...');
      const verified = await hardwareWallet.verifyAddress(selectedDevice.id, address);
      if (verified) {
        alert('✅ Address verified on device!');
      } else {
        alert('❌ Address verification failed!');
      }
    } catch (error: any) {
      alert(`Verification failed: ${error.message}`);
    }
  };

  const handleCheckFirmware = async () => {
    if (!selectedDevice) return;

    try {
      const firmware = await hardwareWallet.getFirmwareVersion(selectedDevice.id);
      const updateAvailable = await hardwareWallet.checkFirmwareUpdate(selectedDevice.id);
      
      alert(
        `Firmware Version: ${firmware}\n\n` +
        (updateAvailable 
          ? '🔄 Update available! Please update via device manufacturer\'s app.'
          : '✅ Firmware is up to date!')
      );
    } catch (error: any) {
      alert(`Firmware check failed: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Hardware Wallet Integration</h1>
        <p className="text-gray-600">
          Connect and manage Ledger, Trezor, and other hardware wallets for maximum security
        </p>
      </div>

      {/* Hardware Wallet Setup Modal */}
      {showSetup && (
        <HardwareWalletSetup
          onCloseAction={() => setShowSetup(false)}
          onConnectAction={handleConnect}
        />
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-gray-600">Connected Devices</div>
          <div className="text-2xl font-bold">{devices.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Active Device</div>
          <div className="text-2xl font-bold">{selectedDevice ? selectedDevice.name : 'None'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Total Addresses</div>
          <div className="text-2xl font-bold">{addresses.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Security Level</div>
          <div className="text-2xl font-bold text-green-600">🔒 Maximum</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Connect Hardware Wallet */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Connect Hardware Wallet</h2>
          
          <div className="space-y-4">
            {/* Ledger */}
            <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">💾</div>
                  <div>
                    <div className="font-semibold text-lg">Ledger</div>
                    <div className="text-sm text-gray-600">Nano S, Nano X, Nano S Plus</div>
                  </div>
                </div>
                <Button
                  onClick={() => handleConnect('ledger')}
                  disabled={isConnecting}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                ✓ USB Connection ✓ Bluetooth ✓ WebAuthn
              </div>
            </div>

            {/* Trezor */}
            <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">🔐</div>
                  <div>
                    <div className="font-semibold text-lg">Trezor</div>
                    <div className="text-sm text-gray-600">Model One, Model T, Safe 3</div>
                  </div>
                </div>
                <Button
                  onClick={() => handleConnect('trezor')}
                  disabled={isConnecting}
                  className="bg-green-500 hover:bg-green-600"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                ✓ USB Connection ✓ WebUSB API
              </div>
            </div>

            {/* Other Hardware Wallets */}
            <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">🛡️</div>
                  <div>
                    <div className="font-semibold text-lg">Other Devices</div>
                    <div className="text-sm text-gray-600">Generic HID support</div>
                  </div>
                </div>
                <Button
                  onClick={() => handleConnect('generic')}
                  disabled={isConnecting}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                ✓ WebHID API ✓ Generic Protocol
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm font-semibold text-blue-900 mb-2">💡 Connection Tips</div>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Make sure your device is unlocked</li>
              <li>• Open the Kubercoin app on your device</li>
              <li>• Enable browser support in device settings</li>
              <li>• Use the original USB cable for best reliability</li>
            </ul>
          </div>

          <button
            onClick={() => setShowSetup(true)}
            className="mt-4 w-full text-sm text-blue-600 hover:underline"
          >
            📖 Setup Guide & Troubleshooting
          </button>
        </Card>

        {/* Right: Connected Devices & Actions */}
        <div className="space-y-6">
          {/* Connected Devices */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Connected Devices ({devices.length})</h2>
            
            {devices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🔌</div>
                <div>No hardware wallets connected</div>
                <div className="text-sm">Connect a device to get started</div>
              </div>
            ) : (
              <div className="space-y-3">
                {devices.map(device => (
                  <div
                    key={device.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedDevice?.id === device.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedDevice(device)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{device.name}</div>
                        <div className="text-sm text-gray-600">{device.model}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Firmware: {device.firmwareVersion}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {selectedDevice?.id === device.id && (
                          <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                            Active
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnect(device.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                    
                    {device.connected && (
                      <div className="mt-2 flex gap-2 text-xs">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                          ✓ Connected
                        </span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                          {device.connectionType}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Device Actions */}
          {selectedDevice && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Device Actions</h2>
              
              <div className="space-y-3">
                <Button
                  onClick={handleSignTransaction}
                  className="w-full"
                >
                  ✍️ Sign Transaction
                </Button>
                
                <Button
                  onClick={handleCheckFirmware}
                  className="w-full bg-purple-500 hover:bg-purple-600"
                >
                  🔄 Check Firmware Update
                </Button>
                
                <Button
                  onClick={() => {
                    alert('Address generation initiated...');
                  }}
                  className="w-full bg-green-500 hover:bg-green-600"
                >
                  ➕ Generate New Address
                </Button>
                
                <Button
                  onClick={() => {
                    alert('Export public key functionality');
                  }}
                  className="w-full bg-gray-500 hover:bg-gray-600"
                >
                  📤 Export Public Key
                </Button>
              </div>
            </Card>
          )}

          {/* Device Addresses */}
          {selectedDevice && addresses.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Device Addresses</h2>
              
              <div className="space-y-2">
                {addresses.map((address, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Address #{index}</div>
                        <div className="text-sm font-mono">{address}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVerifyAddress(address)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(address);
                            alert('Address copied!');
                          }}
                          className="text-sm text-gray-600 hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                <button
                  className="w-full py-2 text-sm text-blue-600 hover:underline"
                  onClick={async () => {
                    const moreAddrs = await hardwareWallet.getAddresses(
                      selectedDevice.id,
                      addresses.length,
                      addresses.length + 5
                    );
                    setAddresses([...addresses, ...moreAddrs]);
                  }}
                >
                  Load More Addresses
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Security Notice */}
      <Card className="mt-6 p-6 bg-yellow-50 border-yellow-200">
        <div className="flex gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <div className="font-semibold text-yellow-900 mb-2">Security Best Practices</div>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Always verify addresses on your hardware wallet screen before confirming transactions</li>
              <li>• Never share your seed phrase or PIN with anyone</li>
              <li>• Keep your device firmware updated</li>
              <li>• Use the official manufacturer's apps for firmware updates</li>
              <li>• Store your recovery phrase in a secure offline location</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
