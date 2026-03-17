'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import walletService from '@/services/wallet';
import backupService from '@/services/backup';

interface BackupItem {
  id: string;
  timestamp: number;
  walletCount: number;
  size: number;
  encrypted: boolean;
}

interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  lastBackup: number;
  nextBackup: number;
}

export default function BackupRecoveryPage() {
  const [selectedView, setSelectedView] = useState<'backup' | 'recovery' | 'schedule'>('backup');
  const [backupHistory, setBackupHistory] = useState<BackupItem[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: false,
    frequency: 'weekly',
    lastBackup: 0,
    nextBackup: 0,
  });
  const [encryptBackup, setEncryptBackup] = useState(true);
  const [backupPassword, setBackupPassword] = useState('');
  const [recoveryFile, setRecoveryFile] = useState<string>('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [testMode, setTestMode] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadBackupHistory();
    loadSchedule();
  }, []);

  const loadBackupHistory = () => {
    const stored = localStorage.getItem('kubercoin_backup_history');
    if (stored) {
      setBackupHistory(JSON.parse(stored));
      return;
    }
    setBackupHistory([]);
  };

  const loadSchedule = () => {
    const stored = localStorage.getItem('kubercoin_backup_schedule');
    if (stored) {
      setSchedule(JSON.parse(stored));
    }
  };

  const saveSchedule = (newSchedule: BackupSchedule) => {
    localStorage.setItem('kubercoin_backup_schedule', JSON.stringify(newSchedule));
    setSchedule(newSchedule);
  };

  const handleCreateBackup = async () => {
    if (encryptBackup && !backupPassword) {
      setError('Please enter a password for encrypted backup');
      return;
    }

    try {
      const wallets = walletService.getWallets();
      const data = await backupService.createFullBackup(encryptBackup ? backupPassword : undefined);

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kubercoin_backup_${Date.now()}.${encryptBackup ? 'enc' : 'json'}`;
      a.click();

      setSuccess('Backup created successfully!');
      setBackupPassword('');

      const newBackupItem: BackupItem = {
        id: `backup_${Date.now()}`,
        timestamp: Date.now(),
        walletCount: wallets.length,
        size: data.length,
        encrypted: encryptBackup,
      };
      const updatedHistory = [newBackupItem, ...backupHistory];
      setBackupHistory(updatedHistory);
      localStorage.setItem('kubercoin_backup_history', JSON.stringify(updatedHistory));
      backupService.recordBackup();
    } catch (err: any) {
      setError(err.message || 'Failed to create backup');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setRecoveryFile(text);
  };

  const handleRecover = () => {
    if (!recoveryFile) {
      setError('Please select a backup file');
      return;
    }

    try {
      let data = recoveryFile;

      // Check if encrypted
      if (recoveryFile.startsWith('{')) {
        // Plain JSON
      } else {
        // Encrypted, decode
        if (!recoveryPassword) {
          setError('Please enter the backup password');
          return;
        }
        data = atob(data);
      }

      const backup = JSON.parse(data);

      if (!backup.wallets || !Array.isArray(backup.wallets)) {
        setError('Invalid backup format');
        return;
      }

      if (testMode) {
        setSuccess(`✅ Backup verified! Found ${backup.wallets.length} wallet(s). Disable test mode to restore.`);
      } else {
        if (!confirm(`This will ${backup.wallets.length > 0 ? 'merge' : 'restore'} ${backup.wallets.length} wallet(s). Continue?`)) {
          return;
        }

        let restored = 0;
        backup.wallets.forEach((w: any) => {
          try {
            if (w.privateKey) {
              walletService.importWallet(w.privateKey, w.label || 'Restored Wallet');
              restored++;
            }
          } catch (err) {
            console.error('Failed to restore wallet:', err);
          }
        });

        setSuccess(`Restored ${restored} wallet(s) successfully!`);
        setRecoveryFile('');
        setRecoveryPassword('');
      }
    } catch (err: any) {
      setError('Failed to recover backup. Invalid file or password.');
    }
  };

  const handleScheduleToggle = () => {
    const nextBackupTime = Date.now() + getScheduleInterval(schedule.frequency);
    saveSchedule({
      ...schedule,
      enabled: !schedule.enabled,
      nextBackup: !schedule.enabled ? nextBackupTime : 0,
    });
  };

  const getScheduleInterval = (frequency: string): number => {
    switch (frequency) {
      case 'daily': return 86400000;
      case 'weekly': return 604800000;
      case 'monthly': return 2592000000;
      default: return 604800000;
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
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
            <h1 className="text-3xl font-bold text-white">💾 Backup & Recovery</h1>
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
        <div className="grid grid-cols-3 gap-2 mb-6">
          <button
            onClick={() => setSelectedView('backup')}
            className={`px-6 py-3 rounded-lg transition font-semibold ${
              selectedView === 'backup'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                : 'bg-purple-700 hover:bg-purple-600'
            }`}
          >
            💾 Backup
          </button>
          <button
            onClick={() => setSelectedView('recovery')}
            className={`px-6 py-3 rounded-lg transition font-semibold ${
              selectedView === 'recovery'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                : 'bg-purple-700 hover:bg-purple-600'
            }`}
          >
            🔄 Recovery
          </button>
          <button
            onClick={() => setSelectedView('schedule')}
            className={`px-6 py-3 rounded-lg transition font-semibold ${
              selectedView === 'schedule'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                : 'bg-purple-700 hover:bg-purple-600'
            }`}
          >
            ⏰ Schedule
          </button>
        </div>

        {/* Backup View */}
        {selectedView === 'backup' && (
          <div className="space-y-6">
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Create Backup</h2>
              
              <div className="space-y-4 mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={encryptBackup}
                    onChange={(e) => setEncryptBackup(e.target.checked)}
                    className="w-5 h-5 rounded border-purple-600 bg-purple-900/50 text-purple-600 focus:ring-purple-600"
                  />
                  <span className="text-white">Encrypt backup (recommended)</span>
                </label>

                {encryptBackup && (
                  <div>
                    <label className="block text-purple-200 mb-2">Backup Password</label>
                    <input
                      type="password"
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
                      placeholder="Enter strong password"
                    />
                    <div className="text-sm text-purple-300 mt-1">
                      ⚠️ Remember this password - it cannot be recovered!
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleCreateBackup}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
              >
                Create Backup Now
              </button>
            </div>

            {/* Backup History */}
            {backupHistory.length > 0 && (
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Backup History</h2>
                <div className="space-y-3">
                  {backupHistory.map((backup) => (
                    <div key={backup.id} className="bg-purple-900/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-white font-semibold">
                          {new Date(backup.timestamp).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2">
                          {backup.encrypted && (
                            <span className="px-2 py-1 bg-green-500/20 border border-green-500 rounded text-xs text-green-300">
                              🔒 Encrypted
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-purple-400">Wallets</div>
                          <div className="text-white">{backup.walletCount}</div>
                        </div>
                        <div>
                          <div className="text-purple-400">Size</div>
                          <div className="text-white">{formatSize(backup.size)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recovery View */}
        {selectedView === 'recovery' && (
          <div className="space-y-6">
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Recover from Backup</h2>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testMode}
                    onChange={(e) => setTestMode(e.target.checked)}
                    className="w-5 h-5 rounded border-purple-600 bg-purple-900/50 text-purple-600 focus:ring-purple-600"
                  />
                  <span className="text-white">Test mode (verify without restoring)</span>
                </label>

                <div>
                  <label className="block text-purple-200 mb-2">Backup File</label>
                  <input
                    type="file"
                    accept=".json,.enc"
                    onChange={handleFileUpload}
                    className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                  />
                </div>

                {recoveryFile && !recoveryFile.startsWith('{') && (
                  <div>
                    <label className="block text-purple-200 mb-2">Backup Password</label>
                    <input
                      type="password"
                      value={recoveryPassword}
                      onChange={(e) => setRecoveryPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
                      placeholder="Enter backup password"
                    />
                  </div>
                )}

                <div className="p-3 bg-yellow-500/20 border border-yellow-500 rounded text-sm text-yellow-200">
                  <p className="font-semibold mb-1">⚠️ Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Test mode will verify the backup without making changes</li>
                    <li>Recovery will merge wallets with your existing ones</li>
                    <li>Duplicate wallets will be skipped</li>
                  </ul>
                </div>

                <button
                  onClick={handleRecover}
                  disabled={!recoveryFile}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
                >
                  {testMode ? 'Verify Backup' : 'Restore Wallets'}
                </button>
              </div>
            </div>

            {/* Recovery Steps */}
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recovery Steps</h3>
              <div className="space-y-3">
                {['Select your backup file', 'Enter password if encrypted', 'Verify in test mode', 'Disable test mode and restore'].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                    <div className="text-purple-200">{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Schedule View */}
        {selectedView === 'schedule' && (
          <div className="space-y-6">
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Automated Backups</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-purple-900/50 rounded-lg">
                  <div>
                    <div className="text-white font-semibold mb-1">Automatic Backups</div>
                    <div className="text-sm text-purple-300">
                      {schedule.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={handleScheduleToggle}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-purple-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Backup Frequency</label>
                  <select
                    value={schedule.frequency}
                    onChange={(e) => {
                      const nextBackupTime = Date.now() + getScheduleInterval(e.target.value);
                      saveSchedule({
                        ...schedule,
                        frequency: e.target.value as any,
                        nextBackup: schedule.enabled ? nextBackupTime : 0,
                      });
                    }}
                    className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {schedule.enabled && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-purple-900/50 rounded-lg">
                    <div>
                      <div className="text-purple-400 text-sm mb-1">Last Backup</div>
                      <div className="text-white font-semibold">
                        {schedule.lastBackup ? new Date(schedule.lastBackup).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    <div>
                      <div className="text-purple-400 text-sm mb-1">Next Backup</div>
                      <div className="text-white font-semibold">
                        {schedule.nextBackup ? new Date(schedule.nextBackup).toLocaleString() : 'Not scheduled'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-500/20 border border-blue-500 rounded text-sm text-blue-200">
                  <p>💡 Automatic backups will be saved to your downloads folder. Remember to store them securely!</p>
                </div>
              </div>
            </div>

            {/* Backup Best Practices */}
            <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Best Practices</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-purple-300 mb-2">✅ Do</div>
                  <ul className="text-sm text-purple-200 space-y-1">
                    <li>• Keep multiple backup copies</li>
                    <li>• Use strong encryption passwords</li>
                    <li>• Store in different locations</li>
                    <li>• Test recovery regularly</li>
                  </ul>
                </div>
                <div>
                  <div className="text-purple-300 mb-2">❌ Don't</div>
                  <ul className="text-sm text-purple-200 space-y-1">
                    <li>• Share backup files</li>
                    <li>• Store in cloud unencrypted</li>
                    <li>• Forget your password</li>
                    <li>• Skip backups</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
