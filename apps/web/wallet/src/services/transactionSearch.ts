import walletService from './wallet';

export type TransactionCategory = 'income' | 'expense' | 'transfer' | 'trading' | 'other';

export interface SearchFilters {
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  feeMin?: number;
  feeMax?: number;
  confirmationsMin?: number;
  type?: string;
  categories: TransactionCategory[];
  tags: string[];
  contactAddress?: string;
}

export interface SearchPreset {
  id: string;
  name: string;
  description?: string;
  filters: SearchFilters;
  createdAt: Date;
}

export interface TransactionMetadata {
  txId: string;
  note?: string;
  tags: string[];
  category?: TransactionCategory;
  attachments?: string[];
}

class TransactionSearch {
  private readonly METADATA_KEY = 'transaction_metadata';
  private readonly PRESETS_KEY = 'search_presets';

  async getAllTransactions(): Promise<any[]> {
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) return [];
      const txs = await walletService.getTransactionHistory(wallet.address);
      return txs.map((tx: any) => ({
        ...tx,
        ...this.getMetadata(tx.txid),
      }));
    } catch {
      return [];
    }
  }

  getMetadata(txId: string): TransactionMetadata {
    const allMetadata = this.getAllMetadata();
    return allMetadata[txId] || { txId, tags: [] };
  }

  getAllMetadata(): Record<string, TransactionMetadata> {
    const data = localStorage.getItem(this.METADATA_KEY);
    return data ? JSON.parse(data) : {};
  }

  private saveMetadata(metadata: Record<string, TransactionMetadata>): void {
    localStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));
  }

  // Full-text search
  async search(query: string, useRegex: boolean = false): Promise<any[]> {
    const transactions = await this.getAllTransactions();
    
    if (!query) return transactions;

    const lowerQuery = query.toLowerCase();

    return transactions.filter(tx => {
      if (useRegex) {
        try {
          const regex = new RegExp(query, 'i');
          return (
            regex.test(tx.txid) ||
            regex.test(tx.note || '') ||
            (tx.tags || []).some((tag: string) => regex.test(tag)) ||
            tx.outputs?.some((out: any) => regex.test(out.address)) ||
            tx.inputs?.some((inp: any) => regex.test(inp.address))
          );
        } catch {
          return false;
        }
      } else {
        return (
          tx.txid.toLowerCase().includes(lowerQuery) ||
          (tx.note || '').toLowerCase().includes(lowerQuery) ||
          (tx.tags || []).some((tag: string) => tag.toLowerCase().includes(lowerQuery)) ||
          tx.outputs?.some((out: any) => out.address.toLowerCase().includes(lowerQuery)) ||
          tx.inputs?.some((inp: any) => inp.address.toLowerCase().includes(lowerQuery))
        );
      }
    });
  }

  // Apply filters
  filter(transactions: any[], filters: SearchFilters): any[] {
    let results = [...transactions];

    // Date range filter
    if (filters.dateFrom) {
      results = results.filter(tx => new Date(tx.timestamp) >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      results = results.filter(tx => new Date(tx.timestamp) <= endDate);
    }

    // Amount range filter
    if (filters.amountMin !== undefined) {
      results = results.filter(tx => (tx.amount || 0) >= filters.amountMin!);
    }
    if (filters.amountMax !== undefined) {
      results = results.filter(tx => (tx.amount || 0) <= filters.amountMax!);
    }

    // Fee range filter
    if (filters.feeMin !== undefined) {
      results = results.filter(tx => (tx.fee || 0) >= filters.feeMin!);
    }
    if (filters.feeMax !== undefined) {
      results = results.filter(tx => (tx.fee || 0) <= filters.feeMax!);
    }

    // Confirmations filter
    if (filters.confirmationsMin !== undefined) {
      results = results.filter(tx => (tx.confirmations || 0) >= filters.confirmationsMin!);
    }

    // Category filter
    if (filters.categories.length > 0) {
      results = results.filter(tx => filters.categories.includes(tx.category));
    }

    // Tag filter
    if (filters.tags.length > 0) {
      results = results.filter(tx =>
        filters.tags.some(tag => (tx.tags || []).includes(tag))
      );
    }

    // Contact address filter
    if (filters.contactAddress) {
      results = results.filter(tx =>
        tx.outputs?.some((out: any) => out.address === filters.contactAddress) ||
        tx.inputs?.some((inp: any) => inp.address === filters.contactAddress)
      );
    }

    return results;
  }

  // Preset management
  getPresets(): SearchPreset[] {
    const data = localStorage.getItem(this.PRESETS_KEY);
    if (!data) return [];
    
    return JSON.parse(data).map((preset: any) => ({
      ...preset,
      createdAt: new Date(preset.createdAt),
      filters: {
        ...preset.filters,
        dateFrom: preset.filters.dateFrom ? new Date(preset.filters.dateFrom) : undefined,
        dateTo: preset.filters.dateTo ? new Date(preset.filters.dateTo) : undefined,
      },
    }));
  }

  savePreset(name: string, description: string | undefined, filters: SearchFilters): SearchPreset {
    if (!name || name.trim() === '') {
      throw new Error('Preset name is required');
    }

    const presets = this.getPresets();
    
    if (presets.some(p => p.name === name)) {
      throw new Error('Preset with this name already exists');
    }

    const preset: SearchPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      filters,
      createdAt: new Date(),
    };

    presets.push(preset);
    localStorage.setItem(this.PRESETS_KEY, JSON.stringify(presets));

    return preset;
  }

  deletePreset(id: string): boolean {
    const presets = this.getPresets();
    const filtered = presets.filter(p => p.id !== id);
    
    if (filtered.length === presets.length) {
      return false;
    }

    localStorage.setItem(this.PRESETS_KEY, JSON.stringify(filtered));
    return true;
  }

  // Tagging
  addTag(txId: string, tag: string): void {
    if (!tag || tag.trim() === '') {
      throw new Error('Tag cannot be empty');
    }

    const metadata = this.getAllMetadata();
    
    if (!metadata[txId]) {
      metadata[txId] = { txId, tags: [] };
    }

    if (!metadata[txId].tags.includes(tag)) {
      metadata[txId].tags.push(tag);
      this.saveMetadata(metadata);
    }
  }

  removeTag(txId: string, tag: string): void {
    const metadata = this.getAllMetadata();
    
    if (metadata[txId]) {
      metadata[txId].tags = metadata[txId].tags.filter(t => t !== tag);
      this.saveMetadata(metadata);
    }
  }

  setTags(txId: string, tags: string[]): void {
    const metadata = this.getAllMetadata();
    
    if (!metadata[txId]) {
      metadata[txId] = { txId, tags: [] };
    }

    metadata[txId].tags = tags;
    this.saveMetadata(metadata);
  }

  // Categorization
  setCategory(txId: string, category: TransactionCategory): void {
    const metadata = this.getAllMetadata();
    
    if (!metadata[txId]) {
      metadata[txId] = { txId, tags: [] };
    }

    metadata[txId].category = category;
    this.saveMetadata(metadata);
  }

  // Notes
  setNote(txId: string, note: string): void {
    const metadata = this.getAllMetadata();
    
    if (!metadata[txId]) {
      metadata[txId] = { txId, tags: [] };
    }

    metadata[txId].note = note;
    this.saveMetadata(metadata);
  }

  // Attachments
  addAttachment(txId: string, attachmentUrl: string): void {
    const metadata = this.getAllMetadata();
    
    if (!metadata[txId]) {
      metadata[txId] = { txId, tags: [], attachments: [] };
    }

    if (!metadata[txId].attachments) {
      metadata[txId].attachments = [];
    }

    metadata[txId].attachments!.push(attachmentUrl);
    this.saveMetadata(metadata);
  }

  removeAttachment(txId: string, attachmentUrl: string): void {
    const metadata = this.getAllMetadata();
    
    if (metadata[txId] && metadata[txId].attachments) {
      metadata[txId].attachments = metadata[txId].attachments!.filter(a => a !== attachmentUrl);
      this.saveMetadata(metadata);
    }
  }

  // Statistics
  async getCategoryStats(): Promise<Record<TransactionCategory, { count: number; total: number }>> {
    const transactions = await this.getAllTransactions();
    const stats: Record<TransactionCategory, { count: number; total: number }> = {
      income: { count: 0, total: 0 },
      expense: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
      trading: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    };

    transactions.forEach(tx => {
      const category: TransactionCategory = tx.category || 'other';
      if (stats[category]) {
        stats[category].count++;
        stats[category].total += tx.amount || 0;
      }
    });

    return stats;
  }

  async getTagStats(): Promise<Record<string, number>> {
    const transactions = await this.getAllTransactions();
    const stats: Record<string, number> = {};

    transactions.forEach((tx: any) => {
      (tx.tags || []).forEach((tag: string) => {
        stats[tag] = (stats[tag] || 0) + 1;
      });
    });

    return stats;
  }

  // Export
  exportToCSV(transactions: any[]): string {
    const headers = [
      'Transaction ID',
      'Date',
      'Amount',
      'Fee',
      'Confirmations',
      'Category',
      'Tags',
      'Note',
    ];

    const rows = transactions.map(tx => [
      tx.id,
      new Date(tx.timestamp).toISOString(),
      tx.amount?.toString() || '0',
      tx.fee?.toString() || '0',
      tx.confirmations?.toString() || '0',
      tx.category || '',
      (tx.tags || []).join(';'),
      tx.note || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  // Bulk operations
  bulkSetCategory(txIds: string[], category: TransactionCategory): void {
    txIds.forEach(txId => this.setCategory(txId, category));
  }

  bulkAddTag(txIds: string[], tag: string): void {
    txIds.forEach(txId => this.addTag(txId, tag));
  }

  bulkRemoveTag(txIds: string[], tag: string): void {
    txIds.forEach(txId => this.removeTag(txId, tag));
  }

  // Advanced search with multiple criteria
  async advancedSearch(criteria: {
    query?: string;
    useRegex?: boolean;
    filters?: Partial<SearchFilters>;
  }): Promise<any[]> {
    let results = await this.getAllTransactions();

    // Apply text search
    if (criteria.query) {
      results = await this.search(criteria.query, criteria.useRegex);
    }

    // Apply filters
    if (criteria.filters) {
      const fullFilters: SearchFilters = {
        categories: [],
        tags: [],
        ...criteria.filters,
      };
      results = this.filter(results, fullFilters);
    }

    return results;
  }
}

const transactionSearch = new TransactionSearch();
export default transactionSearch;
