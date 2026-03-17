// Address Filter Service  
// Whitelist/blacklist management

export interface FilteredAddress {
  id: string;
  address: string;
  type: 'whitelist' | 'blacklist';
  label?: string;
  reason?: string;
  addedAt: number;
  reputationScore?: number;
}

class AddressFilterService {
  private filtered: Map<string, FilteredAddress> = new Map();
  private whitelistOnlyMode = false;
  private readonly STORAGE_KEY = 'kubercoin_address_filter';

  constructor() {
    this.loadFiltered();
  }

  private loadFiltered() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      data.addresses.forEach((a: FilteredAddress) => this.filtered.set(a.id, a));
      this.whitelistOnlyMode = data.whitelistOnlyMode || false;
    }
  }

  private saveFiltered() {
    const data = {
      addresses: Array.from(this.filtered.values()),
      whitelistOnlyMode: this.whitelistOnlyMode,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  addToWhitelist(address: string, label?: string): void {
    const entry: FilteredAddress = {
      id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      type: 'whitelist',
      label,
      addedAt: Date.now(),
    };
    this.filtered.set(entry.id, entry);
    this.saveFiltered();
  }

  addToBlacklist(address: string, reason?: string): void {
    const entry: FilteredAddress = {
      id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      type: 'blacklist',
      reason,
      addedAt: Date.now(),
      reputationScore: 0,
    };
    this.filtered.set(entry.id, entry);
    this.saveFiltered();
  }

  removeFromFilter(id: string): void {
    this.filtered.delete(id);
    this.saveFiltered();
  }

  isAddressAllowed(address: string): { allowed: boolean; reason?: string } {
    const blacklisted = Array.from(this.filtered.values()).find(
      (f) => f.type === 'blacklist' && f.address === address
    );

    if (blacklisted) {
      return { allowed: false, reason: blacklisted.reason || 'Address is blacklisted' };
    }

    if (this.whitelistOnlyMode) {
      const whitelisted = Array.from(this.filtered.values()).find(
        (f) => f.type === 'whitelist' && f.address === address
      );
      if (!whitelisted) {
        return { allowed: false, reason: 'Address not in whitelist' };
      }
    }

    return { allowed: true };
  }

  getFilteredAddresses(type?: 'whitelist' | 'blacklist'): FilteredAddress[] {
    let addresses = Array.from(this.filtered.values());
    if (type) {
      addresses = addresses.filter((a) => a.type === type);
    }
    return addresses.sort((a, b) => b.addedAt - a.addedAt);
  }

  setWhitelistOnlyMode(enabled: boolean): void {
    this.whitelistOnlyMode = enabled;
    this.saveFiltered();
  }

  isWhitelistOnlyMode(): boolean {
    return this.whitelistOnlyMode;
  }
}

const addressFilterService = new AddressFilterService();
export default addressFilterService;
