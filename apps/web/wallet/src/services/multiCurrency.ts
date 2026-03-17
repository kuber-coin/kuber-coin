// Multi-Currency Service
// Support multiple cryptocurrencies and tokens

export interface Token {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  contractAddress?: string;
  icon?: string;
  balance: number;
  balanceUSD: number;
  priceUSD: number;
  change24h: number;
  chainId?: number;
}

export interface TokenList {
  name: string;
  tokens: Omit<Token, 'id' | 'balance' | 'balanceUSD'>[];
}

class MultiCurrencyService {
  private tokens: Map<string, Token> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_tokens';

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadTokens();
    this.initializeDefaultTokens();
  }

  private loadTokens() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const tokens = JSON.parse(stored);
        tokens.forEach((t: Token) => this.tokens.set(t.id, t));
      }
    } catch {
      // Ignore storage/parse errors (e.g., SSR, blocked storage, corrupt data)
    }
  }

  private saveTokens() {
    if (!this.isBrowser()) return;
    try {
      const tokens = Array.from(this.tokens.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      // Ignore storage write errors
    }
  }

  private initializeDefaultTokens() {
    if (this.tokens.size === 0) {
      const defaults: Omit<Token, 'id' | 'balance' | 'balanceUSD'>[] = [
        {
          symbol: 'KC',
          name: 'KuberCoin',
          decimals: 8,
          icon: '💎',
          priceUSD: 125.50,
          change24h: 5.2,
        },
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          decimals: 8,
          icon: '₿',
          priceUSD: 45000,
          change24h: -2.1,
        },
        {
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          icon: 'Ξ',
          priceUSD: 2500,
          change24h: 3.5,
        },
      ];

      defaults.forEach((token) => {
        this.addToken(token);
      });
    }
  }

  addToken(token: Omit<Token, 'id' | 'balance' | 'balanceUSD'>): Token {
    const newToken: Token = {
      ...token,
      id: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      balance: 0,
      balanceUSD: 0,
    };

    this.tokens.set(newToken.id, newToken);
    this.saveTokens();
    return newToken;
  }

  getTokens(): Token[] {
    return Array.from(this.tokens.values()).sort((a, b) => b.balanceUSD - a.balanceUSD);
  }

  getToken(id: string): Token | undefined {
    return this.tokens.get(id);
  }

  updateTokenBalance(id: string, balance: number): void {
    const token = this.tokens.get(id);
    if (!token) throw new Error('Token not found');

    token.balance = balance;
    token.balanceUSD = balance * token.priceUSD;
    this.saveTokens();
  }

  removeToken(id: string): void {
    this.tokens.delete(id);
    this.saveTokens();
  }

  getTotalPortfolioValue(): number {
    return Array.from(this.tokens.values()).reduce((sum, t) => sum + t.balanceUSD, 0);
  }

  convertCurrency(amount: number, fromSymbol: string, toSymbol: string): number {
    const fromToken = Array.from(this.tokens.values()).find((t) => t.symbol === fromSymbol);
    const toToken = Array.from(this.tokens.values()).find((t) => t.symbol === toSymbol);

    if (!fromToken || !toToken) throw new Error('Currency not found');

    const amountUSD = amount * fromToken.priceUSD;
    return amountUSD / toToken.priceUSD;
  }

  importTokenList(list: TokenList): number {
    let imported = 0;
    list.tokens.forEach((token) => {
      // Check if token already exists
      const exists = Array.from(this.tokens.values()).some(
        (t) => t.symbol === token.symbol && t.contractAddress === token.contractAddress
      );
      if (!exists) {
        this.addToken(token);
        imported++;
      }
    });
    return imported;
  }
}

const multiCurrencyService = new MultiCurrencyService();
export default multiCurrencyService;
