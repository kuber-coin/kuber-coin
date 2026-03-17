'use client';

import { useEffect, useRef } from 'react';

interface QRGeneratorProps {
  data: string;
  size?: number;
  label?: string;
}

export default function QRGenerator({ data, size = 256, label }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    generateQR();
  }, [data, size]);

  const generateQR = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Simple QR code simulation (in production, use qrcode library)
    const qrSize = size;
    const moduleSize = Math.floor(qrSize / 25);

    canvas.width = qrSize;
    canvas.height = qrSize;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, qrSize, qrSize);

    // Black modules (simplified pattern)
    ctx.fillStyle = '#000000';
    
    // Generate pseudo-random pattern based on data
    const seed = data.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let random = seed;
    
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        random = (random * 1103515245 + 12345) & 0x7fffffff;
        if (random % 2 === 0) {
          ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
        }
      }
    }

    // Position patterns (corners)
    drawPositionPattern(ctx, 0, 0, moduleSize);
    drawPositionPattern(ctx, 18 * moduleSize, 0, moduleSize);
    drawPositionPattern(ctx, 0, 18 * moduleSize, moduleSize);
  };

  const drawPositionPattern = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    moduleSize: number
  ) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-code-${Date.now()}.png`;
      a.click();
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      alert('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg inline-block">
        <canvas ref={canvasRef} className="block" />
      </div>

      {label && (
        <div className="text-center text-purple-200 font-semibold">{label}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
        >
          💾 Download
        </button>
        <button
          onClick={handleCopy}
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
        >
          📋 Copy Data
        </button>
      </div>

      <div className="p-3 bg-purple-900/50 rounded-lg">
        <div className="text-xs text-purple-300 break-all font-mono">{data}</div>
      </div>
    </div>
  );
}
