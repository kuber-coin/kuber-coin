// Audit Log Service
// Comprehensive security audit trail via wallet API

import walletApi from './walletApi';

const allowFallback = process.env.NEXT_PUBLIC_WALLET_API_FALLBACKS !== 'false';

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: 
    | 'login'
    | 'logout'
    | 'transaction_created'
    | 'transaction_signed'
    | 'wallet_created'
    | 'wallet_imported'
    | 'settings_changed'
    | 'backup_created'
    | 'password_changed'
    | 'suspicious_activity';
  severity: 'info' | 'warning' | 'critical';
  userId?: string;
  deviceInfo: {
    userAgent: string;
    ip?: string;
    fingerprint: string;
  };
  details: Record<string, any>;
  location?: string;
}

class AuditLogService {
  private events: AuditEvent[] = [];
  private stats = {
    totalEvents: 0,
    criticalEvents: 0,
    uniqueDevices: 0,
    mostCommonEvent: 'none',
  };

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private recalcStats(): void {
    const eventCounts = new Map<string, number>();
    const deviceSet = new Set<string>();
    let critical = 0;

    this.events.forEach((event) => {
      if (event.severity === 'critical') critical += 1;
      deviceSet.add(event.deviceInfo?.fingerprint || 'unknown');
      eventCounts.set(event.eventType, (eventCounts.get(event.eventType) || 0) + 1);
    });

    let mostCommon = 'none';
    let maxCount = 0;
    for (const [eventType, count] of eventCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = eventType;
      }
    }

    this.stats = {
      totalEvents: this.events.length,
      criticalEvents: critical,
      uniqueDevices: deviceSet.size,
      mostCommonEvent: mostCommon,
    };
  }

  async refreshEvents(filter?: {
    startDate?: number;
    endDate?: number;
    eventType?: AuditEvent['eventType'];
    severity?: AuditEvent['severity'];
  }): Promise<AuditEvent[]> {
    const params = new URLSearchParams();
    if (filter?.startDate) params.set('startDate', String(filter.startDate));
    if (filter?.endDate) params.set('endDate', String(filter.endDate));
    if (filter?.eventType) params.set('eventType', filter.eventType);
    if (filter?.severity) params.set('severity', filter.severity);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    try {
      const response = await walletApi.get<{ events: AuditEvent[] }>(`/api/audit/events${suffix}`);
      this.events = response.events || [];
      this.recalcStats();
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached events when offline.
      this.recalcStats();
    }
    return this.getEvents(filter);
  }

  async refreshStats(): Promise<typeof this.stats> {
    try {
      const response = await walletApi.get<typeof this.stats>('/api/audit/stats');
      this.stats = response || this.stats;
    } catch (error) {
      if (!allowFallback) throw error;
      this.recalcStats();
    }
    return this.getStatistics();
  }

  async logEvent(
    eventType: AuditEvent['eventType'],
    severity: AuditEvent['severity'],
    details: Record<string, any>
  ): Promise<AuditEvent> {
    // Audit events are recorded locally for privacy and offline capability.
    const event: AuditEvent = {
      id: this.createId('audit'),
      timestamp: Date.now(),
      eventType,
      severity,
      deviceInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        fingerprint: this.createId('fp'),
      },
      details,
    };
    this.events = [event, ...this.events.filter((e) => e.id !== event.id)];
    this.recalcStats();
    return event;
  }

  getEvents(filter?: {
    startDate?: number;
    endDate?: number;
    eventType?: AuditEvent['eventType'];
    severity?: AuditEvent['severity'];
  }): AuditEvent[] {
    let events = [...this.events];

    if (filter?.startDate) {
      events = events.filter((e) => e.timestamp >= filter.startDate!);
    }
    if (filter?.endDate) {
      events = events.filter((e) => e.timestamp <= filter.endDate!);
    }
    if (filter?.eventType) {
      events = events.filter((e) => e.eventType === filter.eventType);
    }
    if (filter?.severity) {
      events = events.filter((e) => e.severity === filter.severity);
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  async exportAuditLog(format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const response = await walletApi.get<{ data: any }>(`/api/audit/export?format=${format}`);
      if (format === 'csv') {
        return response.data || '';
      }
      return JSON.stringify(response.data || [], null, 2);
    } catch (error) {
      if (!allowFallback) throw error;
      if (format === 'csv') {
        const header = 'Timestamp,Event Type,Severity,User Agent\n';
        const rows = this.events.map((event) => {
          const ts = new Date(event.timestamp).toISOString();
          const userAgent = (event.deviceInfo?.userAgent || '').replace(/\s+/g, ' ');
          return `${ts},${event.eventType},${event.severity},"${userAgent}"`;
        });
        return header + rows.join('\n');
      }
      return JSON.stringify(this.events, null, 2);
    }
  }

  getStatistics(): {
    totalEvents: number;
    criticalEvents: number;
    uniqueDevices: number;
    mostCommonEvent: string;
  } {
    return { ...this.stats };
  }
}

const auditLogService = new AuditLogService();
export default auditLogService;
