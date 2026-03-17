// authentication.ts - 2FA, WebAuthn, and biometric authentication

export interface TOTPSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface WebAuthnCredential {
  id: string;
  name: string;
  createdAt: number;
}

class Authentication {
  private totpEnabled = false;
  private totpSecret: string | null = null;
  private webauthnCredentials: WebAuthnCredential[] = [];
  private biometricAvailable = false;

  constructor() {
    // Check if WebAuthn is available
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      this.biometricAvailable = true;
    }
  }

  // TOTP (Time-based One-Time Password)
  async setupTOTP(): Promise<TOTPSetup> {
    const secret = this.generateSecret(32);
    const issuer = encodeURIComponent('Kubercoin');
    const label = encodeURIComponent('Kubercoin');
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    const backupCodes = this.generateBackupCodes(8);

    this.totpSecret = secret;

    return { secret, qrCode: otpauthUrl, backupCodes };
  }

  async verifyTOTP(code: string): Promise<boolean> {
    if (!this.totpSecret) return false;
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return false;
    throw new Error('TOTP verification requires a shared secret validator.');
  }

  isTOTPEnabled(): boolean {
    return this.totpEnabled;
  }

  async disableTOTP(): Promise<boolean> {
    this.totpEnabled = false;
    this.totpSecret = null;
    return true;
  }

  // WebAuthn
  async registerWebAuthn(credentialName: string): Promise<boolean> {
    if (!this.biometricAvailable) {
      throw new Error('WebAuthn not supported');
    }
    throw new Error(`WebAuthn registration requires a server-provided challenge for ${credentialName}.`);
  }

  async authenticateWebAuthn(): Promise<boolean> {
    if (!this.biometricAvailable || this.webauthnCredentials.length === 0) {
      return false;
    }
    throw new Error('WebAuthn authentication requires a server-provided challenge.');
  }

  getWebAuthnCredentials(): WebAuthnCredential[] {
    return [...this.webauthnCredentials];
  }

  async removeWebAuthnCredential(credentialId: string): Promise<boolean> {
    const index = this.webauthnCredentials.findIndex(c => c.id === credentialId);
    if (index > -1) {
      this.webauthnCredentials.splice(index, 1);
      return true;
    }
    return false;
  }

  // Biometric
  isBiometricAvailable(): boolean {
    return this.biometricAvailable;
  }

  async authenticateBiometric(): Promise<boolean> {
    if (!this.biometricAvailable) {
      return false;
    }
    try {
      return await this.authenticateWebAuthn();
    } catch {
      return false;
    }
  }

  // Helper
  private generateSecret(length: number): string {
    const crypto = this.getCrypto();
    const byteLength = Math.ceil((length * 5) / 8);
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return this.base32Encode(bytes).slice(0, length);
  }

  private generateBackupCodes(count: number): string[] {
    const crypto = this.getCrypto();
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      codes.push(this.base32Encode(bytes).slice(0, 8));
    }
    return codes;
  }

  private base32Encode(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private getCrypto(): Crypto {
    if (typeof window === 'undefined' || !window.crypto) {
      throw new Error('Secure random unavailable.');
    }
    return window.crypto;
  }
}

const authentication = new Authentication();
export default authentication;