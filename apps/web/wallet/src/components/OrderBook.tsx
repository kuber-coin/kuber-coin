'use client';

import React, { useState, useEffect } from 'react';
import tradingEngine from '@/services/tradingEngine';

interface OrderBookProps {
  pair: string;
}

export default function OrderBook({ pair }: OrderBookProps) {
  const [orderBook, setOrderBook] = useState<{ bids: [number, number][]; asks: [number, number][] }>({
    bids: [],
    asks: [],
  });
  const [depth, setDepth] = useState(10);

  useEffect(() => {
    const loadOrderBook = () => {
      const book = tradingEngine.getOrderBook(pair);
      setOrderBook(book);
    };

    loadOrderBook();
    const interval = setInterval(loadOrderBook, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [pair]);

  const bidVolumes = orderBook.bids.slice(0, depth).map(([_, vol]) => vol);
  const askVolumes = orderBook.asks.slice(0, depth).map(([_, vol]) => vol);
  const maxBidVolume = bidVolumes.length > 0 ? Math.max(...bidVolumes) : 0;
  const maxAskVolume = askVolumes.length > 0 ? Math.max(...askVolumes) : 0;
  const maxVolume = Math.max(maxBidVolume, maxAskVolume, 0);

  const currentPrice = orderBook.asks[0] ? orderBook.asks[0][0] : 0;
  const spread = orderBook.asks[0] && orderBook.bids[0] 
    ? orderBook.asks[0][0] - orderBook.bids[0][0]
    : 0;
  const spreadPercent = currentPrice > 0 ? (spread / currentPrice) * 100 : 0;
  const totalBidVolume = bidVolumes.reduce((sum, vol) => sum + vol, 0);
  const totalAskVolume = askVolumes.reduce((sum, vol) => sum + vol, 0);
  const buySellRatio = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 0;

  return (
    <div className="space-y-2">
      {/* Depth Selector */}
      <div className="flex gap-2 text-xs">
        {[10, 20, 50].map(d => (
          <button
            key={d}
            onClick={() => setDepth(d)}
            className={`px-2 py-1 rounded ${
              depth === d ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 text-xs font-semibold text-gray-600 pb-1 border-b">
        <div className="text-left">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Total</div>
      </div>

      {!orderBook.asks.length && !orderBook.bids.length && (
        <div className="py-6 text-center text-xs text-gray-500">
          Order book data unavailable.
        </div>
      )}

      {/* Asks (Sell Orders) - Red */}
      <div className="space-y-0.5">
        {orderBook.asks.slice(0, depth).reverse().map(([price, amount], index) => {
          const total = price * amount;
          const volumePercent = maxVolume > 0 ? (amount / maxVolume) * 100 : 0;
          
          return (
            <div key={`ask-${index}`} className="relative group cursor-pointer hover:bg-red-50">
              {/* Volume Bar */}
              <div
                className="absolute right-0 top-0 h-full bg-red-100 opacity-30"
                style={{ width: `${volumePercent}%` }}
              />
              
              {/* Order Data */}
              <div className="relative grid grid-cols-3 text-xs py-0.5 px-1">
                <div className="text-red-600 font-medium">${price.toFixed(2)}</div>
                <div className="text-right">{amount.toFixed(4)}</div>
                <div className="text-right text-gray-600">${total.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spread */}
      <div className="py-2 px-2 bg-gray-100 rounded text-center">
        <div className="text-lg font-bold">${currentPrice.toFixed(2)}</div>
        <div className="text-xs text-gray-600">
          Spread: ${spread.toFixed(2)} ({spreadPercent.toFixed(3)}%)
        </div>
      </div>

      {/* Bids (Buy Orders) - Green */}
      <div className="space-y-0.5">
        {orderBook.bids.slice(0, depth).map(([price, amount], index) => {
          const total = price * amount;
          const volumePercent = maxVolume > 0 ? (amount / maxVolume) * 100 : 0;
          
          return (
            <div key={`bid-${index}`} className="relative group cursor-pointer hover:bg-green-50">
              {/* Volume Bar */}
              <div
                className="absolute right-0 top-0 h-full bg-green-100 opacity-30"
                style={{ width: `${volumePercent}%` }}
              />
              
              {/* Order Data */}
              <div className="relative grid grid-cols-3 text-xs py-0.5 px-1">
                <div className="text-green-600 font-medium">${price.toFixed(2)}</div>
                <div className="text-right">{amount.toFixed(4)}</div>
                <div className="text-right text-gray-600">${total.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Book Stats */}
      <div className="pt-2 border-t text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Bid Volume:</span>
          <span className="font-medium text-green-600">
            {totalBidVolume.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Ask Volume:</span>
          <span className="font-medium text-red-600">
            {totalAskVolume.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Buy/Sell Ratio:</span>
          <span className="font-medium">
            {buySellRatio.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
