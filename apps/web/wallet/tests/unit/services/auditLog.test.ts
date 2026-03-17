/**
 * Unit Tests for Audit Log Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import auditLogService from '../../../src/services/auditLog';

describe('Audit Log Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('logEvent', () => {
    it('should log event with details', () => {
      auditLogService.logEvent('login', 'info', { success: true });
      
      const events = auditLogService.getEvents();
      const event = events[events.length - 1];
      
      expect(event.eventType).toBe('login');
      expect(event.severity).toBe('info');
      expect(event.details.success).toBe(true);
    });

    it('should capture device info', () => {
      auditLogService.logEvent('transaction_created', 'info', {});
      
      const events = auditLogService.getEvents();
      const event = events[events.length - 1];
      
      expect(event.deviceInfo).toBeDefined();
      expect(event.deviceInfo.fingerprint).toBeDefined();
      expect(event.deviceInfo.userAgent).toBeDefined();
    });

    it('should assign timestamp', () => {
      const before = Date.now();
      auditLogService.logEvent('wallet_created', 'info', {});
      const after = Date.now();
      
      const events = auditLogService.getEvents();
      const event = events[events.length - 1];
      
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getEvents', () => {
    it('should return all events', () => {
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('logout', 'info', {});
      
      const events = auditLogService.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by date range', () => {
      const startDate = Date.now();
      auditLogService.logEvent('test1', 'info', {});
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      auditLogService.logEvent('test2', 'info', {});
      const endDate = Date.now();
      
      const filtered = auditLogService.getEvents({ startDate, endDate });
      expect(filtered.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by event type', () => {
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('logout', 'info', {});
      auditLogService.logEvent('login', 'info', {});
      
      const filtered = auditLogService.getEvents({ eventType: 'login' });
      filtered.forEach(event => {
        expect(event.eventType).toBe('login');
      });
    });

    it('should filter by severity', () => {
      auditLogService.logEvent('test1', 'info', {});
      auditLogService.logEvent('test2', 'critical', {});
      auditLogService.logEvent('test3', 'warning', {});
      
      const filtered = auditLogService.getEvents({ severity: 'critical' });
      filtered.forEach(event => {
        expect(event.severity).toBe('critical');
      });
    });
  });

  describe('exportAuditLog', () => {
    it('should export as JSON', () => {
      auditLogService.logEvent('export_test', 'info', { data: 'test' });
      
      const exported = auditLogService.exportAuditLog('json');
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('should export as CSV', () => {
      auditLogService.logEvent('csv_test', 'info', {});
      
      const exported = auditLogService.exportAuditLog('csv');
      
      expect(exported).toContain('Timestamp');
      expect(exported).toContain('Event Type');
      expect(exported).toContain('csv_test');
    });
  });

  describe('clearOldLogs', () => {
    it('should delete logs older than N days', () => {
      // Create old event
      auditLogService.logEvent('old', 'info', {});
      const events = auditLogService.getEvents();
      const oldEvent = events[events.length - 1];
      
      // Manually set old timestamp (100 days ago)
      oldEvent.timestamp = Date.now() - (100 * 24 * 60 * 60 * 1000);
      
      // Create recent event
      auditLogService.logEvent('recent', 'info', {});
      
      const deleted = auditLogService.clearOldLogs(30); // Keep last 30 days
      
      expect(deleted).toBeGreaterThan(0);
      
      const remaining = auditLogService.getEvents();
      expect(remaining.find(e => e.eventType === 'old')).toBeUndefined();
      expect(remaining.find(e => e.eventType === 'recent')).toBeDefined();
    });
  });

  describe('getStatistics', () => {
    it('should return audit statistics', () => {
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('suspicious_activity', 'critical', {});
      
      const stats = auditLogService.getStatistics();
      
      expect(stats.totalEvents).toBeGreaterThanOrEqual(3);
      expect(stats.criticalEvents).toBeGreaterThanOrEqual(1);
      expect(stats.uniqueDevices).toBeGreaterThan(0);
      expect(stats.mostCommonEvent).toBeDefined();
    });

    it('should identify most common event', () => {
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('login', 'info', {});
      auditLogService.logEvent('logout', 'info', {});
      
      const stats = auditLogService.getStatistics();
      expect(stats.mostCommonEvent).toBe('login');
    });
  });
});
