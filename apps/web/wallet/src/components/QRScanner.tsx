'use client';

import { useEffect, useRef, useState } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
}

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current !== null) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setScanning(true);
      }

      const DetectorCtor = (window as any).BarcodeDetector;
      if (!DetectorCtor) {
        onError?.('QR scanning is not supported on this device.');
        stopCamera();
        return;
      }

      detectorRef.current = new DetectorCtor({ formats: ['qr_code'] });
      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const results = await detectorRef.current.detect(videoRef.current);
          if (results && results.length > 0) {
            const value = results[0].rawValue || '';
            if (value) {
              onScan(value);
              stopCamera();
            }
          }
        } catch (error) {
          onError?.('Unable to read QR code.');
        }
      }, 500);
    } catch (err: any) {
      setHasCamera(false);
      onError?.('Camera access denied or not available');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setScanning(false);
    }
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    detectorRef.current = null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const DetectorCtor = (window as any).BarcodeDetector;
    if (!DetectorCtor) {
      onError?.('QR scanning is not supported on this device.');
      return;
    }

    const detector = new DetectorCtor({ formats: ['qr_code'] });
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        const results = await detector.detect(img);
        if (results && results.length > 0) {
          const value = results[0].rawValue || '';
          if (value) {
            onScan(value);
          } else {
            onError?.('QR code did not contain data.');
          }
        } else {
          onError?.('No QR code found in the image.');
        }
      } catch {
        onError?.('Unable to read QR code image.');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      onError?.('Unable to load QR code image.');
    };

    img.src = objectUrl;
  };

  return (
    <div className="space-y-4">
      {hasCamera && !scanning && (
        <button
          onClick={() => {
            startCamera();
          }}
          className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
        >
          📷 Start Camera
        </button>
      )}

      {scanning && (
        <div className="space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 border-4 border-purple-500">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-pink-500"></div>
            </div>
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <div className="inline-block px-4 py-2 bg-black/70 rounded-lg text-white text-sm">
                Scanning for QR code...
              </div>
            </div>
          </div>
          <button
            onClick={stopCamera}
            className="w-full px-6 py-3 bg-purple-700 hover:bg-purple-600 rounded-lg transition"
          >
            Stop Camera
          </button>
        </div>
      )}

      {!hasCamera && (
        <div className="p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg text-sm text-yellow-200">
          Camera not available. Upload an image instead.
        </div>
      )}

      <div>
        <label className="block">
          <span className="text-purple-200 mb-2 block text-sm">
            Or upload QR code image
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
          />
        </label>
      </div>
    </div>
  );
}
