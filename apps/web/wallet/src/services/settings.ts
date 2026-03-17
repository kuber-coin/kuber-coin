/**
 * Settings Service
 * Manages user preferences and application settings
 */

export interface GeneralSettings {
  language: string;
  currency: string;
  theme: 'dark' | 'light' | 'auto';
}

export interface DisplaySettings {
  unit: 'KBC' | 'mKBC' | 'sat';
  decimalPlaces: number;
  hideSmallBalances: boolean;
  smallBalanceThreshold: number;
}

export interface NetworkSettings {
  nodeUrl: string;
  network: 'mainnet' | 'testnet' | 'regtest';
  autoConnect: boolean;
  connectionTimeout: number;
}

export interface PrivacySettings {
  addressDerivationGap: number;
  autoConsolidateUtxos: boolean;
  consolidationThreshold: number;
  dustThreshold: number;
  avoidAddressReuse: boolean;
}

export interface BackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupLocation: string;
  cloudSync: boolean;
  encryptBackups: boolean;
}

export interface AppSettings {
  general: GeneralSettings;
  display: DisplaySettings;
  network: NetworkSettings;
  privacy: PrivacySettings;
  backup: BackupSettings;
}

class SettingsService {
  private settings: AppSettings;

  constructor() {
    this.settings = this.getDefaultSettings();
    // Client components may be pre-rendered on the server; avoid touching localStorage there.
    if (typeof window !== 'undefined') {
      this.loadSettings();
    }
  }

  private getDefaultSettings(): AppSettings {
    return {
      general: {
        language: 'en',
        currency: 'USD',
        theme: 'dark',
      },
      display: {
        unit: 'KBC',
        decimalPlaces: 8,
        hideSmallBalances: false,
        smallBalanceThreshold: 0.00001,
      },
      network: {
        nodeUrl: 'http://localhost:8332',
        network: 'mainnet',
        autoConnect: true,
        connectionTimeout: 30000,
      },
      privacy: {
        addressDerivationGap: 20,
        autoConsolidateUtxos: false,
        consolidationThreshold: 10,
        dustThreshold: 0.00001,
        avoidAddressReuse: true,
      },
      backup: {
        autoBackup: false,
        backupFrequency: 'weekly',
        backupLocation: '',
        cloudSync: false,
        encryptBackups: true,
      },
    };
  }

  private loadSettings() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('kubercoin_app_settings');
      if (stored) {
        const loadedSettings = JSON.parse(stored);
        this.settings = { ...this.settings, ...loadedSettings };
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  private saveSettings() {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('kubercoin_app_settings', JSON.stringify(this.settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getGeneralSettings(): GeneralSettings {
    return { ...this.settings.general };
  }

  getDisplaySettings(): DisplaySettings {
    return { ...this.settings.display };
  }

  getNetworkSettings(): NetworkSettings {
    return { ...this.settings.network };
  }

  getPrivacySettings(): PrivacySettings {
    return { ...this.settings.privacy };
  }

  getBackupSettings(): BackupSettings {
    return { ...this.settings.backup };
  }

  updateGeneralSettings(updates: Partial<GeneralSettings>) {
    this.settings.general = { ...this.settings.general, ...updates };
    this.saveSettings();
  }

  updateDisplaySettings(updates: Partial<DisplaySettings>) {
    this.settings.display = { ...this.settings.display, ...updates };
    this.saveSettings();
  }

  updateNetworkSettings(updates: Partial<NetworkSettings>) {
    this.settings.network = { ...this.settings.network, ...updates };
    this.saveSettings();
  }

  updatePrivacySettings(updates: Partial<PrivacySettings>) {
    this.settings.privacy = { ...this.settings.privacy, ...updates };
    this.saveSettings();
  }

  updateBackupSettings(updates: Partial<BackupSettings>) {
    this.settings.backup = { ...this.settings.backup, ...updates };
    this.saveSettings();
  }

  resetSettings() {
    this.settings = this.getDefaultSettings();
    this.saveSettings();
  }

  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  importSettings(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData);
      this.settings = { ...this.getDefaultSettings(), ...imported };
      this.saveSettings();
      return true;
    } catch (err) {
      console.error('Failed to import settings:', err);
      return false;
    }
  }

  formatAmount(amount: number): string {
    const { unit, decimalPlaces } = this.settings.display;
    
    let value = amount;
    let suffix = unit;

    switch (unit) {
      case 'mKBC':
        value = amount * 1000;
        break;
      case 'sat':
        value = amount * 100000000;
        break;
    }

    return `${value.toFixed(decimalPlaces)} ${suffix}`;
  }
}

const settingsService = new SettingsService();
export default settingsService;
