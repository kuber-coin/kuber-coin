// backupManager.ts - Backup and recovery management service

export interface Backup {
  id: string;
  type: 'shamir' | 'social' | 'cloud' | 'local';
  name: string;
  createdDate: number;
  lastVerified?: number;
  shares?: number;
  threshold?: number;
  encrypted: boolean;
  synced: boolean;
}

export interface BackupVerification {
  backupId: string;
  success: boolean;
  timestamp: number;
  errors?: string[];
}

class BackupManager {
  private backups: Map<string, Backup>;

  constructor() {
    this.backups = new Map();
    this.loadBackups();
  }

  private loadBackups() {
    try {
      const stored = localStorage.getItem('kubercoin_backup_manager');
      if (!stored) return;
      const backups = JSON.parse(stored) as Backup[];
      backups.forEach((backup) => this.backups.set(backup.id, backup));
    } catch {
      // ignore corrupt storage
    }
  }

  private saveBackups() {
    try {
      localStorage.setItem('kubercoin_backup_manager', JSON.stringify(Array.from(this.backups.values())));
    } catch {
      // ignore storage errors
    }
  }

  getAllBackups(): Backup[] {
    return Array.from(this.backups.values());
  }

  async createBackup(type: 'shamir' | 'social' | 'cloud' | 'local', name: string, options?: {
    shares?: number;
    threshold?: number;
    encryptionPassword?: string;
  }): Promise<Backup> {
    const backupId = `backup_${Date.now()}`;

    const backup: Backup = {
      id: backupId,
      type,
      name,
      createdDate: Date.now(),
      shares: options?.shares,
      threshold: options?.threshold,
      encrypted: !!options?.encryptionPassword,
      synced: false,
    };

    this.backups.set(backupId, backup);
    this.saveBackups();
    return backup;
  }

  async verifyBackup(backupId: string): Promise<BackupVerification> {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }
    backup.lastVerified = Date.now();
    this.backups.set(backupId, backup);
    this.saveBackups();

    return {
      backupId,
      success: true,
      timestamp: Date.now(),
    };
  }

  async encryptData(data: string, password: string): Promise<string> {
    const crypto = this.getCrypto();
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);

    const key = await this.deriveKey(password, salt);
    const encoded = new TextEncoder().encode(data);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const cipherBytes = new Uint8Array(ciphertext);

    return `v1:${this.toBase64(salt)}:${this.toBase64(iv)}:${this.toBase64(cipherBytes)}`;
  }

  async decryptData(encryptedData: string, password: string): Promise<string> {
    const crypto = this.getCrypto();
    const [version, saltB64, ivB64, dataB64] = encryptedData.split(':');
    if (version !== 'v1' || !saltB64 || !ivB64 || !dataB64) {
      throw new Error('Invalid encrypted data');
    }

    const salt = this.fromBase64(saltB64);
    const iv = this.fromBase64(ivB64);
    const data = this.fromBase64(dataB64);
    const ivBytes = new Uint8Array(iv);
    const key = await this.deriveKey(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      this.toArrayBuffer(data)
    );
    return new TextDecoder().decode(plaintext);
  }

  async syncToCloud(backupId: string): Promise<boolean> {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    backup.synced = true;
    this.backups.set(backupId, backup);
    this.saveBackups();
    return true;
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    const deleted = this.backups.delete(backupId);
    if (deleted) this.saveBackups();
    return deleted;
  }

  async exportBackup(backupId: string): Promise<Blob> {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    const data = JSON.stringify(backup, null, 2);
    return new Blob([data], { type: 'application/json' });
  }

  private getCrypto(): Crypto {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('WebCrypto is not available.');
    }
    return window.crypto;
  }

  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const crypto = this.getCrypto();
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.toArrayBuffer(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return new Uint8Array(bytes).buffer;
  }

  private fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

const backupManager = new BackupManager();
export default backupManager;