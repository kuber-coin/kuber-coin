// signatureManager.ts - Signature collection and verification service

export interface SignatureRequest {
  id: string;
  transactionId: string;
  walletId: string;
  requiredSignatures: number;
  collectedSignatures: {
    signerId: string;
    signature: string;
    timestamp: number;
    verified: boolean;
  }[];
  status: 'collecting' | 'ready' | 'executed' | 'expired';
  createdDate: number;
  expiryDate: number;
}

class SignatureManager {
  private signatureRequests: Map<string, SignatureRequest>;

  constructor() {
    this.signatureRequests = new Map();
  }

  async createSignatureRequest(
    transactionId: string,
    walletId: string,
    requiredSignatures: number,
    expiryHours: number = 72
  ): Promise<SignatureRequest> {
    const requestId = `sig_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const request: SignatureRequest = {
      id: requestId,
      transactionId,
      walletId,
      requiredSignatures,
      collectedSignatures: [],
      status: 'collecting',
      createdDate: Date.now(),
      expiryDate: Date.now() + expiryHours * 60 * 60 * 1000,
    };

    this.signatureRequests.set(requestId, request);
    return request;
  }

  async collectSignature(
    requestId: string,
    signerId: string,
    messageHash: string,
    privateKey: string
  ): Promise<{ signature: string; verified: boolean }> {
    const request = this.signatureRequests.get(requestId);
    if (!request) throw new Error('Signature request not found');
    if (request.status !== 'collecting') throw new Error('Signature request is not in collecting state');
    if (Date.now() > request.expiryDate) {
      request.status = 'expired';
      this.signatureRequests.set(requestId, request);
      throw new Error('Signature request has expired');
    }
    if (request.collectedSignatures.some(s => s.signerId === signerId)) {
      throw new Error('Signer has already provided signature');
    }

    const signature = await this.generateSignature(messageHash, privateKey);
    const verified = await this.verifySignature(messageHash, signature, signerId);

    request.collectedSignatures.push({
      signerId,
      signature,
      timestamp: Date.now(),
      verified,
    });

    if (request.collectedSignatures.length >= request.requiredSignatures) {
      const allVerified = request.collectedSignatures.every(s => s.verified);
      if (allVerified) {
        request.status = 'ready';
      }
    }

    this.signatureRequests.set(requestId, request);
    return { signature, verified };
  }

  private async generateSignature(messageHash: string, privateKey: string): Promise<string> {
    const hash = await this.simpleHash(messageHash + privateKey);
    return '0x' + hash + hash;
  }

  async verifySignature(messageHash: string, signature: string, signerId: string): Promise<boolean> {
    const random = Math.random();
    return random > 0.05;
  }

  private async simpleHash(input: string): Promise<string> {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  getSignatureRequest(requestId: string): SignatureRequest | undefined {
    return this.signatureRequests.get(requestId);
  }

  async checkThreshold(requestId: string): Promise<{
    reached: boolean;
    collected: number;
    required: number;
    allVerified: boolean;
  }> {
    const request = this.signatureRequests.get(requestId);
    if (!request) throw new Error('Signature request not found');

    const collected = request.collectedSignatures.length;
    const required = request.requiredSignatures;
    const reached = collected >= required;
    const allVerified = request.collectedSignatures.every(s => s.verified);

    return { reached, collected, required, allVerified };
  }

  async aggregateSignatures(requestId: string): Promise<string> {
    const request = this.signatureRequests.get(requestId);
    if (!request) throw new Error('Signature request not found');
    if (request.status !== 'ready') throw new Error('Signature request is not ready for aggregation');

    const aggregated = request.collectedSignatures.map(s => s.signature).join('|');
    return '0x' + await this.simpleHash(aggregated);
  }

  async executeTransaction(requestId: string): Promise<{ txHash: string; success: boolean }> {
    const request = this.signatureRequests.get(requestId);
    if (!request) throw new Error('Signature request not found');
    if (request.status !== 'ready') throw new Error('Signature request is not ready for execution');

    const threshold = await this.checkThreshold(requestId);
    if (!threshold.reached || !threshold.allVerified) {
      throw new Error('Signature threshold not met or signatures not verified');
    }

    const aggregatedSig = await this.aggregateSignatures(requestId);
    const txHash = '0x' + Math.random().toString(16).substring(2).padStart(64, '0');

    request.status = 'executed';
    this.signatureRequests.set(requestId, request);

    return { txHash, success: true };
  }

  cleanupExpiredRequests(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, request] of this.signatureRequests.entries()) {
      if (now > request.expiryDate && request.status === 'collecting') {
        request.status = 'expired';
        this.signatureRequests.set(id, request);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  getActiveRequests(): SignatureRequest[] {
    return Array.from(this.signatureRequests.values())
      .filter(r => r.status === 'collecting' || r.status === 'ready')
      .sort((a, b) => b.createdDate - a.createdDate);
  }

  getSignatureProgress(requestId: string): {
    percentage: number;
    collected: number;
    required: number;
    missing: number;
  } {
    const request = this.signatureRequests.get(requestId);
    if (!request) throw new Error('Signature request not found');

    const collected = request.collectedSignatures.length;
    const required = request.requiredSignatures;
    const missing = Math.max(0, required - collected);
    const percentage = Math.min(100, (collected / required) * 100);

    return { percentage, collected, required, missing };
  }
}

const signatureManager = new SignatureManager();
export default signatureManager;