/**
 * Unit Tests for Mobile Sync Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mobileSyncService from '../../../src/services/mobileSync';

describe('Mobile Sync Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generatePairingCode', () => {
    it('should generate 6-digit pairing code', () => {
      const code = mobileSyncService.generatePairingCode();
      
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate unique codes', () => {
      const code1 = mobileSyncService.generatePairingCode();
      const code2 = mobileSyncService.generatePairingCode();
      
      expect(code1).not.toBe(code2);
    });
  });

  describe('pairDevice', () => {
    it('should pair device with code', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('My Phone', 'android', code);
      
      expect(device.name).toBe('My Phone');
      expect(device.deviceType).toBe('android');
      expect(device.pairingCode).toBe(code);
      expect(device.status).toBe('active');
    });

    it('should reject invalid pairing code', () => {
      expect(() => mobileSyncService.pairDevice('Phone', 'ios', 'invalid')).toThrow();
    });
  });

  describe('unpairDevice', () => {
    it('should unpair device', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('Phone', 'android', code);
      
      const result = mobileSyncService.unpairDevice(device.id);
      expect(result).toBe(true);
      
      const devices = mobileSyncService.getPairedDevices();
      expect(devices.find(d => d.id === device.id)).toBeUndefined();
    });
  });

  describe('sendPushNotification', () => {
    it('should send push notification', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('Phone', 'ios', code);
      
      const notif = mobileSyncService.sendPushNotification(
        device.id,
        'Test Title',
        'Test Message',
        'info'
      );
      
      expect(notif.title).toBe('Test Title');
      expect(notif.message).toBe('Test Message');
      expect(notif.type).toBe('info');
      expect(notif.deviceId).toBe(device.id);
    });
  });

  describe('remoteWipe', () => {
    it('should send remote wipe command', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('Phone', 'android', code);
      
      const result = mobileSyncService.remoteWipe(device.id);
      expect(result).toBe(true);
      
      const notifications = mobileSyncService.getNotifications();
      const wipeNotif = notifications.find(n => n.type === 'security' && n.message.includes('wipe'));
      expect(wipeNotif).toBeDefined();
    });
  });

  describe('getNotifications', () => {
    it('should return notification history', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('Phone', 'ios', code);
      
      mobileSyncService.sendPushNotification(device.id, 'Test', 'Message', 'info');
      
      const notifications = mobileSyncService.getNotifications();
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('markNotificationRead', () => {
    it('should mark notification as read', () => {
      const code = mobileSyncService.generatePairingCode();
      const device = mobileSyncService.pairDevice('Phone', 'android', code);
      const notif = mobileSyncService.sendPushNotification(device.id, 'Test', 'Msg', 'info');
      
      mobileSyncService.markNotificationRead(notif.id);
      
      const notifications = mobileSyncService.getNotifications();
      const updated = notifications.find(n => n.id === notif.id);
      expect(updated!.read).toBe(true);
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code data', () => {
      const code = '123456';
      const qr = mobileSyncService.generateQRCode(code);
      
      expect(qr).toContain(code);
      expect(qr).toMatch(/kubercoin/i);
    });
  });
});
