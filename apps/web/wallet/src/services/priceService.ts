// Price Service - Market data and alerts
// Real-time price tracking from multiple exchanges

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
  exchange: string;
}

export interface PriceAlert {
  id: string;
  type: 'above' | 'below';
  threshold: number;
  currency: string;
  enabled: boolean;
  triggered: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

class PriceService {
  private currentPrice: PriceData | null = null;
  private alerts: Map<string, PriceAlert> = new Map();
  private history: PriceHistoryPoint[] = [];
  private readonly PRICE_API_URL = process.env.NEXT_PUBLIC_PRICE_API_URL || '';
  private readonly STORAGE_KEY_ALERTS = 'kubercoin_price_alerts';
  private readonly STORAGE_KEY_HISTORY = 'kubercoin_price_history';
  private readonly MAX_HISTORY = 288; // 24 hours at 5-minute intervals

  constructor() {
    // Client components can be rendered on the server. Avoid localStorage/window/timers there.
    if (typeof window === 'undefined') return;

    this.loadAlerts();
    this.loadHistory();
    this.startPriceMonitoring();
  }

  private loadAlerts() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_ALERTS);
      if (stored) {
        const alertsArray = JSON.parse(stored);
        alertsArray.forEach((alert: PriceAlert) => {
          this.alerts.set(alert.id, alert);
        });
      }
    } catch (error) {
      console.error('Failed to load price alerts:', error);
    }
  }

  private saveAlerts() {
    if (typeof window === 'undefined') return;

    const alertsArray = Array.from(this.alerts.values());
    try {
      localStorage.setItem(this.STORAGE_KEY_ALERTS, JSON.stringify(alertsArray));
    } catch (error) {
      console.error('Failed to save price alerts:', error);
    }
  }

  private loadHistory() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_HISTORY);
      if (stored) {
        this.history = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load price history:', error);
    }
  }

  private saveHistory() {
    if (typeof window === 'undefined') return;

    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY);
    }
    try {
      localStorage.setItem(this.STORAGE_KEY_HISTORY, JSON.stringify(this.history));
    } catch (error) {
      console.error('Failed to save price history:', error);
    }
  }

  private startPriceMonitoring() {
    if (typeof window === 'undefined') return;

    // Update price every 30 seconds
    setInterval(() => {
      this.updatePrice();
    }, 30000);

    // Save to history every 5 minutes
    setInterval(() => {
      if (this.currentPrice) {
        this.history.push({
          timestamp: Date.now(),
          price: this.currentPrice.price,
        });
        this.saveHistory();
      }
    }, 300000);

    // Initial update
    this.updatePrice();
  }

  async updatePrice(): Promise<PriceData> {
    try {
      if (!this.PRICE_API_URL) {
        throw new Error('Price API not configured');
      }

      const response = await fetch(this.PRICE_API_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      const normalized: PriceData = {
        symbol: data.symbol || 'KC/USD',
        price: Number(data.price),
        change24h: Number(data.change24h || 0),
        high24h: Number(data.high24h || data.price || 0),
        low24h: Number(data.low24h || data.price || 0),
        volume24h: Number(data.volume24h || 0),
        timestamp: Number(data.timestamp || Date.now()),
        exchange: data.exchange || 'Unknown',
      };

      if (!Number.isFinite(normalized.price)) {
        throw new Error('Invalid price data from API');
      }

      this.currentPrice = normalized;

      // Check alerts
      this.checkAlerts();

      return this.currentPrice;
    } catch (error) {
      console.error('Failed to update price:', error);
      throw error;
    }
  }

  getCurrentPrice(): PriceData | null {
    return this.currentPrice;
  }

  getPriceHistory(hours: number = 24): PriceHistoryPoint[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.history.filter((point) => point.timestamp >= cutoff);
  }

  // Alerts Management
  createAlert(
    type: 'above' | 'below',
    threshold: number,
    currency: string = 'USD'
  ): PriceAlert {
    const alert: PriceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      threshold,
      currency,
      enabled: true,
      triggered: false,
      createdAt: Date.now(),
    };

    this.alerts.set(alert.id, alert);
    this.saveAlerts();
    return alert;
  }

  getAllAlerts(): PriceAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getActiveAlerts(): PriceAlert[] {
    return this.getAllAlerts().filter((a) => a.enabled && !a.triggered);
  }

  getTriggeredAlerts(): PriceAlert[] {
    return this.getAllAlerts().filter((a) => a.triggered);
  }

  updateAlert(id: string, updates: Partial<PriceAlert>): boolean {
    const alert = this.alerts.get(id);
    if (!alert) return false;

    Object.assign(alert, updates);
    this.saveAlerts();
    return true;
  }

  deleteAlert(id: string): boolean {
    const deleted = this.alerts.delete(id);
    if (deleted) {
      this.saveAlerts();
    }
    return deleted;
  }

  private checkAlerts() {
    if (!this.currentPrice) return;

    const price = this.currentPrice.price;

    this.alerts.forEach((alert) => {
      if (!alert.enabled || alert.triggered) return;

      const shouldTrigger =
        (alert.type === 'above' && price >= alert.threshold) ||
        (alert.type === 'below' && price <= alert.threshold);

      if (shouldTrigger) {
        alert.triggered = true;
        alert.triggeredAt = Date.now();
        this.saveAlerts();

        // Trigger notification
        this.notifyAlert(alert);
      }
    });
  }

  private notifyAlert(alert: PriceAlert) {
    const message = `Price Alert: KC is now ${alert.type} $${alert.threshold}!`;
    
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('KuberCoin Price Alert', {
        body: message,
        icon: '/favicon.ico',
      });
    }

    console.log(message);
  }

  // Multi-currency conversion
  convertToFiat(amount: number, currency: string = 'USD'): number {
    if (!this.currentPrice) return 0;

    if (currency !== 'USD') {
      return 0;
    }

    return amount * this.currentPrice.price;
  }

  // Portfolio value calculation
  calculatePortfolioValue(balance: number, currency: string = 'USD'): {
    value: number;
    change24h: number;
    changePercent: number;
  } {
    if (!this.currentPrice) {
      return { value: 0, change24h: 0, changePercent: 0 };
    }

    const value = this.convertToFiat(balance, currency);
    const changePercent = this.currentPrice.change24h;
    const change24h = (value * changePercent) / 100;

    return {
      value,
      change24h,
      changePercent,
    };
  }

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') return true;

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  clearHistory(): void {
    this.history = [];
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY_HISTORY);
  }

  clearAlerts(): void {
    this.alerts.clear();
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY_ALERTS);
  }
}

const priceService = new PriceService();
export default priceService;
