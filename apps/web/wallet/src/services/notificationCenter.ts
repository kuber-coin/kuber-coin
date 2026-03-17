export type NotificationType = 'transaction' | 'price' | 'portfolio' | 'security' | 'staking' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionText?: string;
}

export interface NotificationPreferences {
  desktopNotifications: boolean;
  soundEnabled: boolean;
  emailNotifications: boolean;
  email?: string;
  types: Record<NotificationType, boolean>;
  priceAlerts: Array<{ condition: 'above' | 'below'; price: number }>;
  portfolioAlerts: {
    enabled: boolean;
    changePercent: number;
  };
}

class NotificationCenter {
  private readonly NOTIFICATIONS_KEY = 'kubercoin_notifications';
  private readonly PREFERENCES_KEY = 'notification_preferences';
  private permissionGranted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.permissionGranted = Notification.permission === 'granted';
    }
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
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

  getNotifications(): Notification[] {
    const data = localStorage.getItem(this.NOTIFICATIONS_KEY);
    if (!data) return [];

    const notifications = JSON.parse(data);
    return notifications.map((n: any) => ({
      ...n,
      timestamp: new Date(n.timestamp),
    }));
  }

  private saveNotifications(notifications: Notification[]): void {
    localStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }

  getPreferences(): NotificationPreferences {
    const data = localStorage.getItem(this.PREFERENCES_KEY);
    if (!data) {
      return this.getDefaultPreferences();
    }
    return JSON.parse(data);
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      desktopNotifications: true,
      soundEnabled: true,
      emailNotifications: false,
      types: {
        transaction: true,
        price: true,
        portfolio: true,
        security: true,
        staking: true,
        system: true,
      },
      priceAlerts: [],
      portfolioAlerts: {
        enabled: true,
        changePercent: 10,
      },
    };
  }

  updatePreferences(preferences: NotificationPreferences): void {
    localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(preferences));
  }

  addNotification(
    type: NotificationType,
    title: string,
    message: string,
    actionUrl?: string,
    actionText?: string
  ): Notification {
    const preferences = this.getPreferences();

    // Check if this notification type is enabled
    if (!preferences.types[type]) {
      return null as any; // Don't create notification if type is disabled
    }

    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      actionUrl,
      actionText,
    };

    const notifications = this.getNotifications();
    notifications.unshift(notification); // Add to beginning

    // Keep only last 100 notifications
    if (notifications.length > 100) {
      notifications.splice(100);
    }

    this.saveNotifications(notifications);

    // Show desktop notification if enabled
    if (preferences.desktopNotifications && this.permissionGranted) {
      this.showDesktopNotification(notification);
    }

    // Play sound if enabled
    if (preferences.soundEnabled) {
      this.playNotificationSound();
    }

    return notification;
  }

  private showDesktopNotification(notification: Notification): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    try {
      const desktopNotif = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: notification.id,
      });

      desktopNotif.onclick = () => {
        window.focus();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
        desktopNotif.close();
      };
    } catch (error) {
      console.error('Failed to show desktop notification:', error);
    }
  }

  private playNotificationSound(): void {
    try {
      // Simple beep sound using Web Audio API
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
      }
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  }

  markAsRead(id: string): void {
    const notifications = this.getNotifications();
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      this.saveNotifications(notifications);
    }
  }

  markAsUnread(id: string): void {
    const notifications = this.getNotifications();
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      notif.read = false;
      this.saveNotifications(notifications);
    }
  }

  markAllAsRead(): void {
    const notifications = this.getNotifications();
    notifications.forEach(n => (n.read = true));
    this.saveNotifications(notifications);
  }

  deleteNotification(id: string): void {
    const notifications = this.getNotifications();
    const filtered = notifications.filter(n => n.id !== id);
    this.saveNotifications(filtered);
  }

  clearAll(): void {
    this.saveNotifications([]);
  }

  // Notification creators
  notifyTransaction(type: 'received' | 'sent' | 'confirmed', amount: number, txId: string): void {
    const messages = {
      received: `You received ${amount.toFixed(4)} KC`,
      sent: `You sent ${amount.toFixed(4)} KC`,
      confirmed: `Transaction of ${amount.toFixed(4)} KC confirmed`,
    };

    this.addNotification(
      'transaction',
      'Transaction Update',
      messages[type],
      `/wallet/history?tx=${txId}`,
      'View Transaction'
    );
  }

  notifyPriceAlert(condition: 'above' | 'below', price: number, currentPrice: number): void {
    const message = condition === 'above'
      ? `KC price is now above $${price.toLocaleString()} (currently $${currentPrice.toLocaleString()})`
      : `KC price is now below $${price.toLocaleString()} (currently $${currentPrice.toLocaleString()})`;

    this.addNotification(
      'price',
      'Price Alert',
      message,
      '/wallet/analytics',
      'View Charts'
    );
  }

  notifyPortfolioChange(changePercent: number, newValue: number): void {
    const direction = changePercent > 0 ? 'increased' : 'decreased';
    const message = `Your portfolio ${direction} by ${Math.abs(changePercent).toFixed(2)}% in the last 24h (now $${newValue.toLocaleString()})`;

    this.addNotification(
      'portfolio',
      'Portfolio Alert',
      message,
      '/wallet/portfolio-tools',
      'View Portfolio'
    );
  }

  notifySecurityAlert(event: string, details: string): void {
    this.addNotification(
      'security',
      'Security Alert',
      `${event}: ${details}`,
      '/wallet/settings',
      'Review Security'
    );
  }

  notifyStakingReward(amount: number): void {
    this.addNotification(
      'staking',
      'Staking Reward',
      `You earned ${amount.toFixed(4)} KC from staking`,
      '/wallet',
      'View Balance'
    );
  }

  notifySystem(title: string, message: string): void {
    this.addNotification('system', title, message);
  }

  // Check price alerts
  checkPriceAlerts(currentPrice: number): void {
    const preferences = this.getPreferences();
    const lastChecked = localStorage.getItem('last_price_check');
    const lastPrice = lastChecked ? parseFloat(lastChecked) : currentPrice;

    preferences.priceAlerts.forEach(alert => {
      const triggered =
        (alert.condition === 'above' && lastPrice < alert.price && currentPrice >= alert.price) ||
        (alert.condition === 'below' && lastPrice > alert.price && currentPrice <= alert.price);

      if (triggered) {
        this.notifyPriceAlert(alert.condition, alert.price, currentPrice);
      }
    });

    localStorage.setItem('last_price_check', currentPrice.toString());
  }

  // Check portfolio alerts
  checkPortfolioAlerts(currentValue: number): void {
    const preferences = this.getPreferences();
    if (!preferences.portfolioAlerts.enabled) return;

    const lastValue = localStorage.getItem('last_portfolio_value');
    if (!lastValue) {
      localStorage.setItem('last_portfolio_value', currentValue.toString());
      return;
    }

    const lastVal = parseFloat(lastValue);
    const changePercent = ((currentValue - lastVal) / lastVal) * 100;

    if (Math.abs(changePercent) >= preferences.portfolioAlerts.changePercent) {
      this.notifyPortfolioChange(changePercent, currentValue);
      localStorage.setItem('last_portfolio_value', currentValue.toString());
    }
  }

  getUnreadCount(): number {
    return this.getNotifications().filter(n => !n.read).length;
  }
}

const notificationCenter = new NotificationCenter();

// Auto-check for alerts every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    // These would be called with real data from services
    // notificationCenter.checkPriceAlerts(priceService.getCurrentPrice());
    // notificationCenter.checkPortfolioAlerts(portfolioService.getTotalValue());
  }, 300000);
}

export default notificationCenter;
