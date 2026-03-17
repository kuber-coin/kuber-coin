'use client';

import { useRef, useState, useEffect } from 'react';
import backupService from '../../../src/services/backup';

export default function BackupPage() {
  const [summary, setSummary] = useState<{
    walletCount: number;
    contactCount: number;
    labelCount: number;
    lastBackup?: number;
  }>({ walletCount: 0, contactCount: 0, labelCount: 0, lastBackup: undefined });

  useEffect(() => {
    setSummary(backupService.getBackupSummary());
  }, []);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [encryptBackup, setEncryptBackup] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const backupPasswordRef = useRef<HTMLInputElement | null>(null);

  const handleCreateBackup = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const resolvedPassword = encryptBackup
        ? backupPassword || backupPasswordRef.current?.value || ''
        : '';
      if (encryptBackup && !resolvedPassword) {
        setError('Please enter a password for encrypted backup');
        setLoading(false);
        return;
      }

      const backupData = await backupService.createFullBackup(
        encryptBackup ? resolvedPassword : undefined
      );

      // Create download
      const blob = new Blob([backupData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kubercoin-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      backupService.recordBackup();
      setSummary(backupService.getBackupSummary());
      
      setSuccess('Backup created successfully!');
      setBackupPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setShowRestoreDialog(true);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await restoreFile.text();
      await backupService.restoreFromBackup(text, restorePassword || undefined);
      
      setSuccess('Backup restored successfully! Please reload the page.');
      setShowRestoreDialog(false);
      setRestoreFile(null);
      setRestorePassword('');
      
      // Reload page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to restore backup');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = (type: 'wallets' | 'transactions' | 'contacts') => {
    try {
      const csv = backupService.exportToCSV(type);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kubercoin-${type}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccess(`${type} exported to CSV`);
    } catch (err: any) {
      setError(err.message || 'Failed to export CSV');
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Backup & Restore
          </h1>
          <p className="text-gray-400">Protect your wallet data with encrypted backups</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Backup Summary */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Backup Summary</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400">Wallets</p>
                <p className="text-2xl font-bold text-purple-400">{summary.walletCount}</p>
              </div>
              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400">Contacts</p>
                <p className="text-2xl font-bold text-blue-400">{summary.contactCount}</p>
              </div>
              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400">Labels</p>
                <p className="text-2xl font-bold text-green-400">{summary.labelCount}</p>
              </div>
              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400">Last Backup</p>
                <p className="text-lg font-bold text-yellow-400">
                  {summary.lastBackup
                    ? new Date(summary.lastBackup).toLocaleDateString()
                    : 'Never'}
                </p>
              </div>
            </div>
          </div>

          {/* Create Backup */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Create Backup</h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="encryptBackup"
                  checked={encryptBackup}
                  onChange={(e) => setEncryptBackup(e.target.checked)}
                  className="w-4 h-4 text-purple-500"
                />
                <label htmlFor="encryptBackup" className="text-sm text-gray-300">
                  Encrypt backup with password (recommended)
                </label>
              </div>

              {encryptBackup && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Backup Password
                  </label>
                  <input
                    data-testid="backup-password-input"
                    type="password"
                    defaultValue={backupPassword}
                    onChange={(e) => setBackupPassword(e.target.value)}
                    onInput={(e) => setBackupPassword((e.target as HTMLInputElement).value)}
                    placeholder="Enter strong password"
                    ref={backupPasswordRef}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-yellow-500">
                    ⚠️ Store this password securely! You'll need it to restore the backup.
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                <h3 className="font-medium text-blue-400 mb-2">What's included:</h3>
                <ul className="text-sm text-blue-300 space-y-1">
                  <li>✓ All wallet addresses and balances</li>
                  <li>✓ Address book contacts</li>
                  <li>✓ Transaction labels and notes</li>
                  <li>✓ Application settings</li>
                  <li>✓ Security preferences</li>
                </ul>
                <p className="mt-3 text-xs text-blue-400">
                  Note: Private keys are included. Keep backups secure!
                </p>
              </div>

              <button
                data-testid="create-backup-button"
                onClick={handleCreateBackup}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Creating Backup...' : 'Create Full Backup'}
              </button>
            </div>
          </div>

          {/* Restore Backup */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Restore Backup</h2>
            
            <div className="space-y-4">
              <div className="p-4 bg-orange-500/10 border border-orange-500/50 rounded-lg">
                <p className="text-sm text-orange-300">
                  <strong className="text-orange-400">⚠️ Warning:</strong> Restoring a backup will overwrite your current data. Make sure you have a recent backup before proceeding.
                </p>
              </div>

              <div>
                <label className="block w-full">
                  <input
                    data-testid="restore-file-input"
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="w-full py-3 px-4 bg-[#0F0F23] border-2 border-dashed border-purple-500/30 rounded-lg text-center cursor-pointer hover:border-purple-500/50 transition">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-gray-300">Click to select backup file</p>
                    <p className="text-sm text-gray-500 mt-1">JSON format only</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Export Data</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                data-testid="export-wallets-csv-button"
                onClick={() => handleExportCSV('wallets')}
                className="p-4 bg-[#0F0F23] border border-purple-500/30 rounded-lg hover:border-purple-500/50 transition"
              >
                <svg className="mx-auto h-8 w-8 text-purple-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="font-semibold text-white mb-1">Wallets CSV</h3>
                <p className="text-sm text-gray-400">Export wallet list</p>
              </button>

              <button
                data-testid="export-contacts-csv-button"
                onClick={() => handleExportCSV('contacts')}
                className="p-4 bg-[#0F0F23] border border-purple-500/30 rounded-lg hover:border-purple-500/50 transition"
              >
                <svg className="mx-auto h-8 w-8 text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="font-semibold text-white mb-1">Contacts CSV</h3>
                <p className="text-sm text-gray-400">Export address book</p>
              </button>

              <button
                data-testid="export-transactions-csv-button"
                onClick={() => handleExportCSV('transactions')}
                className="p-4 bg-[#0F0F23] border border-purple-500/30 rounded-lg hover:border-purple-500/50 transition"
              >
                <svg className="mx-auto h-8 w-8 text-green-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="font-semibold text-white mb-1">Labels CSV</h3>
                <p className="text-sm text-gray-400">Export transaction labels</p>
              </button>
            </div>
          </div>

          {/* Best Practices */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-green-500/20">
            <h2 className="text-xl font-semibold mb-4 text-green-400">Backup Best Practices</h2>
            
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Create regular backups (weekly recommended)</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Store backups in multiple secure locations</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Always encrypt backups with strong passwords</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Test restore process with a backup copy</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Keep backup password separate from backup file</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <p>Never store backups on cloud services without encryption</p>
              </div>
            </div>
          </div>
        </div>

        {/* Restore Dialog */}
        {showRestoreDialog && restoreFile && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1A1A2E] rounded-lg p-6 max-w-md w-full border border-purple-500/20">
              <h2 className="text-2xl font-bold mb-4">Restore Backup</h2>

              <div className="space-y-4 mb-6">
                <div className="p-3 bg-orange-500/10 border border-orange-500/50 rounded-lg">
                  <p className="text-sm text-orange-300">
                    <strong>File:</strong> {restoreFile.name}
                  </p>
                  <p className="text-sm text-orange-300 mt-1">
                    This will overwrite your current data!
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Backup Password (if encrypted)
                  </label>
                  <input
                    type="password"
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="Enter backup password"
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Leave empty if backup is not encrypted
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRestoreDialog(false);
                    setRestoreFile(null);
                    setRestorePassword('');
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestore}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 transition"
                >
                  {loading ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
