/**
 * Notification Service
 * Handles browser notifications, notification history, and alert preferences
 */

export interface Notification {
  id: string;
  type: 'transaction' | 'confirmation' | 'security' | 'system';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: any;
}

export interface NotificationPreferences {
  enabled: boolean;
  browserNotifications: boolean;
  transactionNotifications: boolean;
  confirmationNotifications: boolean;
  securityAlerts: boolean;
  soundEnabled: boolean;
  minTransactionAmount: number; // Only notify for transactions above this amount
  requiredConfirmations: number; // Notify when tx reaches this many confirmations
}

class NotificationService {
  private notifications: Map<string, Notification>;
  private preferences: NotificationPreferences;
  private permissionGranted: boolean = false;
  private listeners: Set<(notifications: Notification[]) => void>;

  constructor() {
    this.notifications = new Map();
    this.preferences = this.getDefaultPreferences();
    this.listeners = new Set();
    this.loadNotifications();
    this.loadPreferences();
    this.checkPermission();
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      enabled: true,
      browserNotifications: true,
      transactionNotifications: true,
      confirmationNotifications: true,
      securityAlerts: true,
      soundEnabled: true,
      minTransactionAmount: 0.01,
      requiredConfirmations: 1,
    };
  }

  private loadNotifications() {
    try {
      const stored = localStorage.getItem('kubercoin_notifications');
      if (stored) {
        const notificationsArray: Notification[] = JSON.parse(stored);
        this.notifications = new Map(
          notificationsArray.map((n) => [n.id, n])
        );
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  private saveNotifications() {
    try {
      const notificationsArray = Array.from(this.notifications.values());
      // Keep only last 100 notifications
      const limited = notificationsArray
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);
      localStorage.setItem('kubercoin_notifications', JSON.stringify(limited));
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to save notifications:', err);
    }
  }

  private loadPreferences() {
    try {
      const stored = localStorage.getItem('kubercoin_notification_preferences');
      if (stored) {
        this.preferences = { ...this.getDefaultPreferences(), ...JSON.parse(stored) };
      }
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    }
  }

  private savePreferences() {
    try {
      localStorage.setItem(
        'kubercoin_notification_preferences',
        JSON.stringify(this.preferences)
      );
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    }
  }

  private async checkPermission() {
    if ('Notification' in window) {
      this.permissionGranted = Notification.permission === 'granted';
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Browser notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      return this.permissionGranted;
    }

    return false;
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyListeners() {
    const notifications = this.getAllNotifications();
    this.listeners.forEach((listener) => listener(notifications));
  }

  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.add(listener);
    // Immediately call with current notifications
    listener(this.getAllNotifications());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  async notify(
    type: Notification['type'],
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    if (!this.preferences.enabled) {
      return;
    }

    // Check if this notification type is enabled
    if (type === 'transaction' && !this.preferences.transactionNotifications) {
      return;
    }
    if (type === 'confirmation' && !this.preferences.confirmationNotifications) {
      return;
    }
    if (type === 'security' && !this.preferences.securityAlerts) {
      return;
    }

    // Create notification object
    const notification: Notification = {
      id: this.generateId(),
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      data,
    };

    // Save to history
    this.notifications.set(notification.id, notification);
    this.saveNotifications();

    // Play sound if enabled
    if (this.preferences.soundEnabled) {
      this.playNotificationSound();
    }

    // Show browser notification
    if (
      this.preferences.browserNotifications &&
      this.permissionGranted &&
      'Notification' in window
    ) {
      try {
        const browserNotif = new Notification(title, {
          body: message,
          icon: '/logo.png', // Add your logo path
          badge: '/badge.png', // Add your badge path
          tag: notification.id,
          requireInteraction: type === 'security',
        });

        browserNotif.onclick = () => {
          window.focus();
          browserNotif.close();
          this.markAsRead(notification.id);
        };
      } catch (err) {
        console.error('Failed to show browser notification:', err);
      }
    }
  }

  private playNotificationSound() {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.1
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.error('Failed to play notification sound:', err);
    }
  }

  notifyTransaction(txid: string, amount: number, type: 'incoming' | 'outgoing') {
    // Check minimum amount threshold
    if (amount < this.preferences.minTransactionAmount) {
      return;
    }

    const title = type === 'incoming' ? '💰 Incoming Transaction' : '📤 Outgoing Transaction';
    const message = `${type === 'incoming' ? 'Received' : 'Sent'} ${amount.toFixed(8)} KBC`;
    
    this.notify('transaction', title, message, { txid, amount, type });
  }

  notifyConfirmation(txid: string, confirmations: number, amount: number) {
    if (confirmations < this.preferences.requiredConfirmations) {
      return;
    }

    const title = '✅ Transaction Confirmed';
    const message = `Transaction of ${amount.toFixed(8)} KBC has ${confirmations} confirmation${confirmations > 1 ? 's' : ''}`;
    
    this.notify('confirmation', title, message, { txid, confirmations, amount });
  }

  notifySecurity(title: string, message: string, data?: any) {
    this.notify('security', `🔒 ${title}`, message, data);
  }

  notifySystem(title: string, message: string, data?: any) {
    this.notify('system', title, message, data);
  }

  getAllNotifications(): Notification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getUnreadNotifications(): Notification[] {
    return this.getAllNotifications().filter((n) => !n.read);
  }

  getUnreadCount(): number {
    return this.getUnreadNotifications().length;
  }

  getNotification(id: string): Notification | undefined {
    return this.notifications.get(id);
  }

  markAsRead(id: string) {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = true;
      this.notifications.set(id, notification);
      this.saveNotifications();
    }
  }

  markAllAsRead() {
    this.notifications.forEach((notification) => {
      notification.read = true;
    });
    this.saveNotifications();
  }

  deleteNotification(id: string) {
    this.notifications.delete(id);
    this.saveNotifications();
  }

  clearAll() {
    this.notifications.clear();
    this.saveNotifications();
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<NotificationPreferences>) {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();
  }

  isPermissionGranted(): boolean {
    return this.permissionGranted;
  }

  getNotificationsByType(type: Notification['type']): Notification[] {
    return this.getAllNotifications().filter((n) => n.type === type);
  }

  getNotificationsByDateRange(startDate: number, endDate: number): Notification[] {
    return this.getAllNotifications().filter(
      (n) => n.timestamp >= startDate && n.timestamp <= endDate
    );
  }
}

// Export singleton instance
const notificationService = new NotificationService();
export default notificationService;
