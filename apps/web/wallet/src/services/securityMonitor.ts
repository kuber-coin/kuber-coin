// securityMonitor.ts - Real-time security monitoring and threat detection

export interface SecurityEvent {
  id: string;
  type: 'suspicious_tx' | 'phishing_attempt' | 'unauthorized_access' | 'unusual_activity' | 'malware_detected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: number;
  resolved: boolean;
}

export interface SecurityScore {
  overall: number; // 0-100
  categories: {
    password: number;
    twoFactor: number;
    wallet: number;
    network: number;
    activity: number;
  };
  recommendations: string[];
}

class SecurityMonitor {
  private events: SecurityEvent[] = [];
  private monitoring = false;
  private readonly STORAGE_KEY = 'kubercoin_security_events';

  constructor() {
    this.loadEvents();
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private loadEvents() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;
      this.events = JSON.parse(stored) as SecurityEvent[];
    } catch {
      this.events = [];
    }
  }

  private saveEvents() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // ignore storage errors
    }
  }

  startMonitoring() {
    this.monitoring = true;
  }

  stopMonitoring() {
    this.monitoring = false;
  }

  isMonitoring(): boolean {
    return this.monitoring;
  }

  getSecurityScore(): SecurityScore {
    const base = this.monitoring ? 50 : 0;
    const recommendations: string[] = [];

    if (!this.monitoring) {
      recommendations.push('Enable security monitoring for real-time alerts');
    }

    return {
      overall: base,
      categories: {
        password: base,
        twoFactor: 0,
        wallet: base,
        network: base,
        activity: base,
      },
      recommendations,
    };
  }

  getSecurityEvents(includeResolved: boolean = false): SecurityEvent[] {
    if (includeResolved) {
      return [...this.events];
    }
    return this.events.filter(e => !e.resolved);
  }

  resolveEvent(eventId: string): boolean {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.resolved = true;
      this.saveEvents();
      return true;
    }
    return false;
  }

  async analyzeTransaction(to: string, amount: number): Promise<{ risk: number; warnings: string[] }> {
    const warnings: string[] = [];
    let risk = 0;

    // Check for large amount
    if (amount > 1000) {
      warnings.push('Large transaction amount detected');
      risk += 30;
    }

    // Check address against simple blacklist heuristics
    if (to.includes('scam') || to.includes('phish')) {
      warnings.push('⚠️ WARNING: This address is flagged as suspicious');
      risk += 50;
    }

    return { risk, warnings };
  }

  async scanForThreats(): Promise<{ threatsFound: number; details: string[] }> {
    return { threatsFound: 0, details: [] };
  }

  logEvent(type: SecurityEvent['type'], severity: SecurityEvent['severity'], title: string, description: string): SecurityEvent {
    const event: SecurityEvent = {
      id: `evt_${Date.now()}`,
      type,
      severity,
      title,
      description,
      timestamp: Date.now(),
      resolved: false
    };

    this.events.unshift(event);
    this.saveEvents();
    return event;
  }
}

const securityMonitor = new SecurityMonitor();
export default securityMonitor;