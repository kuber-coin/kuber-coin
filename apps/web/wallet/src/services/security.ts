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
   * Derive a PBKDF2 key from a password and a hex-encoded salt.
   * Returns an encoded string: "pbkdf2:<saltHex>:<keyHex>".
   * Using PBKDF2-SHA-256 with 200 000 iterations makes brute-force
   * attacks ~200 000x harder than a bare SHA-256 hash, and the per-entry
   * salt prevents pre-computed (rainbow-table) attacks.
   */
  private async deriveKey(password: string, saltHex?: string): Promise<string> {
    const salt = saltHex
      ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
      : globalThis.crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
      keyMaterial,
      256
    );
    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pbkdf2:${toHex(salt.buffer)}:${toHex(derived)}`;
  }

  /** @deprecated Use deriveKey internally; kept for any external callers. */
  async hashPassword(password: string): Promise<string> {
    return this.deriveKey(password);
  }

  /**
   * Set wallet password
   */
  async setPassword(newPassword: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const encoded = await this.deriveKey(newPassword);
      localStorage.setItem('kubercoin_password_hash', encoded);

      const settings = this.getSettings();
      settings.passwordEnabled = true;
      this.saveSettings(settings);
    } catch (error) {
      throw new Error('Failed to set password: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Verify password against a stored PBKDF2-encoded string.
   * Format: "pbkdf2:<saltHex>:<keyHex>"
   */
  async verifyPassword(password: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem('kubercoin_password_hash');
      if (!stored) return false;

      if (!stored.startsWith('pbkdf2:')) {
        // Stored value is a legacy bare SHA-256 hash; force the user to reset.
        return false;
      }
      const [, saltHex, expectedKeyHex] = stored.split(':');
      const candidate = await this.deriveKey(password, saltHex);
      const [, , candidateKeyHex] = candidate.split(':');

      // Timing-safe comparison: compare every char so we don't leak length info
      if (candidateKeyHex.length !== expectedKeyHex.length) return false;
      let diff = 0;
      for (let i = 0; i < expectedKeyHex.length; i++) {
        diff |= expectedKeyHex.charCodeAt(i) ^ candidateKeyHex.charCodeAt(i);
      }
      return diff === 0;
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
