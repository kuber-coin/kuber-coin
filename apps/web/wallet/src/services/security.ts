/**
 * Security Service for KuberCoin Wallet
 * Handles encryption, password management, and secure storage
 */

export interface SecuritySettings {
  passwordEnabled: boolean;
  sessionTimeout: number; // in minutes
  requireConfirmation: boolean;
  biometricEnabled: boolean;
}

class SecurityService {
  private password: string | null = null;
  private sessionStartTime: number = 0;
  private isLocked: boolean = true;

  constructor() {
    this.loadSettings();
  }

  /**
   * Load security settings from localStorage
   */
  private loadSettings(): SecuritySettings {
    if (typeof window === 'undefined') {
      return this.getDefaultSettings();
    }

    try {
      const stored = localStorage.getItem('kubercoin_security_settings');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load security settings:', error);
    }

    return this.getDefaultSettings();
  }

  /**
   * Get default security settings
   */
  private getDefaultSettings(): SecuritySettings {
    return {
      passwordEnabled: false,
      sessionTimeout: 15,
      requireConfirmation: true,
      biometricEnabled: false,
    };
  }

  /**
   * Save security settings to localStorage
   */
  saveSettings(settings: SecuritySettings): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('kubercoin_security_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save security settings:', error);
    }
  }

  /**
   * Get current security settings
   */
  getSettings(): SecuritySettings {
    return this.loadSettings();
  }

  /**
   * Simple encryption using Web Crypto API
   */
  async encrypt(data: string, password: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Derive key from password
      const passwordBuffer = encoder.encode(password);
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBuffer
      );

      // Combine salt + iv + encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      throw new Error('Encryption failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Decrypt data using Web Crypto API
   */
  async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      // Convert from base64
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

      // Extract salt, iv, and encrypted data
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const data = combined.slice(28);

      // Derive key from password
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      throw new Error('Decryption failed: Invalid password or corrupted data');
    }
  }

  /**
   * Hash password for storage
   */
  async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Set wallet password
   */
  async setPassword(newPassword: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const hashedPassword = await this.hashPassword(newPassword);
      localStorage.setItem('kubercoin_password_hash', hashedPassword);
      
      const settings = this.getSettings();
      settings.passwordEnabled = true;
      this.saveSettings(settings);
    } catch (error) {
      throw new Error('Failed to set password: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Verify password
   */
  async verifyPassword(password: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      const storedHash = localStorage.getItem('kubercoin_password_hash');
      if (!storedHash) return false;

      const hashedPassword = await this.hashPassword(password);
      return hashedPassword === storedHash;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Unlock wallet with password
   */
  async unlock(password: string): Promise<boolean> {
    const isValid = await this.verifyPassword(password);
    if (isValid) {
      this.password = password;
      this.sessionStartTime = Date.now();
      this.isLocked = false;
      return true;
    }
    return false;
  }

  /**
   * Lock wallet
   */
  lock(): void {
    this.password = null;
    this.sessionStartTime = 0;
    this.isLocked = true;
  }

  /**
   * Check if wallet is locked
   */
  isWalletLocked(): boolean {
    // Check session timeout
    const settings = this.getSettings();
    if (settings.sessionTimeout > 0 && this.sessionStartTime > 0) {
      const elapsed = Date.now() - this.sessionStartTime;
      const timeoutMs = settings.sessionTimeout * 60 * 1000;
      
      if (elapsed > timeoutMs) {
        this.lock();
        return true;
      }
    }

    return this.isLocked;
  }

  /**
   * Change password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const isValid = await this.verifyPassword(oldPassword);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    await this.setPassword(newPassword);
    return true;
  }

  /**
   * Remove password protection
   */
  async removePassword(password: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const isValid = await this.verifyPassword(password);
    if (!isValid) {
      throw new Error('Password is incorrect');
    }

    localStorage.removeItem('kubercoin_password_hash');
    const settings = this.getSettings();
    settings.passwordEnabled = false;
    this.saveSettings(settings);
    
    this.lock();
    return true;
  }

  /**
   * Check if password is set
   */
  hasPassword(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('kubercoin_password_hash') !== null;
  }

  /**
   * Update session activity
   */
  updateActivity(): void {
    if (!this.isLocked) {
      this.sessionStartTime = Date.now();
    }
  }

  /**
   * Get time until session expires (in seconds)
   */
  getTimeUntilExpiry(): number {
    if (this.isLocked || this.sessionStartTime === 0) {
      return 0;
    }

    const settings = this.getSettings();
    const timeoutMs = settings.sessionTimeout * 60 * 1000;
    const elapsed = Date.now() - this.sessionStartTime;
    const remaining = timeoutMs - elapsed;

    return Math.max(0, Math.floor(remaining / 1000));
  }
}

// Export singleton instance
const securityService = new SecurityService();
export default securityService;
