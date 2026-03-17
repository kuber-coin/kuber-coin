'use client';

import { useState, useEffect } from 'react';
import settingsService from '../../../src/services/settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState(settingsService.getSettings());
  const [activeTab, setActiveTab] = useState<'general' | 'display' | 'network' | 'privacy' | 'backup'>('general');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  };

  const handleGeneralUpdate = (key: string, value: any) => {
    settingsService.updateGeneralSettings({ [key]: value });
    setSettings(settingsService.getSettings());
    showSuccess('Settings updated');
  };

  const handleDisplayUpdate = (key: string, value: any) => {
    settingsService.updateDisplaySettings({ [key]: value });
    setSettings(settingsService.getSettings());
    showSuccess('Display settings updated');
  };

  const handleNetworkUpdate = (key: string, value: any) => {
    settingsService.updateNetworkSettings({ [key]: value });
    setSettings(settingsService.getSettings());
    showSuccess('Network settings updated');
  };

  const handlePrivacyUpdate = (key: string, value: any) => {
    settingsService.updatePrivacySettings({ [key]: value });
    setSettings(settingsService.getSettings());
    showSuccess('Privacy settings updated');
  };

  const handleBackupUpdate = (key: string, value: any) => {
    settingsService.updateBackupSettings({ [key]: value });
    setSettings(settingsService.getSettings());
    showSuccess('Backup settings updated');
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      settingsService.resetSettings();
      setSettings(settingsService.getSettings());
      showSuccess('Settings reset to defaults');
    }
  };

  const handleExport = () => {
    const data = settingsService.exportSettings();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubercoin-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Settings exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const result = settingsService.importSettings(event.target?.result as string);
            if (result) {
              setSettings(settingsService.getSettings());
              showSuccess('Settings imported successfully');
            } else {
              showError('Failed to import settings');
            }
          } catch (err) {
            showError('Invalid settings file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="text-gray-400">Customize your wallet experience</p>
          </div>
          
          <div className="flex gap-2">
            <button
              data-testid="export-settings-button"
              onClick={handleExport}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition"
            >
              Export
            </button>
            <button
              data-testid="import-settings-button"
              onClick={handleImport}
              className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition"
            >
              Import
            </button>
            <button
              data-testid="reset-settings-button"
              onClick={handleReset}
              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition"
            >
              Reset
            </button>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400">
            {success}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tabs */}
          <div className="space-y-2">
            <button
              data-testid="general-tab-button"
              onClick={() => setActiveTab('general')}
              className={`w-full px-4 py-3 rounded-lg text-left transition ${
                activeTab === 'general'
                  ? 'bg-purple-500 text-white'
                  : 'bg-[#1A1A2E] text-gray-300 hover:bg-purple-500/20'
              }`}
            >
              ⚙️ General
            </button>
            <button
              data-testid="display-tab-button"
              onClick={() => setActiveTab('display')}
              className={`w-full px-4 py-3 rounded-lg text-left transition ${
                activeTab === 'display'
                  ? 'bg-purple-500 text-white'
                  : 'bg-[#1A1A2E] text-gray-300 hover:bg-purple-500/20'
              }`}
            >
              🎨 Display
            </button>
            <button
              data-testid="network-tab-button"
              onClick={() => setActiveTab('network')}
              className={`w-full px-4 py-3 rounded-lg text-left transition ${
                activeTab === 'network'
                  ? 'bg-purple-500 text-white'
                  : 'bg-[#1A1A2E] text-gray-300 hover:bg-purple-500/20'
              }`}
            >
              🌐 Network
            </button>
            <button
              data-testid="privacy-tab-button"
              onClick={() => setActiveTab('privacy')}
              className={`w-full px-4 py-3 rounded-lg text-left transition ${
                activeTab === 'privacy'
                  ? 'bg-purple-500 text-white'
                  : 'bg-[#1A1A2E] text-gray-300 hover:bg-purple-500/20'
              }`}
            >
              🔒 Privacy
            </button>
            <button
              data-testid="backup-tab-button"
              onClick={() => setActiveTab('backup')}
              className={`w-full px-4 py-3 rounded-lg text-left transition ${
                activeTab === 'backup'
                  ? 'bg-purple-500 text-white'
                  : 'bg-[#1A1A2E] text-gray-300 hover:bg-purple-500/20'
              }`}
            >
              💾 Backup
            </button>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 space-y-6">
                <h2 className="text-xl font-semibold mb-4">General Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Language
                  </label>
                  <select
                    data-testid="language-select"
                    value={settings.general.language}
                    onChange={(e) => handleGeneralUpdate('language', e.target.value)}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ja">日本語</option>
                    <option value="zh">中文</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Currency
                  </label>
                  <select
                    data-testid="currency-select"
                    value={settings.general.currency}
                    onChange={(e) => handleGeneralUpdate('currency', e.target.value)}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                    <option value="BTC">BTC - Bitcoin</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-400">
                    Display values in this currency (when available)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Theme
                  </label>
                  <select
                    data-testid="theme-select"
                    value={settings.general.theme}
                    onChange={(e) => handleGeneralUpdate('theme', e.target.value)}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="auto">Auto (System)</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-400">
                    Choose your preferred color theme
                  </p>
                </div>
              </div>
            )}

            {/* Display Settings */}
            {activeTab === 'display' && (
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 space-y-6">
                <h2 className="text-xl font-semibold mb-4">Display Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Unit
                  </label>
                  <select
                    value={settings.display.unit}
                    onChange={(e) => handleDisplayUpdate('unit', e.target.value)}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="KBC">KBC (1.00000000)</option>
                    <option value="mKBC">mKBC (0.001)</option>
                    <option value="sat">Satoshis (0.00000001)</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-400">
                    Display amounts in this unit
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Decimal Places: {settings.display.decimalPlaces}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    value={settings.display.decimalPlaces}
                    onChange={(e) => handleDisplayUpdate('decimalPlaces', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Number of decimal places to show
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Hide Small Balances</h3>
                    <p className="text-sm text-gray-400">Hide wallets below threshold</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.display.hideSmallBalances}
                      onChange={(e) => handleDisplayUpdate('hideSmallBalances', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>

                {settings.display.hideSmallBalances && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Small Balance Threshold (KBC)
                    </label>
                    <input
                      type="number"
                      value={settings.display.smallBalanceThreshold}
                      onChange={(e) => handleDisplayUpdate('smallBalanceThreshold', parseFloat(e.target.value))}
                      step="0.00001"
                      min="0"
                      className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Network Settings */}
            {activeTab === 'network' && (
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 space-y-6">
                <h2 className="text-xl font-semibold mb-4">Network Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Node URL
                  </label>
                  <input
                    data-testid="node-url-input"
                    type="text"
                    value={settings.network.nodeUrl}
                    onChange={(e) => handleNetworkUpdate('nodeUrl', e.target.value)}
                    placeholder="http://localhost:8634"
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    RPC endpoint for blockchain node
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Network
                  </label>
                  <select
                    value={settings.network.network}
                    onChange={(e) => handleNetworkUpdate('network', e.target.value)}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="mainnet">Mainnet</option>
                    <option value="testnet">Testnet</option>
                    <option value="regtest">Regtest</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-400">
                    Choose which network to connect to
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Auto Connect</h3>
                    <p className="text-sm text-gray-400">Connect to node on startup</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.network.autoConnect}
                      onChange={(e) => handleNetworkUpdate('autoConnect', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Connection Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={settings.network.connectionTimeout}
                    onChange={(e) => handleNetworkUpdate('connectionTimeout', parseInt(e.target.value))}
                    min="1000"
                    max="120000"
                    step="1000"
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Timeout for RPC requests (1000-120000ms)
                  </p>
                </div>
              </div>
            )}

            {/* Privacy Settings */}
            {activeTab === 'privacy' && (
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 space-y-6">
                <h2 className="text-xl font-semibold mb-4">Privacy Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Address Derivation Gap
                  </label>
                  <input
                    type="number"
                    value={settings.privacy.addressDerivationGap}
                    onChange={(e) => handlePrivacyUpdate('addressDerivationGap', parseInt(e.target.value))}
                    min="1"
                    max="100"
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Number of unused addresses to maintain (HD wallets)
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Auto Consolidate UTXOs</h3>
                    <p className="text-sm text-gray-400">Automatically consolidate small UTXOs</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.privacy.autoConsolidateUtxos}
                      onChange={(e) => handlePrivacyUpdate('autoConsolidateUtxos', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>

                {settings.privacy.autoConsolidateUtxos && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Consolidation Threshold
                    </label>
                    <input
                      type="number"
                      value={settings.privacy.consolidationThreshold}
                      onChange={(e) => handlePrivacyUpdate('consolidationThreshold', parseInt(e.target.value))}
                      min="1"
                      max="100"
                      className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    />
                    <p className="mt-2 text-sm text-gray-400">
                      Consolidate when UTXO count exceeds this number
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dust Threshold (KBC)
                  </label>
                  <input
                    type="number"
                    value={settings.privacy.dustThreshold}
                    onChange={(e) => handlePrivacyUpdate('dustThreshold', parseFloat(e.target.value))}
                    step="0.00001"
                    min="0"
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Minimum UTXO value to consider
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Avoid Address Reuse</h3>
                    <p className="text-sm text-gray-400">Warn when reusing addresses</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.privacy.avoidAddressReuse}
                      onChange={(e) => handlePrivacyUpdate('avoidAddressReuse', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
              </div>
            )}

            {/* Backup Settings */}
            {activeTab === 'backup' && (
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 space-y-6">
                <h2 className="text-xl font-semibold mb-4">Backup Settings</h2>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Auto Backup</h3>
                    <p className="text-sm text-gray-400">Automatically backup wallet data</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.backup.autoBackup}
                      onChange={(e) => handleBackupUpdate('autoBackup', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>

                {settings.backup.autoBackup && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Backup Frequency
                      </label>
                      <select
                        value={settings.backup.backupFrequency}
                        onChange={(e) => handleBackupUpdate('backupFrequency', e.target.value)}
                        className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Backup Location
                      </label>
                      <input
                        type="text"
                        value={settings.backup.backupLocation}
                        onChange={(e) => handleBackupUpdate('backupLocation', e.target.value)}
                        placeholder="/path/to/backup"
                        className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                      <p className="mt-2 text-sm text-gray-400">
                        Local directory for automatic backups
                      </p>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Cloud Sync</h3>
                    <p className="text-sm text-gray-400">Sync backups to cloud storage</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.backup.cloudSync}
                      onChange={(e) => handleBackupUpdate('cloudSync', e.target.checked)}
                      disabled
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500 opacity-50"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-400">
                  <span className="inline-block px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Coming Soon</span> Cloud sync feature will be available in future update
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Encrypt Backups</h3>
                    <p className="text-sm text-gray-400">Password-protect backup files</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.backup.encryptBackups}
                      onChange={(e) => handleBackupUpdate('encryptBackups', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-gray-700 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
