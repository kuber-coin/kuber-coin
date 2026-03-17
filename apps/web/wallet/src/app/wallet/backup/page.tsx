'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import backupManager, { Backup } from '@/services/backupManager';
import shamirSecretSharing from '@/services/shamirSecret';
import socialRecovery from '@/services/socialRecovery';
import { BackupWizard } from '@/components/BackupWizard';

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = () => {
    const allBackups = backupManager.getAllBackups();
    setBackups(allBackups);
  };

  const handleCreateBackup = async (backupType: string, options: any) => {
    try {
      const name = `${backupType.charAt(0).toUpperCase() + backupType.slice(1)} Backup ${new Date().toLocaleDateString()}`;
      await backupManager.createBackup(backupType as any, name, options);
      loadBackups();
      setShowWizard(false);
      alert('Backup created successfully!');
    } catch (error: any) {
      alert(`Error creating backup: ${error.message}`);
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifying(true);
    try {
      const verification = await backupManager.verifyBackup(backupId);
      if (verification.success) {
        alert('Backup verified successfully!');
        loadBackups();
      } else {
        alert(`Backup verification failed:\n${verification.errors?.join('\n')}`);
      }
    } catch (error: any) {
      alert(`Error verifying backup: ${error.message}`);
    }
    setVerifying(false);
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
      return;
    }

    try {
      await backupManager.deleteBackup(backupId);
      loadBackups();
      alert('Backup deleted successfully');
    } catch (error: any) {
      alert(`Error deleting backup: ${error.message}`);
    }
  };

  const getBackupIcon = (type: string) => {
    switch (type) {
      case 'shamir': return '🔐';
      case 'social': return '👥';
      case 'cloud': return '☁️';
      case 'local': return '💾';
      default: return '📦';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const daysSinceVerified = (lastVerified?: number) => {
    if (!lastVerified) return Infinity;
    return Math.floor((Date.now() - lastVerified) / (24 * 60 * 60 * 1000));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backup & Recovery</h1>
          <p className="text-gray-600 mt-1">Secure your wallet with multiple backup methods</p>
        </div>
        <Button variant="primary" onClick={() => setShowWizard(true)}>
          ➕ Create New Backup
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total Backups</div>
          <div className="text-3xl font-bold">{backups.length}</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Verified Backups</div>
          <div className="text-3xl font-bold text-green-600">
            {backups.filter(b => b.lastVerified).length}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Cloud Synced</div>
          <div className="text-3xl font-bold text-blue-600">
            {backups.filter(b => b.synced).length}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Encrypted</div>
          <div className="text-3xl font-bold text-purple-600">
            {backups.filter(b => b.encrypted).length}
          </div>
        </Card>
      </div>

      {/* Backups List */}
      <Card>
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Your Backups</h2>

          {backups.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold mb-2">No Backups Yet</h3>
              <p className="text-gray-600 mb-4">Create your first backup to secure your wallet</p>
              <Button variant="primary" onClick={() => setShowWizard(true)}>
                Create Backup
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {backups.map((backup) => {
                const days = daysSinceVerified(backup.lastVerified);
                const needsVerification = days > 30;

                return (
                  <Card key={backup.id} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="text-4xl">{getBackupIcon(backup.type)}</div>

                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold">{backup.name}</h3>
                            {backup.encrypted && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                🔒 Encrypted
                              </span>
                            )}
                            {backup.synced && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                ☁️ Synced
                              </span>
                            )}
                            {needsVerification && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                                ⚠️ Needs Verification
                              </span>
                            )}
                          </div>

                          <div className="text-sm text-gray-600 space-y-1">
                            <div>Created: {formatDate(backup.createdDate)}</div>
                            {backup.lastVerified && (
                              <div>Last Verified: {formatDate(backup.lastVerified)} ({days} days ago)</div>
                            )}
                            {backup.shares && (
                              <div>Shares: {backup.threshold} of {backup.shares} required</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleVerifyBackup(backup.id)}
                          disabled={verifying}
                        >
                          {verifying ? 'Verifying...' : '✓ Verify'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleDeleteBackup(backup.id)}
                          className="bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          🗑️ Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Best Practices */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3">Backup Best Practices</h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li>• Use multiple backup methods for redundancy</li>
          <li>• Verify backups monthly to ensure they're still valid</li>
          <li>• Store backups in different physical locations</li>
          <li>• Never store seed phrases digitally without encryption</li>
          <li>• Test recovery process before relying on backups</li>
          <li>• Update backups after significant wallet changes</li>
        </ul>
      </Card>

      {showWizard && (
        <BackupWizard
          onCompleteAction={handleCreateBackup}
          onCancelAction={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
