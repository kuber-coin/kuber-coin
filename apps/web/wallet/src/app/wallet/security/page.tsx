'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import securityMonitor, { SecurityEvent, SecurityScore as SecurityScoreType } from '@/services/securityMonitor';
import threatDetection from '@/services/threatDetection';
import authentication, { TOTPSetup } from '@/services/authentication';
import { SecurityScore } from '@/components/SecurityScore';

export default function SecurityPage() {
  const [score, setScore] = useState<SecurityScoreType | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [monitoring, setMonitoring] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TOTPSetup | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [showTotpSetup, setShowTotpSetup] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const currentScore = securityMonitor.getSecurityScore();
    setScore(currentScore);
    
    const currentEvents = securityMonitor.getSecurityEvents(false);
    setEvents(currentEvents);
    
    setMonitoring(securityMonitor.isMonitoring());
  };

  const toggleMonitoring = () => {
    if (monitoring) {
      securityMonitor.stopMonitoring();
    } else {
      securityMonitor.startMonitoring();
    }
    setMonitoring(!monitoring);
  };

  const handleResolveEvent = (eventId: string) => {
    if (securityMonitor.resolveEvent(eventId)) {
      loadData();
    }
  };

  const handleSetupTOTP = async () => {
    try {
      const setup = await authentication.setupTOTP();
      setTotpSetup(setup);
      setShowTotpSetup(true);
    } catch (error: any) {
      alert(`Error setting up 2FA: ${error.message}`);
    }
  };

  const handleVerifyTOTP = async () => {
    try {
      const success = await authentication.verifyTOTP(totpCode);
      if (success) {
        alert('2FA enabled successfully!');
        setShowTotpSetup(false);
        setTotpCode('');
        loadData();
      } else {
        alert('Invalid code. Please try again.');
      }
    } catch (error: any) {
      alert(`Error verifying code: ${error.message}`);
    }
  };

  const handleDisableTOTP = async () => {
    if (confirm('Are you sure you want to disable two-factor authentication?')) {
      await authentication.disableTOTP();
      alert('2FA disabled');
      loadData();
    }
  };

  const handleRegisterWebAuthn = async () => {
    const name = prompt('Enter a name for this security key:');
    if (!name) return;

    try {
      await authentication.registerWebAuthn(name);
      alert('Security key registered successfully!');
      loadData();
    } catch (error: any) {
      alert(`Error registering security key: ${error.message}`);
    }
  };

  const handleScanThreats = async () => {
    const result = await securityMonitor.scanForThreats();
    if (result.threatsFound > 0) {
      alert(`Found ${result.threatsFound} potential threats:\n${result.details.join('\n')}`);
    } else {
      alert('No threats detected. Your system is secure!');
    }
  };

  const getSeverityColor = (severity: SecurityEvent['severity']): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Center</h1>
          <p className="text-gray-600 mt-1">Monitor and enhance your wallet security</p>
        </div>
        <Button
          variant={monitoring ? 'secondary' : 'primary'}
          onClick={toggleMonitoring}
        >
          {monitoring ? '⏸️ Pause Monitoring' : '▶️ Start Monitoring'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Security Score</div>
          <div className={`text-3xl font-bold ${score && score.overall >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
            {score?.overall || 0}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Active Threats</div>
          <div className="text-3xl font-bold text-red-600">
            {events.filter(e => !e.resolved && (e.severity === 'high' || e.severity === 'critical')).length}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">2FA Status</div>
          <div className={`text-lg font-bold ${authentication.isTOTPEnabled() ? 'text-green-600' : 'text-gray-400'}`}>
            {authentication.isTOTPEnabled() ? '✓ Enabled' : '✗ Disabled'}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Security Keys</div>
          <div className="text-3xl font-bold text-blue-600">
            {authentication.getWebAuthnCredentials().length}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Security Score */}
        {score && <SecurityScore score={score} />}

        {/* Middle: Authentication */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6">Authentication</h2>

          <div className="space-y-4">
            {/* 2FA */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">🔐</span>
                  <div>
                    <h3 className="font-semibold">Two-Factor Auth</h3>
                    <p className="text-xs text-gray-600">TOTP (Google Authenticator)</p>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${authentication.isTOTPEnabled() ? 'text-green-600' : 'text-gray-400'}`}>
                  {authentication.isTOTPEnabled() ? 'ON' : 'OFF'}
                </div>
              </div>
              
              {authentication.isTOTPEnabled() ? (
                <Button variant="secondary" onClick={handleDisableTOTP} className="w-full">
                  Disable 2FA
                </Button>
              ) : (
                <Button variant="primary" onClick={handleSetupTOTP} className="w-full">
                  Enable 2FA
                </Button>
              )}
            </div>

            {/* WebAuthn */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">🔑</span>
                  <div>
                    <h3 className="font-semibold">Security Keys</h3>
                    <p className="text-xs text-gray-600">Hardware authenticators</p>
                  </div>
                </div>
                <div className="text-sm font-semibold text-blue-600">
                  {authentication.getWebAuthnCredentials().length} keys
                </div>
              </div>
              
              <Button variant="primary" onClick={handleRegisterWebAuthn} className="w-full">
                Add Security Key
              </Button>
            </div>

            {/* Biometric */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-2xl">👤</span>
                <div>
                  <h3 className="font-semibold">Biometric Auth</h3>
                  <p className="text-xs text-gray-600">Fingerprint / Face ID</p>
                </div>
              </div>
              
              <div className={`text-sm ${authentication.isBiometricAvailable() ? 'text-green-600' : 'text-gray-400'}`}>
                {authentication.isBiometricAvailable() ? '✓ Available' : '✗ Not Supported'}
              </div>
            </div>

            {/* Threat Scan */}
            <Button variant="secondary" onClick={handleScanThreats} className="w-full">
              🔍 Scan for Threats
            </Button>
          </div>
        </Card>

        {/* Right: Security Events */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Security Events</h2>

          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">✅</div>
              <p>No active security events</p>
              <p className="text-sm mt-1">Your wallet is secure</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {events.map((event) => (
                <Card key={event.id} className={`p-4 border ${getSeverityColor(event.severity)}`}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{event.title}</h4>
                    <span className="text-xs px-2 py-1 bg-white rounded">
                      {event.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-sm mb-3">{event.description}</p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleResolveEvent(event.id)}
                      className="text-xs px-2 py-1"
                    >
                      Resolve
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* TOTP Setup Modal */}
      {showTotpSetup && totpSetup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Setup 2FA</h2>
                <button onClick={() => setShowTotpSetup(false)} className="text-gray-500 hover:text-gray-700">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                  </p>
                  <div className="bg-white p-4 rounded-lg border border-gray-300 text-center">
                    <div className="w-48 h-48 bg-gray-200 mx-auto mb-2" />
                    <p className="text-xs font-mono break-all">{totpSetup.secret}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter verification code
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-center text-2xl font-mono"
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Save Backup Codes</p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    {totpSetup.backupCodes.map((code, i) => (
                      <div key={i} className="bg-white px-2 py-1 rounded">{code}</div>
                    ))}
                  </div>
                </div>

                <Button
                  variant="primary"
                  onClick={handleVerifyTOTP}
                  className="w-full"
                  disabled={totpCode.length !== 6}
                >
                  Verify and Enable 2FA
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
