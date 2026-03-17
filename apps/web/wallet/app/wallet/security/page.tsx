'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import securityService, { SecuritySettings } from '@/services/security';

export default function SecurityPage() {
  const [settings, setSettings] = useState<SecuritySettings>(securityService.getSettings());
  const [hasPassword, setHasPassword] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showRemovePassword, setShowRemovePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setHasPassword(securityService.hasPassword());
  }, []);

  const handleUpdateSettings = (key: keyof SecuritySettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    securityService.saveSettings(updated);
    setSuccess('Settings updated successfully');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSetPassword = async () => {
    setError(null);
    setSuccess(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await securityService.setPassword(newPassword);
      setHasPassword(true);
      setSuccess('Password set successfully');
      setShowSetPassword(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await securityService.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      await securityService.removePassword(currentPassword);
      setHasPassword(false);
      setSuccess('Password protection removed');
      setShowRemovePassword(false);
      setCurrentPassword('');
      
      const updated = { ...settings, passwordEnabled: false };
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Security Settings
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
          Manage your wallet security preferences
        </p>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#EF4444',
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '1rem',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#10B981',
        }}>
          ✓ {success}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Password Protection */}
        <Card variant="glass">
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Password Protection
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                  Secure your wallet with a password
                </p>
              </div>
              {hasPassword ? (
                <Badge variant="success">Enabled</Badge>
              ) : (
                <Badge variant="error">Disabled</Badge>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              {!hasPassword ? (
                <Button
                  onClick={() => setShowSetPassword(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                  }}
                >
                  Set Password
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setShowChangePassword(true)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid #3B82F6',
                      color: '#3B82F6',
                    }}
                  >
                    Change Password
                  </Button>
                  <Button
                    onClick={() => setShowRemovePassword(true)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid #EF4444',
                      color: '#EF4444',
                    }}
                  >
                    Remove Password
                  </Button>
                </>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Session Settings */}
        <Card variant="glass">
          <CardBody>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
              Session Settings
            </h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => handleUpdateSettings('sessionTimeout', parseInt(e.target.value) || 0)}
                min="0"
                max="120"
                style={{
                  width: '200px',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                }}
              />
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                Wallet will auto-lock after this period of inactivity. Set to 0 to disable.
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Transaction Confirmation */}
        <Card variant="glass">
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Transaction Confirmation
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                  Require confirmation before sending transactions
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
                <input
                  type="checkbox"
                  checked={settings.requireConfirmation}
                  onChange={(e) => handleUpdateSettings('requireConfirmation', e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: settings.requireConfirmation ? '#8B5CF6' : 'rgba(255,255,255,0.2)',
                  borderRadius: '34px',
                  transition: '0.3s',
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '26px',
                    width: '26px',
                    left: settings.requireConfirmation ? '30px' : '4px',
                    bottom: '4px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: '0.3s',
                  }} />
                </span>
              </label>
            </div>
          </CardBody>
        </Card>

        {/* Biometric Authentication */}
        <Card variant="glass">
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Biometric Authentication
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Use fingerprint or face recognition (if supported)
                </p>
                <Badge variant="info">Coming Soon</Badge>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
                <input
                  type="checkbox"
                  checked={settings.biometricEnabled}
                  onChange={(e) => handleUpdateSettings('biometricEnabled', e.target.checked)}
                  disabled
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'not-allowed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '34px',
                  opacity: 0.5,
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '26px',
                    width: '26px',
                    left: '4px',
                    bottom: '4px',
                    background: 'white',
                    borderRadius: '50%',
                  }} />
                </span>
              </label>
            </div>
          </CardBody>
        </Card>

        {/* Security Tips */}
        <Card variant="glass">
          <CardBody>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
              🔒 Security Tips
            </h3>
            <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ✓ Use a strong password with at least 8 characters, including numbers and symbols
              </div>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ✓ Never share your password or private keys with anyone
              </div>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ✓ Keep your wallet backup in a secure, offline location
              </div>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.8)',
              }}>
                ✓ Enable session timeout to auto-lock your wallet when inactive
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Set Password Dialog */}
      {showSetPassword && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '500px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Set Wallet Password
                </h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter password (min 8 characters)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowSetPassword(false);
                    setNewPassword('');
                    setConfirmPassword('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSetPassword}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Setting...' : 'Set Password'}
                </Button>
              </div>
            </CardBody>
          </Card>          </div>        </div>
      )}

      {/* Change Password Dialog */}
      {showChangePassword && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '500px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Change Password
                </h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </CardBody>
          </Card>          </div>        </div>
      )}

      {/* Remove Password Dialog */}
      {showRemovePassword && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '500px', width: '90%' }}>
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Remove Password Protection
                </h3>

              <div style={{
                padding: '1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: '#EF4444',
              }}>
                ⚠️ Warning: Your wallet will no longer be password protected. Make sure your device is secure.
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Enter Password to Confirm
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowRemovePassword(false);
                    setCurrentPassword('');
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRemovePassword}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Removing...' : 'Remove Password'}
                </Button>
              </div>
            </CardBody>
          </Card>          </div>        </div>
      )}
    </div>
  );
}
