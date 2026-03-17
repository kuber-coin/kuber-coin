/**
 * WebSocket Service for Real-Time Updates
 * Handles live blockchain events and updates
 */

type EventType = 'newBlock' | 'newTransaction' | 'mempoolUpdate' | 'peerConnect' | 'peerDisconnect';

interface BlockEvent {
  type: 'newBlock';
  data: {
    hash: string;
    height: number;
    time: number;
    txCount: number;
  };
}

interface TransactionEvent {
  type: 'newTransaction';
  data: {
    txid: string;
    size: number;
    fee: number;
  };
}

interface MempoolUpdateEvent {
  type: 'mempoolUpdate';
  data: {
    size: number;
    bytes: number;
  };
}

interface PeerEvent {
  type: 'peerConnect' | 'peerDisconnect';
  data: {
    id: number;
    addr: string;
  };
}

type WebSocketEvent = BlockEvent | TransactionEvent | MempoolUpdateEvent | PeerEvent;

type EventCallback = (event: WebSocketEvent) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Map<EventType, Set<EventCallback>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isIntentionallyClosed = false;

  constructor(url?: string) {
    this.url = url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8633/ws';
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.subscribe();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketEvent = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.stopHeartbeat();
        
        if (!this.isIntentionallyClosed) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Send heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Subscribe to events from server
   */
  private subscribe(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const subscriptions = Array.from(this.listeners.keys());
    if (subscriptions.length > 0) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        events: subscriptions,
      }));
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: WebSocketEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * Add event listener
   */
  on(eventType: EventType, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(callback);

    // If already connected, subscribe to this event
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        events: [eventType],
      }));
    }

    // Return unsubscribe function
    return () => this.off(eventType, callback);
  }

  /**
   * Remove event listener
   */
  off(eventType: EventType, callback: EventCallback): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
        
        // Unsubscribe from event on server
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'unsubscribe',
            events: [eventType],
          }));
        }
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'closed';
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
const wsService = new WebSocketService();

// Auto-connect in browser
if (typeof window !== 'undefined') {
  wsService.connect();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    wsService.disconnect();
  });
}

export default wsService;

// Export hooks for React components
export function useWebSocket(eventType: EventType, callback: EventCallback) {
  if (typeof window === 'undefined') return;

  const unsubscribe = wsService.on(eventType, callback);
  return unsubscribe;
}

// Polling fallback if WebSocket is not available
export class PollingService {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start polling for updates
   */
  startPolling(
    key: string,
    fetchFn: () => Promise<void>,
    interval: number = 5000
  ): void {
    if (this.intervals.has(key)) {
      console.warn(`Already polling for ${key}`);
      return;
    }

    // Initial fetch
    fetchFn().catch(console.error);

    // Set up interval
    const timer = setInterval(() => {
      fetchFn().catch(console.error);
    }, interval);

    this.intervals.set(key, timer);
  }

  /**
   * Stop polling
   */
  stopPolling(key: string): void {
    const timer = this.intervals.get(key);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(key);
    }
  }

  /**
   * Stop all polling
   */
  stopAll(): void {
    this.intervals.forEach((timer) => clearInterval(timer));
    this.intervals.clear();
  }
}

export const pollingService = new PollingService();
