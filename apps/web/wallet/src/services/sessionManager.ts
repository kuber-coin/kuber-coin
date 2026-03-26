// Session Manager - Security and session controls

export interface Session {
  id: string;
  deviceId: string;
  deviceName: string;
  userAgent: string;
  ipAddress: string;
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
}

export interface SecurityEvent {
  id: string;
  type: 'login' | 'logout' | 'failed_login' | 'password_change' | 'settings_change' | 'suspicious_activity';
  description: string;
  timestamp: number;
  ipAddress?: string;
  deviceId?: string;
}

export interface SecuritySettings {
  autoLockMinutes: number;
  requirePasswordOnSend: boolean;
  require2FA: boolean;
  biometricEnabled: boolean;
  loginNotifications: boolean;
  suspiciousActivityAlerts: boolean;
}

class SessionManager {
  private currentSession: Session | null = null;
  private sessions: Map<string, Session> = new Map();
  private securityEvents: SecurityEvent[] = [];
  private settings: SecuritySettings;
  private lastActivity: number = Date.now();
  private lockTimeout: NodeJS.Timeout | null = null;
  private readonly STORAGE_KEY_SESSIONS = 'kubercoin_sessions';
  private readonly STORAGE_KEY_EVENTS = 'kubercoin_security_events';
  private readonly STORAGE_KEY_SETTINGS = 'kubercoin_security_settings';

  constructor() {
    this.settings = this.loadSettings();
    this.loadSessions();
    this.loadSecurityEvents();
    this.initializeSession();
    this.startActivityMonitoring();
  }

  private loadSettings(): SecuritySettings {
    const stored = localStorage.getItem(this.STORAGE_KEY_SETTINGS);
    if (stored) {
      return JSON.parse(stored);
    }

    return {
      autoLockMinutes: 15,
      requirePasswordOnSend: true,
      require2FA: false,
      biometricEnabled: false,
      loginNotifications: true,
      suspiciousActivityAlerts: true,
    };
  }

  private saveSettings() {
    localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
  }

  private loadSessions() {
    const stored = localStorage.getItem(this.STORAGE_KEY_SESSIONS);
    if (stored) {
      const sessionsArray = JSON.parse(stored);
      sessionsArray.forEach((session: Session) => {
        this.sessions.set(session.id, session);
      });
    }
  }

  private saveSessions() {
    const sessionsArray = Array.from(this.sessions.values());
    localStorage.setItem(this.STORAGE_KEY_SESSIONS, JSON.stringify(sessionsArray));
  }

  private loadSecurityEvents() {
    const stored = localStorage.getItem(this.STORAGE_KEY_EVENTS);
    if (stored) {
      this.securityEvents = JSON.parse(stored);
    }
  }

