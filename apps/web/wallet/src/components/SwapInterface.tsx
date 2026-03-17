'use client';

import React, { useState } from 'react';
import { Button } from '@/components/Button';
import defiService from '@/services/defiService';

export default function SwapInterface() {
  const [fromToken, setFromToken] = useState('KC');
  const [toToken, setToToken] = useState('USDT');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState(2);

  const tokens = ['KC', 'USDT', 'ETH', 'BTC', 'FARM'];

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && parseFloat(value) > 0) {
      const estimate = defiService.estimateSwap(fromToken, toToken, parseFloat(value));
      setToAmount(estimate.estimatedOutput.toFixed(6));
    } else {
      setToAmount('');
    }
  };

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const handleSwap = () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      alert('Please enter an amount');
      return;
    }

    try {
      const txId = defiService.executeSwap(fromToken, toToken, parseFloat(fromAmount));
      alert(`Swap successful! Transaction ID: ${txId}`);
      setFromAmount('');
      setToAmount('');
    } catch (error: any) {
      alert('Swap failed: ' + error.message);
    }
  };

  const estimate = fromAmount && parseFloat(fromAmount) > 0
    ? defiService.estimateSwap(fromToken, toToken, parseFloat(fromAmount))
    : null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Swap Tokens</h2>

      {/* From Token */}
      <div className="p-4 border rounded-lg">
        <div className="flex justify-between mb-2">
          <label className="text-sm text-gray-600">From</label>
          <span className="text-sm text-gray-600">Balance: 100.0000</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
            placeholder="0.0000"
            className="flex-1 px-3 py-2 text-2xl border-none focus:outline-none"
          />
          <select
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            className="px-3 py-2 border rounded-lg font-semibold"
          >
            {tokens.map(token => (
              <option key={token} value={token}>{token}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSwapTokens}
          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
        >
          <svg className="w-6 h-6 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
      </div>

      {/* To Token */}
      <div className="p-4 border rounded-lg">
        <div className="flex justify-between mb-2">
          <label className="text-sm text-gray-600">To</label>
          <span className="text-sm text-gray-600">Balance: 50.0000</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.0000"
            className="flex-1 px-3 py-2 text-2xl border-none focus:outline-none bg-gray-50"
          />
          <select
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            className="px-3 py-2 border rounded-lg font-semibold"
          >
            {tokens.map(token => (
              <option key={token} value={token}>{token}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Swap Details */}
      {estimate && (
        <div className="p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Price Impact:</span>
            <span className={estimate.priceImpact > 1 ? 'text-red-600 font-semibold' : 'text-green-600'}>
              {estimate.priceImpact.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Liquidity Provider Fee:</span>
            <span>{estimate.fee.toFixed(6)} {fromToken}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Minimum Received ({slippage}% slippage):</span>
            <span>{estimate.minimumReceived.toFixed(6)} {toToken}</span>
          </div>
        </div>
      )}

      {/* Slippage Settings */}
      <div>
        <label className="block text-sm font-medium mb-2">Slippage Tolerance</label>
        <div className="flex gap-2">
          {[0.5, 1, 2, 5].map(value => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-3 py-1 rounded-lg text-sm ${
                slippage === value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {value}%
            </button>
          ))}
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(parseFloat(e.target.value) || 2)}
            className="w-20 px-2 py-1 border rounded-lg text-sm"
            step="0.1"
          />
        </div>
      </div>

      {/* Swap Button */}
      <Button onClick={handleSwap} className="w-full" disabled={!fromAmount || parseFloat(fromAmount) <= 0}>
        {!fromAmount || parseFloat(fromAmount) <= 0 ? 'Enter an amount' : 'Swap'}
      </Button>

      <div className="text-xs text-gray-500 text-center">
        By swapping, you agree to the terms of service. Prices may vary due to market conditions.
      </div>
    </div>
  );
}
