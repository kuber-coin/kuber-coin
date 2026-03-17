'use client';

import { useState } from 'react';
import Link from 'next/link';
import walletService from '@/services/wallet';

export default function ImportExportPage() {
  const [selectedView, setSelectedView] = useState<'import' | 'export'>('import');
  const [importFormat, setImportFormat] = useState<'json' | 'csv' | 'private-key'>('json');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'pdf'>('json');
  const [fileContent, setFileContent] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setFileContent(text);
  };

  const handleImportJSON = () => {
    try {
      const wallets = JSON.parse(fileContent);
      
      if (Array.isArray(wallets)) {
        let imported = 0;
        wallets.forEach((w: any) => {
          if (w.privateKey && w.address) {
            try {
              walletService.importWallet(w.privateKey, w.label || 'Imported Wallet');
              imported++;
            } catch (err) {
              console.error('Failed to import wallet:', err);
            }
          }
        });
        setSuccess(`Imported ${imported} wallet(s)`);
      } else {
        setError('Invalid JSON format');
      }
    } catch (err: any) {
      setError('Failed to parse JSON file');
    }
  };

  const handleImportCSV = () => {
    try {
      const lines = fileContent.split('\n').filter(l => l.trim());
      let imported = 0;

      lines.forEach((line, index) => {
        if (index === 0) return; // Skip header
        
        const [address, privateKey, labelVal] = line.split(',').map(s => s.trim());
        if (privateKey && address) {
          try {
            walletService.importWallet(privateKey, labelVal || 'Imported Wallet');
            imported++;
          } catch (err) {
            console.error('Failed to import wallet:', err);
          }
        }
      });

      setSuccess(`Imported ${imported} wallet(s)`);
    } catch (err: any) {
      setError('Failed to parse CSV file');
    }
  };

  const handleImportPrivateKey = () => {
    if (!privateKey.trim()) {
      setError('Please enter a private key');
      return;
    }

    try {
      walletService.importWallet(privateKey, label || 'Imported Wallet');
      setSuccess('Wallet imported successfully');
      setPrivateKey('');
      setLabel('');
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet');
    }
  };

  const handleExportJSON = () => {
    const wallets = walletService.getWallets();
    const data = JSON.stringify(wallets, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets_${Date.now()}.json`;
    a.click();
    setSuccess('Wallets exported as JSON');
  };

  const handleExportCSV = () => {
    const wallets = walletService.getWallets();
    const lines = ['Address,Private Key,Label,Balance'];
    
    wallets.forEach((w) => {
      lines.push(`${w.address},${w.privateKey || ''},${w.label},${w.balance}`);
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets_${Date.now()}.csv`;
    a.click();
    setSuccess('Wallets exported as CSV');
  };

  const handleExportPDF = () => {
    const wallets = walletService.getWallets();
    let pdf = 'KUBERCOIN WALLET REPORT\n\n';
    pdf += `Generated: ${new Date().toLocaleString()}\n`;
    pdf += `Total Wallets: ${wallets.length}\n`;
    pdf += `Total Balance: ${wallets.reduce((sum, w) => sum + w.balance, 0).toFixed(8)} KC\n\n`;
    
    wallets.forEach((w, i) => {
      pdf += `\nWallet ${i + 1}:\n`;
      pdf += `Label: ${w.label}\n`;
      pdf += `Address: ${w.address}\n`;
      pdf += `Balance: ${w.balance.toFixed(8)} KC\n`;
      if (w.watchOnly) pdf += `Type: Watch-Only\n`;
    });

    const blob = new Blob([pdf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet_report_${Date.now()}.txt`;
    a.click();
    setSuccess('Wallet report generated');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/wallet" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
              ← Back
            </Link>
            <h1 className="text-3xl font-bold text-white">📦 Import/Export</h1>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-white">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-500/20 border border-green-500 rounded-lg text-white">
            {success}
          </div>
        )}

        {/* View Selector */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedView('import')}
            className={`flex-1 px-6 py-3 rounded-lg transition font-semibold ${
              selectedView === 'import'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                : 'bg-purple-700 hover:bg-purple-600'
            }`}
          >
            📥 Import
          </button>
          <button
            onClick={() => setSelectedView('export')}
            className={`flex-1 px-6 py-3 rounded-lg transition font-semibold ${
              selectedView === 'export'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                : 'bg-purple-700 hover:bg-purple-600'
            }`}
          >
            📤 Export
          </button>
        </div>

        {/* Import View */}
        {selectedView === 'import' && (
          <div className="space-y-6">
            {/* Format Selector */}
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Import Format</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setImportFormat('json')}
                  className={`p-4 rounded-lg border-2 transition ${
                    importFormat === 'json'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📄</div>
                  <div className="font-semibold text-white">JSON File</div>
                  <div className="text-sm text-purple-300">Wallet backup files</div>
                </button>

                <button
                  onClick={() => setImportFormat('csv')}
                  className={`p-4 rounded-lg border-2 transition ${
                    importFormat === 'csv'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📊</div>
                  <div className="font-semibold text-white">CSV File</div>
                  <div className="text-sm text-purple-300">Bulk wallet import</div>
                </button>

                <button
                  onClick={() => setImportFormat('private-key')}
                  className={`p-4 rounded-lg border-2 transition ${
                    importFormat === 'private-key'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">🔑</div>
                  <div className="font-semibold text-white">Private Key</div>
                  <div className="text-sm text-purple-300">Single wallet import</div>
                </button>
              </div>
            </div>

            {/* Import Form */}
            {importFormat === 'json' && (
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Import from JSON</h3>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-purple-200 mb-2 block">Select JSON File</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                    />
                  </label>
                  <button
                    onClick={handleImportJSON}
                    disabled={!fileContent}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
                  >
                    Import Wallets
                  </button>
                </div>
              </div>
            )}

            {importFormat === 'csv' && (
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Import from CSV</h3>
                <div className="space-y-4">
                  <div className="p-3 bg-blue-500/20 border border-blue-500 rounded text-sm text-blue-200">
                    <p className="font-semibold mb-1">CSV Format:</p>
                    <p className="font-mono text-xs">Address,Private Key,Label,Balance</p>
                  </div>
                  <label className="block">
                    <span className="text-purple-200 mb-2 block">Select CSV File</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                    />
                  </label>
                  <button
                    onClick={handleImportCSV}
                    disabled={!fileContent}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
                  >
                    Import Wallets
                  </button>
                </div>
              </div>
            )}

            {importFormat === 'private-key' && (
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Import Private Key</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-purple-200 mb-2">Private Key</label>
                    <input
                      type="password"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white font-mono"
                      placeholder="Enter private key"
                    />
                  </div>
                  <div>
                    <label className="block text-purple-200 mb-2">Label (Optional)</label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
                      placeholder="My Wallet"
                    />
                  </div>
                  <button
                    onClick={handleImportPrivateKey}
                    disabled={!privateKey}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
                  >
                    Import Wallet
                  </button>
                </div>
              </div>
            )}

            {/* Security Warning */}
            <div className="p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="text-sm text-yellow-200">
                  <p className="font-semibold mb-1">Security Warning:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Never share your private keys or backup files</li>
                    <li>Only import from trusted sources</li>
                    <li>Verify file contents before importing</li>
                    <li>Keep backups in secure, encrypted storage</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export View */}
        {selectedView === 'export' && (
          <div className="space-y-6">
            {/* Export Options */}
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Export Format</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  onClick={() => setExportFormat('json')}
                  className={`p-4 rounded-lg border-2 transition ${
                    exportFormat === 'json'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📄</div>
                  <div className="font-semibold text-white">JSON</div>
                  <div className="text-sm text-purple-300">Full backup</div>
                </button>

                <button
                  onClick={() => setExportFormat('csv')}
                  className={`p-4 rounded-lg border-2 transition ${
                    exportFormat === 'csv'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📊</div>
                  <div className="font-semibold text-white">CSV</div>
                  <div className="text-sm text-purple-300">Spreadsheet format</div>
                </button>

                <button
                  onClick={() => setExportFormat('pdf')}
                  className={`p-4 rounded-lg border-2 transition ${
                    exportFormat === 'pdf'
                      ? 'border-pink-500 bg-pink-500/20'
                      : 'border-purple-600 bg-purple-800/30 hover:border-purple-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📋</div>
                  <div className="font-semibold text-white">Report</div>
                  <div className="text-sm text-purple-300">Readable summary</div>
                </button>
              </div>

              <button
                onClick={() => {
                  if (exportFormat === 'json') handleExportJSON();
                  else if (exportFormat === 'csv') handleExportCSV();
                  else handleExportPDF();
                }}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
              >
                Export as {exportFormat.toUpperCase()}
              </button>
            </div>

            {/* Export Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="font-semibold text-white mb-3">What's Included</h3>
                <ul className="text-sm text-purple-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>All wallet addresses and labels</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>Private keys (JSON/CSV only)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>Current balances</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>Watch-only indicators</span>
                  </li>
                </ul>
              </div>

              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="font-semibold text-white mb-3">Best Practices</h3>
                <ul className="text-sm text-purple-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span>💾</span>
                    <span>Export backups regularly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🔒</span>
                    <span>Store in encrypted location</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>📦</span>
                    <span>Keep multiple backup copies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🔐</span>
                    <span>Never share backup files</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
