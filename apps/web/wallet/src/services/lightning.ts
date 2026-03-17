// Lightning Network Service
// Layer 2 payment channel management

export interface LightningChannel {
  id: string;
  nodeId: string;
  nodeName: string;
  capacity: number;
  localBalance: number;
  remoteBalance: number;
  state: 'opening' | 'active' | 'closing' | 'closed';
  createdAt: number;
  closedAt?: number;
  fee: number;
}

export interface LightningInvoice {
  id: string;
  paymentRequest: string;
  amount: number;
  description: string;
  createdAt: number;
  expiresAt: number;
  paid: boolean;
  paidAt?: number;
}

export interface LightningPayment {
  id: string;
  invoice: string;
  amount: number;
  fee: number;
  destination: string;
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: number;
  completedAt?: number;
  failureReason?: string;
}

export interface LightningNode {
  pubkey: string;
  alias: string;
  color: string;
  capacity: number;
  channels: number;
}

class LightningService {
  private channels: Map<string, LightningChannel> = new Map();
  private invoices: Map<string, LightningInvoice> = new Map();
  private payments: Map<string, LightningPayment> = new Map();
  private readonly STORAGE_KEY_CHANNELS = 'kubercoin_lightning_channels';
  private readonly STORAGE_KEY_INVOICES = 'kubercoin_lightning_invoices';
  private readonly STORAGE_KEY_PAYMENTS = 'kubercoin_lightning_payments';
  private readonly enabled = Boolean(process.env.NEXT_PUBLIC_LIGHTNING_API_URL);

  constructor() {
    // Client components can be pre-rendered on the server; avoid localStorage there.
    if (typeof window === 'undefined') return;
    if (!this.enabled) return;

    this.loadChannels();
    this.loadInvoices();
    this.loadPayments();
  }

