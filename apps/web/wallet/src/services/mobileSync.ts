// Mobile Sync Service
// Cross-device synchronization with mobile app

export interface PairedDevice {
  id: string;
  name: string;
  deviceType: 'android' | 'ios';
  pairingCode: string;
  pairedAt: number;
  lastSyncAt?: number;
  status: 'active' | 'inactive' | 'pending';
  pushToken?: string;
}

export interface SyncData {
  wallets: any[];
  transactions: any[];
  contacts: any[];
  settings: any;
  lastSyncTimestamp: number;
}

export interface PushNotification {
  id: string;
  deviceId: string;
  title: string;
  message: string;
  type: 'transaction' | 'security' | 'info';
  sentAt: number;
  read: boolean;
}

class MobileSyncService {
  private pairedDevices: Map<string, PairedDevice> = new Map();
  private notifications: Map<string, PushNotification> = new Map();
  private syncData: SyncData | null = null;
  
  private readonly STORAGE_KEY_DEVICES = 'kubercoin_paired_devices';
  private readonly STORAGE_KEY_NOTIFICATIONS = 'kubercoin_push_notifications';
  private readonly STORAGE_KEY_SYNC = 'kubercoin_sync_data';

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadData();
  }

  private loadData() {
    if (!this.isBrowser()) return;
    try {
      const devices = localStorage.getItem(this.STORAGE_KEY_DEVICES);
      if (devices) {
        const deviceList = JSON.parse(devices);
        deviceList.forEach((d: PairedDevice) => this.pairedDevices.set(d.id, d));
      }

      const notifications = localStorage.getItem(this.STORAGE_KEY_NOTIFICATIONS);
      if (notifications) {
        const notifList = JSON.parse(notifications);
        notifList.forEach((n: PushNotification) => this.notifications.set(n.id, n));
      }

      const sync = localStorage.getItem(this.STORAGE_KEY_SYNC);
      if (sync) {
        this.syncData = JSON.parse(sync);
      }
    } catch {
      // Ignore storage/parse errors
    }
  }

  private saveData() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(
        this.STORAGE_KEY_DEVICES,
        JSON.stringify(Array.from(this.pairedDevices.values()))
      );
      localStorage.setItem(
        this.STORAGE_KEY_NOTIFICATIONS,
        JSON.stringify(Array.from(this.notifications.values()))
      );
      if (this.syncData) {
        localStorage.setItem(this.STORAGE_KEY_SYNC, JSON.stringify(this.syncData));
      }
    } catch {
      // Ignore storage write errors
    }
  }

  generatePairingCode(): string {
    // Generate 6-digit pairing code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  generateQRCode(pairingCode: string): string {
    // Return QR code data (in production use QR library)
    return JSON.stringify({
      service: 'kubercoin',
      pairingCode,
      timestamp: Date.now(),
    });
  }

  pairDevice(name: string, deviceType: 'android' | 'ios', pairingCode: string): PairedDevice {
    const device: PairedDevice = {
      id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      deviceType,
      pairingCode,
      pairedAt: Date.now(),
      status: 'active',
    };

    this.pairedDevices.set(device.id, device);
    this.saveData();
    return device;
  }

  getPairedDevices(): PairedDevice[] {
    return Array.from(this.pairedDevices.values()).sort((a, b) => b.pairedAt - a.pairedAt);
  }

  unpairDevice(deviceId: string): void {
    this.pairedDevices.delete(deviceId);
    this.saveData();
  }

  syncWithDevice(deviceId: string, data: Partial<SyncData>): void {
    const device = this.pairedDevices.get(deviceId);
    if (!device) throw new Error('Device not found');

    this.syncData = {
      wallets: data.wallets || [],
      transactions: data.transactions || [],
      contacts: data.contacts || [],
      settings: data.settings || {},
      lastSyncTimestamp: Date.now(),
    };

    device.lastSyncAt = Date.now();
    this.saveData();
  }

  getSyncData(): SyncData | null {
    return this.syncData;
  }

  sendPushNotification(
    deviceId: string,
    title: string,
    message: string,
    type: PushNotification['type']
  ): PushNotification {
    const device = this.pairedDevices.get(deviceId);
    if (!device) throw new Error('Device not found');

    const notification: PushNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId,
      title,
      message,
      type,
      sentAt: Date.now(),
      read: false,
    };

    this.notifications.set(notification.id, notification);
    this.saveData();

    // In production, send via FCM/APNs
    console.log('Push notification sent:', notification);

    return notification;
  }

  getNotifications(deviceId?: string): PushNotification[] {
    let notifs = Array.from(this.notifications.values());
    
    if (deviceId) {
      notifs = notifs.filter((n) => n.deviceId === deviceId);
    }
    
    return notifs.sort((a, b) => b.sentAt - a.sentAt);
  }

  markNotificationRead(notificationId: string): void {
    const notif = this.notifications.get(notificationId);
    if (notif) {
      notif.read = true;
      this.saveData();
    }
  }

  remoteWipe(deviceId: string): void {
    const device = this.pairedDevices.get(deviceId);
    if (!device) throw new Error('Device not found');

    // Send wipe command via push notification
    this.sendPushNotification(
      deviceId,
      'Remote Wipe',
      'Your wallet data will be erased',
      'security'
    );

    device.status = 'inactive';
    this.saveData();
  }

  enableBiometricAuth(deviceId: string): boolean {
    const device = this.pairedDevices.get(deviceId);
    if (!device) return false;

    // In production, trigger biometric setup on mobile
    return true;
  }
}

const mobileSyncService = new MobileSyncService();
export default mobileSyncService;
