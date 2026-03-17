export interface Order {
  id: string;
  pair: string;
  type: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  side: 'buy' | 'sell';
  price?: number;
  amount: number;
  filled: number;
  status: 'pending' | 'active' | 'filled' | 'cancelled';
  timestamp: number;
}

export interface Trade {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  pnl?: number;
}

export interface Position {
  pair: string;
  side: 'long' | 'short';
  entryPrice: number;
  size: number;
  unrealizedPnL: number;
  leverage: number;
}

class TradingEngine {
  private orders: Map<string, Order> = new Map();
  private trades: Trade[] = [];
  private positions: Map<string, Position> = new Map();
  private priceCache: Map<string, number> = new Map();
  private tickers: Map<string, { price: number; change24h: number; volume24h: number; high24h: number; low24h: number }> = new Map();
  private orderBooks: Map<string, { bids: [number, number][]; asks: [number, number][] }> = new Map();
  private priceHistory: Map<string, { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[]> = new Map();

  constructor() {
    // Market data is populated by real API feeds.
  }

  setTicker(pair: string, data: { price: number; change24h: number; volume24h: number; high24h: number; low24h: number }) {
    this.tickers.set(pair, data);
    this.priceCache.set(pair, data.price);
  }

  setOrderBook(pair: string, data: { bids: [number, number][]; asks: [number, number][] }) {
    this.orderBooks.set(pair, data);
  }

  setPriceHistory(pair: string, data: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[]) {
    this.priceHistory.set(pair, data);
  }

  placeOrder(params: {
    pair: string;
    type: 'market' | 'limit' | 'stop-loss' | 'take-profit';
    side: 'buy' | 'sell';
    price?: number;
    amount: number;
  }): string {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const order: Order = {
      id: orderId,
      pair: params.pair,
      type: params.type,
      side: params.side,
      price: params.price,
      amount: params.amount,
      filled: 0,
      status: params.type === 'market' ? 'filled' : 'active',
      timestamp: Date.now(),
    };

    if (params.type === 'market') {
      // Execute market order immediately
      const marketPrice = this.getCurrentPrice(params.pair);
      if (marketPrice <= 0) {
        throw new Error('Market data unavailable');
      }
      order.filled = order.amount;
      order.price = marketPrice;
      
      // Add to trades
      this.trades.unshift({
        id: `trade_${Date.now()}`,
        pair: params.pair,
        side: params.side,
        price: order.price,
        amount: order.amount,
        timestamp: Date.now(),
      });

      // Update position
      this.updatePosition(params.pair, params.side, order.price, params.amount);
    } else {
      this.orders.set(orderId, order);
    }

    return orderId;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (order && order.status === 'active') {
      order.status = 'cancelled';
      return true;
    }
    return false;
  }

  getActiveOrders(pair?: string): Order[] {
    const orders = Array.from(this.orders.values())
      .filter(o => o.status === 'active');
    
    if (pair) {
      return orders.filter(o => o.pair === pair);
    }
    return orders;
  }

  getTradeHistory(pair?: string): Trade[] {
    if (pair) {
      return this.trades.filter(t => t.pair === pair);
    }
    return this.trades;
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getCurrentPrice(pair: string): number {
    return this.priceCache.get(pair) ?? 0;
  }

  get24HourChange(pair: string): number {
    return this.tickers.get(pair)?.change24h ?? 0;
  }

  get24HourVolume(pair: string): number {
    return this.tickers.get(pair)?.volume24h ?? 0;
  }

  get24HourHigh(pair: string): number {
    return this.tickers.get(pair)?.high24h ?? 0;
  }

  get24HourLow(pair: string): number {
    return this.tickers.get(pair)?.low24h ?? 0;
  }

  private updatePosition(pair: string, side: 'buy' | 'sell', price: number, amount: number) {
    const existing = this.positions.get(pair);
    
    if (existing) {
      if ((existing.side === 'long' && side === 'buy') || (existing.side === 'short' && side === 'sell')) {
        // Add to position
        const totalSize = existing.size + amount;
        const avgPrice = (existing.entryPrice * existing.size + price * amount) / totalSize;
        existing.size = totalSize;
        existing.entryPrice = avgPrice;
      } else {
        // Reduce or close position
        existing.size = Math.max(0, existing.size - amount);
        if (existing.size === 0) {
          this.positions.delete(pair);
        }
      }
      
      if (existing.size > 0) {
        existing.unrealizedPnL = this.calculateUnrealizedPnL(existing);
      }
    } else {
      // Open new position
      this.positions.set(pair, {
        pair,
        side: side === 'buy' ? 'long' : 'short',
        entryPrice: price,
        size: amount,
        unrealizedPnL: 0,
        leverage: 1,
      });
    }
  }

  private calculateUnrealizedPnL(position: Position): number {
    const currentPrice = this.getCurrentPrice(position.pair);
    if (currentPrice <= 0) return 0;
    const priceDiff = position.side === 'long' 
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    return priceDiff * position.size;
  }

  getOrderBook(pair: string): { bids: [number, number][]; asks: [number, number][] } {
    return this.orderBooks.get(pair) || { bids: [], asks: [] };
  }

  getPriceHistory(pair: string, interval: string, limit: number): {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[] {
    const history = this.priceHistory.get(pair) || [];
    if (limit <= 0) return [];
    return history.slice(-limit);
  }
}

const tradingEngine = new TradingEngine();
export default tradingEngine;
