// threatDetection.ts - Phishing and malware detection

export interface ThreatCheck {
  isThreat: boolean;
  type?: 'phishing' | 'malware' | 'scam';
  confidence: number;
  details: string;
}

class ThreatDetection {
  private phishingDomains = [
    'fake-kubercoin.com',
    'kubercoin-wallet.net',
    'secure-kubercoin.org'
  ];

  private blacklistedAddresses = [
    '0x000000000000000000000000000000000000dead',
    '0xscamaddress123456789abcdef'
  ];

  async checkURL(url: string): Promise<ThreatCheck> {
    const domain = this.extractDomain(url);

    for (const phishing of this.phishingDomains) {
      if (domain.includes(phishing)) {
        return {
          isThreat: true,
          type: 'phishing',
          confidence: 0.95,
          details: `Known phishing domain: ${phishing}`
        };
      }
    }

    // Check for common phishing patterns
    if (domain.includes('wallet') && domain.includes('secure')) {
      return {
        isThreat: true,
        type: 'phishing',
        confidence: 0.70,
        details: 'Suspicious domain pattern detected'
      };
    }

    return {
      isThreat: false,
      confidence: 0.95,
      details: 'URL appears safe'
    };
  }

  async checkAddress(address: string): Promise<ThreatCheck> {
    if (this.blacklistedAddresses.includes(address.toLowerCase())) {
      return {
        isThreat: true,
        type: 'scam',
        confidence: 1.0,
        details: 'Address is on the scam blacklist'
      };
    }

    // Check for patterns
    if (address.toLowerCase().includes('scam') || address.toLowerCase().includes('phish')) {
      return {
        isThreat: true,
        type: 'scam',
        confidence: 0.85,
        details: 'Address contains suspicious keywords'
      };
    }

    return {
      isThreat: false,
      confidence: 0.90,
      details: 'Address appears safe'
    };
  }

  async scanContract(contractAddress: string): Promise<ThreatCheck> {
    return {
      isThreat: false,
      confidence: 0,
      details: 'Contract scanning not configured'
    };
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  addToBlacklist(address: string): boolean {
    if (!this.blacklistedAddresses.includes(address.toLowerCase())) {
      this.blacklistedAddresses.push(address.toLowerCase());
      return true;
    }
    return false;
  }

  removeFromBlacklist(address: string): boolean {
    const index = this.blacklistedAddresses.indexOf(address.toLowerCase());
    if (index > -1) {
      this.blacklistedAddresses.splice(index, 1);
      return true;
    }
    return false;
  }

  getBlacklist(): string[] {
    return [...this.blacklistedAddresses];
  }
}

const threatDetection = new ThreatDetection();
export default threatDetection;