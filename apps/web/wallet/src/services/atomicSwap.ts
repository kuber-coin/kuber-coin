// Atomic Swap Service
// P2P cross-chain atomic swaps using wallet API

import walletApi from './walletApi';

const allowFallback = process.env.NEXT_PUBLIC_WALLET_API_FALLBACKS !== 'false';

export interface SwapOffer {
  id: string;
  offeredCurrency: string;
  offeredAmount: number;
  requestedCurrency: string;
  requestedAmount: number;
  exchangeRate: number;
  creatorAddress: string;
  status: 'open' | 'pending' | 'completed' | 'expired' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  htlcHash?: string;
  htlcSecret?: string;
  acceptedBy?: string;
  completedAt?: number;
}

class AtomicSwapService {
  private offers: SwapOffer[] = [];
  private exchangeRates: Record<string, number> = {};

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async refreshOffers(status?: SwapOffer['status']): Promise<SwapOffer[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    try {
      const response = await walletApi.get<{ offers: SwapOffer[] }>(`/api/swaps/offers${query}`);
      this.offers = response.offers || [];
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached offers when offline.
    }
    return this.getSwapOffers();
  }

  async refreshRates(fromCurrency: string, toCurrency: string): Promise<number> {
    const key = `${fromCurrency}_${toCurrency}`;
    try {
      const response = await walletApi.get<{ rate: number }>(
        `/api/swaps/rate?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}`
      );
      this.exchangeRates[key] = response.rate || 0;
    } catch (error) {
      if (!allowFallback) throw error;
      if (this.exchangeRates[key] === undefined) {
        this.exchangeRates[key] = 0.0001;
      }
    }
    return this.exchangeRates[key];
  }

  async createSwapOffer(
    offeredCurrency: string,
    offeredAmount: number,
    requestedCurrency: string,
    requestedAmount: number,
    creatorAddress: string
  ): Promise<SwapOffer> {
    try {
      const response = await walletApi.post<{ offer: SwapOffer }>('/api/swaps/offers', {
        offeredCurrency,
        offeredAmount,
        requestedCurrency,
        requestedAmount,
        creatorAddress,
      });
      const offer = response.offer;
      this.offers = [offer, ...this.offers.filter((o) => o.id !== offer.id)];
      return offer;
    } catch (error) {
      if (!allowFallback) throw error;
      const offer: SwapOffer = {
        id: this.createId('swap'),
        offeredCurrency,
        offeredAmount,
        requestedCurrency,
        requestedAmount,
        exchangeRate: requestedAmount / offeredAmount,
        creatorAddress,
        status: 'open',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      this.offers = [offer, ...this.offers.filter((o) => o.id !== offer.id)];
      return offer;
    }
  }

  getSwapOffers(filter?: { status?: SwapOffer['status']; currency?: string }): SwapOffer[] {
    let offers = [...this.offers];

    if (filter?.status) {
      offers = offers.filter((o) => o.status === filter.status);
    }
    if (filter?.currency) {
      offers = offers.filter(
        (o) => o.offeredCurrency === filter.currency || o.requestedCurrency === filter.currency
      );
    }

    return offers.sort((a, b) => b.createdAt - a.createdAt);
  }

  async acceptSwapOffer(offerId: string, acceptorAddress: string): Promise<void> {
    try {
      await walletApi.post('/api/swaps/offers/accept', {
        id: offerId,
        acceptorAddress,
      });
      await this.refreshOffers();
    } catch (error) {
      if (!allowFallback) throw error;
      const target = this.offers.find((offer) => offer.id === offerId);
      if (target) {
        target.status = 'pending';
        target.acceptedBy = acceptorAddress;
      }
    }
  }

  async completeSwap(offerId: string): Promise<void> {
    try {
      await walletApi.post('/api/swaps/offers/accept', {
        id: offerId,
        acceptorAddress: 'self',
      });
      await this.refreshOffers();
    } catch (error) {
      if (!allowFallback) throw error;
      const target = this.offers.find((offer) => offer.id === offerId);
      if (target) {
        target.status = 'completed';
        target.completedAt = Date.now();
      }
    }
  }

  async cancelSwapOffer(offerId: string): Promise<void> {
    try {
      await walletApi.post('/api/swaps/offers/cancel', { id: offerId });
      await this.refreshOffers();
    } catch (error) {
      if (!allowFallback) throw error;
      const target = this.offers.find((offer) => offer.id === offerId);
      if (target) {
        target.status = 'cancelled';
      }
    }
  }

  getExchangeRate(fromCurrency: string, toCurrency: string): number {
    const key = `${fromCurrency}_${toCurrency}`;
    return this.exchangeRates[key] ?? 0;
  }
}

const atomicSwapService = new AtomicSwapService();
export default atomicSwapService;
