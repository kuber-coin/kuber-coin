'use client';

import React, { useEffect, useRef } from 'react';
import tradingEngine from '@/services/tradingEngine';

interface TradingChartProps {
  pair: string;
  indicators?: string[];
}

export default function TradingChart({ pair, indicators = [] }: TradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Get price history
    const data = tradingEngine.getPriceHistory(pair, '1m', 100);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No market data available', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Calculate chart dimensions
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    // Find min and max prices
    const prices = data.map(d => d.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = Math.max(maxPrice - minPrice, 1e-8);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      // Price labels
      const price = maxPrice - (priceRange / 5) * i;
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('$' + price.toFixed(2), padding - 5, y + 4);
    }

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (chartWidth / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, canvas.height - padding);
      ctx.stroke();
    }

    // Draw candlesticks
    const candleWidth = chartWidth / data.length;
    data.forEach((candle, index) => {
      const x = padding + index * candleWidth;
      const bodyTop = padding + ((maxPrice - Math.max(candle.open, candle.close)) / priceRange) * chartHeight;
      const bodyBottom = padding + ((maxPrice - Math.min(candle.open, candle.close)) / priceRange) * chartHeight;
      const wickTop = padding + ((maxPrice - candle.high) / priceRange) * chartHeight;
      const wickBottom = padding + ((maxPrice - candle.low) / priceRange) * chartHeight;

      const isGreen = candle.close >= candle.open;
      ctx.fillStyle = isGreen ? '#10b981' : '#ef4444';
      ctx.strokeStyle = isGreen ? '#10b981' : '#ef4444';

      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x + candleWidth / 2, wickTop);
      ctx.lineTo(x + candleWidth / 2, wickBottom);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw body
      ctx.fillRect(x + 2, bodyTop, candleWidth - 4, Math.max(bodyBottom - bodyTop, 1));
    });

    // Draw indicators
    if (indicators.includes('MA')) {
      // Simple Moving Average (50-period)
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      data.forEach((candle, index) => {
        if (index < 50) return;
        
        const sum = data.slice(index - 50, index).reduce((acc, c) => acc + c.close, 0);
        const ma = sum / 50;
        const x = padding + index * candleWidth + candleWidth / 2;
        const y = padding + ((maxPrice - ma) / priceRange) * chartHeight;
        
        if (index === 50) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

    if (indicators.includes('BB')) {
      // Bollinger Bands
      const period = 20;
      const stdDevMultiplier = 2;

      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      // Upper band
      ctx.beginPath();
      data.forEach((candle, index) => {
        if (index < period) return;
        
        const slice = data.slice(index - period, index);
        const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;
        const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        const upper = mean + stdDev * stdDevMultiplier;
        
        const x = padding + index * candleWidth + candleWidth / 2;
        const y = padding + ((maxPrice - upper) / priceRange) * chartHeight;
        
        if (index === period) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Lower band
      ctx.beginPath();
      data.forEach((candle, index) => {
        if (index < period) return;
        
        const slice = data.slice(index - period, index);
        const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;
        const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        const lower = mean - stdDev * stdDevMultiplier;
        
        const x = padding + index * candleWidth + candleWidth / 2;
        const y = padding + ((maxPrice - lower) / priceRange) * chartHeight;
        
        if (index === period) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // Draw current price line
    const currentPrice = data[data.length - 1].close;
    const currentY = padding + ((maxPrice - currentPrice) / priceRange) * chartHeight;
    
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, currentY);
    ctx.lineTo(canvas.width - padding, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price label
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(canvas.width - padding, currentY - 10, padding, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$' + currentPrice.toFixed(2), canvas.width - padding / 2, currentY + 4);

  }, [pair, indicators]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      
      {/* Chart Controls */}
      <div className="absolute top-2 left-2 flex gap-2">
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          1m
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          5m
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          15m
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          1h
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          4h
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          1d
        </button>
      </div>

      <div className="absolute top-2 right-2 flex gap-2">
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          📊 Candlestick
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          📈 Line
        </button>
        <button className="px-3 py-1 bg-white border rounded hover:bg-gray-50 text-sm">
          📉 Area
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-blue-500"></div>
          <span>MA(50)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-purple-500" style={{ borderTop: '1px dashed' }}></div>
          <span>BB(20,2)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-yellow-500" style={{ borderTop: '2px dashed' }}></div>
          <span>Current Price</span>
        </div>
      </div>
    </div>
  );
}