  private saveSecurityEvents() {
    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }
    localStorage.setItem(this.STORAGE_KEY_EVENTS, JSON.stringify(this.securityEvents));
  }

  private initializeSession() {
    const deviceId = this.getOrCreateDeviceId();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.currentSession = {
      id: sessionId,
      deviceId,
      deviceName: this.getDeviceName(),
      userAgent: navigator.userAgent,
      ipAddress: 'Unknown', // Would be set by backend
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isActive: true,
    };

    this.sessions.set(sessionId, this.currentSession);
    this.saveSessions();

    this.logSecurityEvent('login', 'User logged in');
  }

  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('kubercoin_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('kubercoin_device_id', deviceId);
    }
    return deviceId;
  }

  private getDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Linux')) return 'Linux PC';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Device';
    return 'Unknown Device';
  }

  private startActivityMonitoring() {
    // Update activity on user interaction
    const updateActivity = () => {
      this.lastActivity = Date.now();
      if (this.currentSession) {
        this.currentSession.lastActivity = Date.now();
        this.saveSessions();
      }
      this.resetLockTimer();
    };

    // Monitor various user activities
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Check lock status every minute
    setInterval(() => {
      this.checkAutoLock();
    }, 60000);
  }

  private resetLockTimer() {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }

    const lockMs = this.settings.autoLockMinutes * 60 * 1000;
    this.lockTimeout = setTimeout(() => {
      this.lockSession();
    }, lockMs);
  }

  private checkAutoLock() {
    if (this.settings.autoLockMinutes === 0) return; // Auto-lock disabled

    const inactiveMs = Date.now() - this.lastActivity;
    const lockMs = this.settings.autoLockMinutes * 60 * 1000;

    if (inactiveMs >= lockMs) {
      this.lockSession();
    }
  }

  lockSession() {
    this.logSecurityEvent('logout', 'Session locked due to inactivity');
    if (this.currentSession) {
      this.currentSession.isActive = false;
      this.saveSessions();
    }
    // In production, this would redirect to lock screen
    console.log('Session locked');
  }

  unlockSession() {
    if (this.currentSession) {
      this.currentSession.isActive = true;
      this.lastActivity = Date.now();
      this.saveSessions();
      this.resetLockTimer();
    }
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastActivity - a.lastActivity
    );
  }

  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    this.saveSessions();

    this.logSecurityEvent('logout', `Session ${sessionId} terminated`);
    return true;
  }

  terminateAllOtherSessions(): number {
    let terminated = 0;

    this.sessions.forEach((session) => {
      if (session.id !== this.currentSession?.id && session.isActive) {
        session.isActive = false;
        terminated++;
      }
    });

    this.saveSessions();
    this.logSecurityEvent('logout', `Terminated ${terminated} other sessions`);
    return terminated;
  }

  // Security Events
  logSecurityEvent(
    type: SecurityEvent['type'],
    description: string,
    ipAddress?: string
  ) {
    const event: SecurityEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      timestamp: Date.now(),
      ipAddress,
      deviceId: this.currentSession?.deviceId,
    };

    this.securityEvents.push(event);
    this.saveSecurityEvents();

    // Send notification for important events
    if (this.settings.loginNotifications && type === 'login') {
      this.notifySecurityEvent(event);
    }

    if (this.settings.suspiciousActivityAlerts && type === 'suspicious_activity') {
      this.notifySecurityEvent(event);
    }
  }

  private notifySecurityEvent(event: SecurityEvent) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Security Alert', {
        body: event.description,
        icon: '/favicon.ico',
      });
    }
  }

  getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .slice(-limit)
      .reverse();
  }

  getSecurityEventsByType(type: SecurityEvent['type']): SecurityEvent[] {
    return this.securityEvents.filter((e) => e.type === type);
  }

  // Settings Management
  getSettings(): SecuritySettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<SecuritySettings>) {
    Object.assign(this.settings, updates);
    this.saveSettings();

    if (updates.autoLockMinutes !== undefined) {
      this.resetLockTimer();
    }

    this.logSecurityEvent('settings_change', 'Security settings updated');
  }

  // 2FA Management
  async generate2FASecret(): Promise<{ secret: string; qrCode: string }> {
    // TODO: replace with otplib (or equivalent) for production use.
    // Uses crypto.getRandomValues for entropy instead of Math.random().
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    // Base-32 alphabet used by TOTP authenticator apps
    const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 16; i++) {
      secret += BASE32[bytes[i] & 0x1f];
    }
    const qrCode = `otpauth://totp/KuberCoin?secret=${secret}&issuer=KuberCoin`;
    return { secret, qrCode };
  }

  verify2FAToken(_token: string, _secret: string): boolean {
    // TOTP verification requires a real HMAC-based one-time password library
    // (e.g. otplib). Returning false unconditionally until that integration
    // is in place. Do NOT deploy 2FA without replacing this method.
    return false;
  }

  // Biometric Authentication (WebAuthn)
  async registerBiometric(): Promise<boolean> {
    if (!window.PublicKeyCredential) {
      throw new Error('WebAuthn not supported in this browser');
    }

    try {
      // In production, implement full WebAuthn registration
      this.settings.biometricEnabled = true;
      this.saveSettings();
      this.logSecurityEvent('settings_change', 'Biometric authentication enabled');
      return true;
    } catch (error) {
      console.error('Biometric registration failed:', error);
      return false;
    }
  }

  async authenticateWithBiometric(): Promise<boolean> {
    if (!this.settings.biometricEnabled) return false;

    try {
      // In production, implement full WebAuthn authentication
      this.logSecurityEvent('login', 'Authenticated with biometric');
      return true;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  // Suspicious Activity Detection
  private detectSuspiciousActivity() {
    // Check for multiple failed logins
    const recentFails = this.getSecurityEventsByType('failed_login').filter(
      (e) => e.timestamp > Date.now() - 15 * 60 * 1000 // Last 15 minutes
    );

    if (recentFails.length >= 5) {
      this.logSecurityEvent(
        'suspicious_activity',
        'Multiple failed login attempts detected'
      );
    }

    // Check for sessions from many different devices
    const activeDevices = new Set(
      this.getAllSessions()
        .filter((s) => s.isActive)
        .map((s) => s.deviceId)
    );

    if (activeDevices.size > 5) {
      this.logSecurityEvent(
        'suspicious_activity',
        'Unusual number of active devices detected'
      );
    }
  }

  clearAllData(): void {
    this.sessions.clear();
    this.securityEvents = [];
    localStorage.removeItem(this.STORAGE_KEY_SESSIONS);
    localStorage.removeItem(this.STORAGE_KEY_EVENTS);
  }
}

const sessionManager = new SessionManager();
export default sessionManager;
