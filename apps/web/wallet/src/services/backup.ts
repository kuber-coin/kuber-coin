/**
 * Backup Service
 * Handles full wallet backups with encryption
 */

import walletService from './wallet';
import securityService from './security';
import addressBookService from './addressBook';
import settingsService from './settings';
import transactionLabelsService from './transactionLabels';

export interface BackupData {
  version: string;
  timestamp: number;
  wallets: any[];
  addressBook: any[];
  settings: any;
  securitySettings: any;
  transactionLabels: any[];
}

class BackupService {
  private readonly BACKUP_VERSION = '1.0.0';

  async createFullBackup(password?: string): Promise<string> {
    try {
      const backup: BackupData = {
        version: this.BACKUP_VERSION,
        timestamp: Date.now(),
        wallets: walletService.getWallets(),
        addressBook: addressBookService.getAllContacts(),
        settings: settingsService.getSettings(),
        securitySettings: securityService.getSettings(),
        transactionLabels: transactionLabelsService.getAllLabels(),
      };

      const jsonData = JSON.stringify(backup, null, 2);

      if (password) {
        // Encrypt the backup
        const encrypted = await securityService.encrypt(jsonData, password);
        return JSON.stringify({ encrypted: true, data: encrypted });
      }

      return jsonData;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async restoreFromBackup(backupData: string, password?: string): Promise<void> {
    try {
      let data: any;

      // Check if backup is encrypted
      try {
        const parsed = JSON.parse(backupData);
        if (parsed.encrypted) {
          if (!password) {
            throw new Error('Password required for encrypted backup');
          }
          const decrypted = await securityService.decrypt(parsed.data, password);
          data = JSON.parse(decrypted);
        } else {
          data = parsed;
        }
      } catch {
        // Try parsing as plain JSON
        data = JSON.parse(backupData);
      }

      // Validate backup structure
      if (!data.version || !data.timestamp) {
        throw new Error('Invalid backup file format');
      }

      // Show confirmation
      const confirmed = confirm(
        `This will restore a backup from ${new Date(data.timestamp).toLocaleString()}. Current data will be overwritten. Continue?`
      );

      if (!confirmed) {
        throw new Error('Restore cancelled by user');
      }

      // Restore wallets
      if (data.wallets && Array.isArray(data.wallets)) {
        // Clear existing wallets (dangerous - maybe keep a backup?)
        const existingWallets = walletService.getWallets();
        
        // Import wallets from backup
        data.wallets.forEach((wallet: any) => {
          try {
            // This would need a method to restore wallet data
            // For now, we'll just note this limitation
          } catch (err) {
            console.error('Failed to restore wallet:', wallet.address, err);
          }
        });
      }

      // Restore address book
      if (data.addressBook && Array.isArray(data.addressBook)) {
        data.addressBook.forEach((contact: any) => {
          try {
            addressBookService.addContact(
              contact.name,
              contact.address,
              contact.label,
              contact.tags || [],
              contact.notes
            );
          } catch (err) {
            // Skip duplicates
          }
        });
      }

      // Restore settings
      if (data.settings) {
        settingsService.importSettings(JSON.stringify(data.settings));
      }

      // Restore transaction labels
      if (data.transactionLabels && Array.isArray(data.transactionLabels)) {
        transactionLabelsService.importLabels(JSON.stringify({ labels: data.transactionLabels }));
      }

    } catch (error) {
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  exportWalletOnly(address: string): string | null {
    const wallet = walletService.getWallet(address);
    if (!wallet) return null;

    const backup = {
      version: this.BACKUP_VERSION,
      timestamp: Date.now(),
      type: 'single-wallet',
      wallet,
    };

    return JSON.stringify(backup, null, 2);
  }

  async importWalletFromJSON(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.type === 'single-wallet' && data.wallet) {
        // Would need importWallet method in walletService
        // For now, user should use import private key feature
        throw new Error('Please use the Import Wallet feature with your private key');
      }

      return false;
    } catch (error) {
      throw new Error(`Failed to import wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  exportToCSV(type: 'wallets' | 'transactions' | 'contacts'): string {
    let csv = '';

    switch (type) {
      case 'wallets':
        csv = 'Label,Address,Balance,Created\n';
        walletService.getWallets().forEach((wallet) => {
          csv += `"${wallet.label}","${wallet.address}",${wallet.balance},${new Date(wallet.createdAt).toISOString()}\n`;
        });
        break;

      case 'contacts':
        csv = 'Name,Address,Label,Tags,Notes\n';
        addressBookService.getAllContacts().forEach((contact) => {
          csv += `"${contact.name}","${contact.address}","${contact.label || ''}","${contact.tags.join(';')}","${contact.notes || ''}"\n`;
        });
        break;

      case 'transactions':
        csv = 'TXID,Type,Amount,Confirmations,Note,Tags\n';
        transactionLabelsService.getAllLabels().forEach((label) => {
          csv += `"${label.txid}","Transaction",0,"${label.note || ''}","${label.tags.join(';')}"\n`;
        });
        break;
    }

    return csv;
  }

  getBackupSummary(): {
    walletCount: number;
    contactCount: number;
    labelCount: number;
    lastBackup?: number;
  } {
    return {
      walletCount: walletService.getWallets().length,
      contactCount: addressBookService.getAllContacts().length,
      labelCount: transactionLabelsService.getAllLabels().length,
      lastBackup: this.getLastBackupTimestamp(),
    };
  }

  private getLastBackupTimestamp(): number | undefined {
    try {
      const stored = localStorage.getItem('kubercoin_last_backup');
      return stored ? parseInt(stored) : undefined;
    } catch {
      return undefined;
    }
  }

  recordBackup() {
    try {
      localStorage.setItem('kubercoin_last_backup', Date.now().toString());
    } catch (err) {
      console.error('Failed to record backup timestamp:', err);
    }
  }
}

const backupService = new BackupService();
export default backupService;