  private loadChannels() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_CHANNELS);
      if (stored) {
        const channelsArray = JSON.parse(stored);
        channelsArray.forEach((channel: LightningChannel) => {
          this.channels.set(channel.id, channel);
        });
      }
    } catch (error) {
      console.error('Failed to load lightning channels:', error);
    }
  }

  private saveChannels() {
    if (typeof window === 'undefined') return;

    const channelsArray = Array.from(this.channels.values());
    try {
      localStorage.setItem(this.STORAGE_KEY_CHANNELS, JSON.stringify(channelsArray));
    } catch (error) {
      console.error('Failed to save lightning channels:', error);
    }
  }

  private loadInvoices() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_INVOICES);
      if (stored) {
        const invoicesArray = JSON.parse(stored);
        invoicesArray.forEach((invoice: LightningInvoice) => {
          this.invoices.set(invoice.id, invoice);
        });
      }
    } catch (error) {
      console.error('Failed to load lightning invoices:', error);
    }
  }

  private saveInvoices() {
    if (typeof window === 'undefined') return;

    const invoicesArray = Array.from(this.invoices.values());
    try {
      localStorage.setItem(this.STORAGE_KEY_INVOICES, JSON.stringify(invoicesArray));
    } catch (error) {
      console.error('Failed to save lightning invoices:', error);
    }
  }

  private loadPayments() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_PAYMENTS);
      if (stored) {
        const paymentsArray = JSON.parse(stored);
        paymentsArray.forEach((payment: LightningPayment) => {
          this.payments.set(payment.id, payment);
        });
      }
    } catch (error) {
      console.error('Failed to load lightning payments:', error);
    }
  }

  private savePayments() {
    if (typeof window === 'undefined') return;

    const paymentsArray = Array.from(this.payments.values());
    try {
      localStorage.setItem(this.STORAGE_KEY_PAYMENTS, JSON.stringify(paymentsArray));
    } catch (error) {
      console.error('Failed to save lightning payments:', error);
    }
  }

  // Channel Management
  async openChannel(
    nodeId: string,
    nodeName: string,
    capacity: number,
    localAmount: number
  ): Promise<LightningChannel> {
    if (!this.enabled) {
      throw new Error('Lightning API not configured');
    }
    // Simulate channel opening delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const channel: LightningChannel = {
      id: `chan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nodeId,
      nodeName,
      capacity,
      localBalance: localAmount,
      remoteBalance: 0,
      state: 'opening',
      createdAt: Date.now(),
      fee: capacity * 0.001, // 0.1% fee
    };

    this.channels.set(channel.id, channel);
    this.saveChannels();

    // Simulate channel becoming active
    setTimeout(() => {
      channel.state = 'active';
      this.saveChannels();
    }, 5000);

    return channel;
  }

  async closeChannel(channelId: string, force: boolean = false): Promise<boolean> {
    if (!this.enabled) {
      throw new Error('Lightning API not configured');
    }
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    channel.state = 'closing';
    this.saveChannels();

    // Simulate closing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    channel.state = 'closed';
    channel.closedAt = Date.now();
    this.saveChannels();

    return true;
  }

  getChannel(channelId: string): LightningChannel | undefined {
    return this.channels.get(channelId);
  }

  getAllChannels(): LightningChannel[] {
    if (!this.enabled) return [];
    return Array.from(this.channels.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getActiveChannels(): LightningChannel[] {
    return this.getAllChannels().filter((c) => c.state === 'active');
  }

  getTotalLightningBalance(): number {
    return this.getActiveChannels().reduce((sum, c) => sum + c.localBalance, 0);
  }

  getTotalChannelCapacity(): number {
    return this.getActiveChannels().reduce((sum, c) => sum + c.capacity, 0);
  }

  // Invoice Management
  createInvoice(amount: number, description: string, expiryMinutes: number = 60): LightningInvoice {
    if (!this.enabled) {
      throw new Error('Lightning API not configured');
    }
    const invoice: LightningInvoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      paymentRequest: this.generatePaymentRequest(amount, description),
      amount,
      description,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiryMinutes * 60 * 1000,
      paid: false,
    };

    this.invoices.set(invoice.id, invoice);
    this.saveInvoices();
    return invoice;
  }

  private generatePaymentRequest(amount: number, description: string): string {
    // Generate a Lightning payment request (BOLT-11 format)
    // In production, this would be generated by LN node
    const prefix = 'lnkc'; // Lightning KC
    const amountMsat = Math.round(amount * 100000000 * 1000);
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}${amountMsat}${random}`;
  }

  getInvoice(invoiceId: string): LightningInvoice | undefined {
    return this.invoices.get(invoiceId);
  }

  getAllInvoices(): LightningInvoice[] {
    if (!this.enabled) return [];
    return Array.from(this.invoices.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getPendingInvoices(): LightningInvoice[] {
    const now = Date.now();
    return this.getAllInvoices().filter((i) => !i.paid && i.expiresAt > now);
  }

  async markInvoicePaid(invoiceId: string): Promise<boolean> {
    if (!this.enabled) {
      throw new Error('Lightning API not configured');
    }
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return false;

    invoice.paid = true;
    invoice.paidAt = Date.now();
    this.saveInvoices();
    return true;
  }

  // Payment Management
  async payInvoice(paymentRequest: string): Promise<LightningPayment> {
    if (!this.enabled) {
      throw new Error('Lightning API not configured');
    }
    // Parse payment request
    const amount = this.parsePaymentRequest(paymentRequest);

    const payment: LightningPayment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      invoice: paymentRequest,
      amount,
      fee: amount * 0.001, // 0.1% routing fee
      destination: 'Unknown', // Would be parsed from invoice
      status: 'pending',
      createdAt: Date.now(),
    };

    this.payments.set(payment.id, payment);
    this.savePayments();

    // Simulate payment processing
    setTimeout(() => {
      // 90% success rate
      if (Math.random() > 0.1) {
        payment.status = 'succeeded';
        payment.completedAt = Date.now();
      } else {
        payment.status = 'failed';
        payment.failureReason = 'No route found';
        payment.completedAt = Date.now();
      }
      this.savePayments();
    }, 2000);

    return payment;
  }

  private parsePaymentRequest(request: string): number {
    // Parse BOLT-11 invoice
    // In production, use proper BOLT-11 decoder
    const amountMatch = request.match(/\d+/);
    if (amountMatch) {
      const msat = parseInt(amountMatch[0]);
      return msat / 100000000 / 1000;
    }
    return 0;
  }

  getPayment(paymentId: string): LightningPayment | undefined {
    return this.payments.get(paymentId);
  }

  getAllPayments(): LightningPayment[] {
    if (!this.enabled) return [];
    return Array.from(this.payments.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getSuccessfulPayments(): LightningPayment[] {
    return this.getAllPayments().filter((p) => p.status === 'succeeded');
  }

  // Network Graph
  async searchNodes(query: string): Promise<LightningNode[]> {
    return [];
  }

  // Statistics
  getStatistics() {
    const activeChannels = this.getActiveChannels();
    const totalCapacity = this.getTotalChannelCapacity();
    const totalBalance = this.getTotalLightningBalance();
    const successfulPayments = this.getSuccessfulPayments();
    const totalPaymentVolume = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalFeesPaid = successfulPayments.reduce((sum, p) => sum + p.fee, 0);

    return {
      channelCount: activeChannels.length,
      totalCapacity,
      totalBalance,
      utilizationPercent: totalCapacity > 0 ? (totalBalance / totalCapacity) * 100 : 0,
      paymentCount: successfulPayments.length,
      totalPaymentVolume,
      totalFeesPaid,
      averageFee: successfulPayments.length > 0 ? totalFeesPaid / successfulPayments.length : 0,
    };
  }

  clearAllData(): void {
    this.channels.clear();
    this.invoices.clear();
    this.payments.clear();
    localStorage.removeItem(this.STORAGE_KEY_CHANNELS);
    localStorage.removeItem(this.STORAGE_KEY_INVOICES);
    localStorage.removeItem(this.STORAGE_KEY_PAYMENTS);
  }
}

const lightningService = new LightningService();
export default lightningService;
