interface PaymentRequest {
  address: string;
  amount?: number;
  note?: string;
  expiry?: Date;
}

interface QROptions {
  size?: number;
  fgColor?: string;
  bgColor?: string;
  includeLogo?: boolean;
}

class QRService {
  createPaymentRequest(
    address: string,
    amount?: number,
    note?: string,
    expiryHours: number = 24
  ): string {
    const request: PaymentRequest = {
      address,
    };

    if (amount && amount > 0) {
      request.amount = amount;
    }

    if (note) {
      request.note = note;
    }

    if (expiryHours > 0) {
      request.expiry = new Date(Date.now() + expiryHours * 3600000);
    }

    // Encode as URI format: kubercoin:address?amount=X&note=Y&expiry=Z
    let uri = `kubercoin:${address}`;
    const params: string[] = [];

    if (request.amount) {
      params.push(`amount=${request.amount}`);
    }

    if (request.note) {
      params.push(`note=${encodeURIComponent(request.note)}`);
    }

    if (request.expiry) {
      params.push(`expiry=${request.expiry.toISOString()}`);
    }

    if (params.length > 0) {
      uri += '?' + params.join('&');
    }

    return uri;
  }

  parsePaymentRequest(data: string): PaymentRequest | null {
    try {
      // Remove kubercoin: prefix
      const cleaned = data.replace(/^kubercoin:/, '');

      // Split address and query params
      const [address, queryString] = cleaned.split('?');

      if (!address) return null;

      const request: PaymentRequest = { address };

      if (queryString) {
        const params = new URLSearchParams(queryString);

        const amount = params.get('amount');
        if (amount) {
          request.amount = parseFloat(amount);
        }

        const note = params.get('note');
        if (note) {
          request.note = decodeURIComponent(note);
        }

        const expiry = params.get('expiry');
        if (expiry) {
          request.expiry = new Date(expiry);
        }
      }

      return request;
    } catch {
      return null;
    }
  }

  generateQR(data: string, options: QROptions = {}): string {
    const {
      size = 256,
      fgColor = '#000000',
      bgColor = '#ffffff',
      includeLogo = false,
    } = options;

    // In production, use a QR code library like qrcode or qr-code-styling
    // For now, return a data URL with canvas-based QR generation

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Generate simple QR-like pattern (in production, use proper QR library)
    const moduleSize = Math.floor(size / 25); // 25x25 modules
    ctx.fillStyle = fgColor;

    // Simple hash-based pattern generation (NOT a real QR code!)
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        const hash = this.simpleHash(data + x + y);
        if (hash % 2 === 0) {
          ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
        }
      }
    }

    // Add finder patterns (corners)
    this.drawFinderPattern(ctx, 0, 0, moduleSize, fgColor, bgColor);
    this.drawFinderPattern(ctx, 18 * moduleSize, 0, moduleSize, fgColor, bgColor);
    this.drawFinderPattern(ctx, 0, 18 * moduleSize, moduleSize, fgColor, bgColor);

    // Add logo in center if requested
    if (includeLogo) {
      const logoSize = size * 0.2;
      const logoX = (size - logoSize) / 2;
      const logoY = (size - logoSize) / 2;

      // Draw white background for logo
      ctx.fillStyle = bgColor;
      ctx.fillRect(logoX, logoY, logoSize, logoSize);

      // Draw simple "KC" text as logo
      ctx.fillStyle = fgColor;
      ctx.font = `bold ${logoSize * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KC', size / 2, size / 2);
    }

    return canvas.toDataURL('image/png');
  }

  private drawFinderPattern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    moduleSize: number,
    fgColor: string,
    bgColor: string
  ): void {
    // Outer square (7x7)
    ctx.fillStyle = fgColor;
    ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);

    // Inner white square (5x5)
    ctx.fillStyle = bgColor;
    ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);

    // Inner black square (3x3)
    ctx.fillStyle = fgColor;
    ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  decodeQR(imageData: ImageData): string | null {
    // In production, use a QR decoding library like jsQR
    // For now, return null (scanner will need actual implementation)
    
    // This is a placeholder - real implementation would:
    // 1. Detect QR code pattern in image
    // 2. Extract modules (black/white squares)
    // 3. Decode data using Reed-Solomon error correction
    // 4. Return decoded string

    return null;
  }

  // Batch QR generation
  generateBatchQRs(addresses: string[], options: QROptions = {}): Array<{ address: string; dataUrl: string }> {
    return addresses.map(address => ({
      address,
      dataUrl: this.generateQR(this.createPaymentRequest(address), options),
    }));
  }

  // QR code history storage
  private readonly HISTORY_KEY = 'qr_code_history';

  saveToHistory(type: 'generated' | 'scanned', data: string): void {
    const history = this.getHistory();
    history.unshift({
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 50 entries
    if (history.length > 50) {
      history.splice(50);
    }

    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  }

  getHistory(): Array<{ type: 'generated' | 'scanned'; data: string; timestamp: string }> {
    const data = localStorage.getItem(this.HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  }

  clearHistory(): void {
    localStorage.removeItem(this.HISTORY_KEY);
  }
}

const qrService = new QRService();
export default qrService;
