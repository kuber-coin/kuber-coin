'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import TradingChart from '@/components/TradingChart';
import OrderBook from '@/components/OrderBook';
import tradingEngine, { Order, Trade, Position } from '@/services/tradingEngine';
import technicalAnalysis from '@/services/technicalAnalysis';

export default function TradingPage() {
  const [selectedPair, setSelectedPair] = useState('KC/USDT');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop-loss' | 'take-profit'>('limit');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['RSI', 'MACD']);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const pairs = ['KC/USDT', 'KC/ETH', 'KC/BTC', 'ETH/USDT', 'BTC/USDT'];

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [selectedPair]);

  const loadData = () => {
    setOrders(tradingEngine.getActiveOrders(selectedPair));
    setTrades(tradingEngine.getTradeHistory(selectedPair));
    setPositions(tradingEngine.getOpenPositions());
  };

  const handlePlaceOrder = () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if ((orderType === 'limit' || orderType === 'stop-loss' || orderType === 'take-profit') && 
        (!price || parseFloat(price) <= 0)) {
      alert('Please enter a valid price');
      return;
    }

    try {
      const orderId = tradingEngine.placeOrder({
        pair: selectedPair,
        type: orderType,
        side,
        price: price ? parseFloat(price) : undefined,
        amount: parseFloat(amount),
      });

      alert(`Order placed successfully! Order ID: ${orderId}`);
      setPrice('');
      setAmount('');
      loadData();
    } catch (error: any) {
      alert('Order failed: ' + error.message);
    }
  };

  const handleCancelOrder = (orderId: string) => {
    tradingEngine.cancelOrder(orderId);
    loadData();
  };

  const currentPrice = tradingEngine.getCurrentPrice(selectedPair);
  const priceChange24h = tradingEngine.get24HourChange(selectedPair);
  const volume24h = tradingEngine.get24HourVolume(selectedPair);
  const high24h = tradingEngine.get24HourHigh(selectedPair);
  const low24h = tradingEngine.get24HourLow(selectedPair);

  const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  const totalRealizedPnL = trades
    .filter(t => t.timestamp > Date.now() - 24 * 60 * 60 * 1000)
    .reduce((sum, t) => sum + (t.pnl || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Advanced Trading Terminal</h1>
        <p className="text-gray-600">Professional trading interface with real-time charts and order management</p>
      </div>

      {/* Top Bar - Market Info */}
      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="text-2xl font-bold px-3 py-1 border rounded-lg"
            >
              {pairs.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
            
            <div>
              <div className="text-2xl font-bold">${currentPrice.toLocaleString()}</div>
              <div className={`text-sm ${priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}% (24h)
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <div>
                <div className="text-gray-600">24h High</div>
                <div className="font-semibold">${high24h.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-600">24h Low</div>
                <div className="font-semibold">${low24h.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-600">24h Volume</div>
                <div className="font-semibold">${volume24h.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-600">Total P&L</div>
            <div className={`text-xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USDT
            </div>
            <div className="text-xs text-gray-500">Realized 24h: {totalRealizedPnL.toFixed(2)} USDT</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* Left Side - Chart & Indicators */}
        <div className="col-span-9 space-y-4">
          {/* Chart */}
          <div style={{ height: '500px' }}>
            <Card className="p-4">
              <div className="flex justify-between mb-2">
                <h2 className="text-lg font-semibold">Price Chart</h2>
                <div className="flex gap-2">
                  <select
                    value={selectedIndicators.join(',')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        setSelectedIndicators(value.split(','));
                      }
                    }}
                    className="text-sm px-2 py-1 border rounded"
                    multiple
                  >
                    <option value="RSI">RSI</option>
                    <option value="MACD">MACD</option>
                    <option value="BB">Bollinger Bands</option>
                    <option value="MA">Moving Average</option>
                    <option value="EMA">EMA</option>
                  </select>
                </div>
              </div>
              <TradingChart pair={selectedPair} indicators={selectedIndicators} />
            </Card>
          </div>

          {/* Technical Analysis Summary */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">📊 Technical Analysis</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">RSI (14)</div>
                <div className="text-lg font-semibold">
                  {technicalAnalysis.calculateRSI(selectedPair, 14).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">
                  {technicalAnalysis.calculateRSI(selectedPair, 14) > 70 ? '🔴 Overbought' :
                   technicalAnalysis.calculateRSI(selectedPair, 14) < 30 ? '🟢 Oversold' : '⚪ Neutral'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">MACD</div>
                <div className="text-lg font-semibold">
                  {technicalAnalysis.calculateMACD(selectedPair).macd.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">
                  Signal: {technicalAnalysis.calculateMACD(selectedPair).signal.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">MA (50)</div>
                <div className="text-lg font-semibold">
                  ${technicalAnalysis.calculateMovingAverage(selectedPair, 50).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  {currentPrice > technicalAnalysis.calculateMovingAverage(selectedPair, 50) ? '🟢 Above MA' : '🔴 Below MA'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Bollinger Band</div>
                <div className="text-lg font-semibold">
                  ${technicalAnalysis.calculateBollingerBands(selectedPair).middle.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  Width: {technicalAnalysis.calculateBollingerBands(selectedPair).width.toFixed(2)}
                </div>
              </div>
            </div>
          </Card>

          {/* Order History */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">📜 Trade History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Time</th>
                    <th className="text-left">Pair</th>
                    <th className="text-left">Side</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 10).map((trade, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="py-2">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                      <td>{trade.pair}</td>
                      <td className={trade.side === 'buy' ? 'text-green-600' : 'text-red-600'}>
                        {trade.side.toUpperCase()}
                      </td>
                      <td className="text-right">${trade.price.toLocaleString()}</td>
                      <td className="text-right">{trade.amount.toFixed(4)}</td>
                      <td className="text-right">${(trade.price * trade.amount).toLocaleString()}</td>
                      <td className={`text-right ${(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Side - Order Entry & Order Book */}
        <div className="col-span-3 space-y-4">
          {/* Order Entry */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Place Order</h3>
            
            {/* Buy/Sell Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSide('buy')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  side === 'buy'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide('sell')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  side === 'sell'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Sell
              </button>
            </div>

            {/* Order Type */}
            <div className="mb-3">
              <label className="block text-sm font-medium mb-2">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop-loss">Stop Loss</option>
                <option value="take-profit">Take Profit</option>
              </select>
            </div>

            {/* Price (for non-market orders) */}
            {orderType !== 'market' && (
              <div className="mb-3">
                <label className="block text-sm font-medium mb-2">
                  {orderType === 'limit' ? 'Limit Price' :
                   orderType === 'stop-loss' ? 'Stop Price' : 'Take Profit Price'}
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            )}

            {/* Amount */}
            <div className="mb-3">
              <label className="block text-sm font-medium mb-2">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border rounded-lg"
              />
              <div className="text-xs text-gray-500 mt-1">Available: 1000.00 {selectedPair.split('/')[side === 'buy' ? 1 : 0]}</div>
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[25, 50, 75, 100].map(percent => (
                <button
                  key={percent}
                  onClick={() => setAmount((1000 * percent / 100).toString())}
                  className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                >
                  {percent}%
                </button>
              ))}
            </div>

            {/* Total */}
            {amount && (orderType === 'market' || price) && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-semibold">
                    {orderType === 'market' 
                      ? (parseFloat(amount) * currentPrice).toFixed(2)
                      : (parseFloat(amount) * parseFloat(price || '0')).toFixed(2)
                    } {selectedPair.split('/')[1]}
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={handlePlaceOrder}
              className={`w-full ${side === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {side === 'buy' ? '🟢 Buy' : '🔴 Sell'} {selectedPair.split('/')[0]}
            </Button>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full mt-2 text-sm text-blue-600 hover:underline"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="postOnly" />
                  <label htmlFor="postOnly">Post Only</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="reduceOnly" />
                  <label htmlFor="reduceOnly">Reduce Only</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="iceberg" />
                  <label htmlFor="iceberg">Iceberg Order</label>
                </div>
              </div>
            )}
          </Card>

          {/* Order Book */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Order Book</h3>
            <OrderBook pair={selectedPair} />
          </Card>

          {/* Open Orders */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Open Orders ({orders.length})</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {orders.length === 0 ? (
                <div className="text-center text-gray-500 py-4">No open orders</div>
              ) : (
                orders.map(order => (
                  <div key={order.id} className="p-2 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <div className={`text-sm font-semibold ${order.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                        {order.side.toUpperCase()} {order.pair}
                      </div>
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type:</span>
                        <span className="font-medium">{order.type}</span>
                      </div>
                      {order.price && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Price:</span>
                          <span>${order.price.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Amount:</span>
                        <span>{order.amount.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Filled:</span>
                        <span>{order.filled.toFixed(4)} ({((order.filled / order.amount) * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Open Positions */}
          {positions.length > 0 && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-3">Open Positions ({positions.length})</h3>
              <div className="space-y-2">
                {positions.map(position => (
                  <div key={position.pair} className="p-2 bg-gray-50 rounded-lg">
                    <div className={`text-sm font-semibold ${position.side === 'long' ? 'text-green-600' : 'text-red-600'}`}>
                      {position.side.toUpperCase()} {position.pair}
                    </div>
                    <div className="text-xs space-y-1 mt-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Entry:</span>
                        <span>${position.entryPrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Size:</span>
                        <span>{position.size.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Unrealized P&L:</span>
                        <span className={position.unrealizedPnL >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnL.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
