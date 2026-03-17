'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import defiService, { LiquidityPool, YieldFarm } from '@/services/defiService';
import SwapInterface from '@/components/SwapInterface';

export default function DeFiPage() {
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<LiquidityPool[]>([]);
  const [farms, setFarms] = useState<YieldFarm[]>([]);
  const [selectedView, setSelectedView] = useState<'pools' | 'farms' | 'swap' | 'bridge'>('pools');
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showAddLiquidityModal, setShowAddLiquidityModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<LiquidityPool | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const poolsData = defiService.getLiquidityPools();
      const farmsData = defiService.getYieldFarms();
      setPools(poolsData);
      setFarms(farmsData);
    } catch (error) {
      console.error('Failed to load DeFi data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLiquidity = (pool: LiquidityPool) => {
    setSelectedPool(pool);
    setShowAddLiquidityModal(true);
  };

  const handleStake = (farm: YieldFarm) => {
    const amount = prompt(`Enter amount of ${farm.stakingToken} to stake:`);
    if (!amount) return;

    try {
      defiService.stakeInFarm(farm.id, parseFloat(amount));
      alert('Staked successfully!');
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const calculateIL = (pool: LiquidityPool) => {
    // Impermanent Loss calculation
    const priceRatio = pool.token1Price / pool.token0Price;
    const il = defiService.calculateImpermanentLoss(1, priceRatio);
    return il;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading DeFi data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">DeFi Dashboard</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowSwapModal(true)}>
            🔄 Swap Tokens
          </Button>
          <Button onClick={loadData} variant="secondary">
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Total Value Locked</div>
            <div className="text-2xl font-bold">
              ${pools.reduce((sum, p) => sum + p.tvl, 0).toLocaleString()}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Your Liquidity</div>
            <div className="text-2xl font-bold">
              ${pools.reduce((sum, p) => sum + (p.userLiquidity || 0), 0).toLocaleString()}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Avg APY</div>
            <div className="text-2xl font-bold text-green-600">
              {(pools.reduce((sum, p) => sum + p.apy, 0) / pools.length).toFixed(2)}%
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Active Farms</div>
            <div className="text-2xl font-bold">{farms.filter(f => f.userStaked > 0).length}</div>
          </CardBody>
        </Card>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedView('pools')}
          className={`px-4 py-2 rounded-lg ${
            selectedView === 'pools'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          💧 Liquidity Pools
        </button>
        <button
          onClick={() => setSelectedView('farms')}
          className={`px-4 py-2 rounded-lg ${
            selectedView === 'farms'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🌾 Yield Farms
        </button>
        <button
          onClick={() => setSelectedView('swap')}
          className={`px-4 py-2 rounded-lg ${
            selectedView === 'swap'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🔄 Swap
        </button>
        <button
          onClick={() => setSelectedView('bridge')}
          className={`px-4 py-2 rounded-lg ${
            selectedView === 'bridge'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🌉 Bridge
        </button>
      </div>

      {/* Liquidity Pools */}
      {selectedView === 'pools' && (
        <div className="space-y-4">
          {pools.map(pool => (
            <Card key={pool.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{pool.token0Symbol}/{pool.token1Symbol}</div>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                        APY: {pool.apy.toFixed(2)}%
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        Fee: {pool.fee}%
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleAddLiquidity(pool)} size="sm">
                      ➕ Add Liquidity
                    </Button>
                    {(pool.userLiquidity ?? 0) > 0 && (
                      <Button onClick={() => {}} size="sm" variant="secondary">
                        ➖ Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-gray-500">TVL</div>
                    <div className="font-semibold">${pool.tvl.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Volume 24h</div>
                    <div className="font-semibold">${pool.volume24h.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Your Liquidity</div>
                    <div className="font-semibold">${(pool.userLiquidity || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Impermanent Loss</div>
                    <div className={`font-semibold ${calculateIL(pool) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {calculateIL(pool).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {(pool.userLiquidity ?? 0) > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-semibold mb-2">Your Position</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Pooled {pool.token0Symbol}: {pool.userToken0Amount?.toFixed(4)}</div>
                      <div>Pooled {pool.token1Symbol}: {pool.userToken1Amount?.toFixed(4)}</div>
                      <div>Pool Share: {pool.userPoolShare?.toFixed(4)}%</div>
                      <div>Fees Earned: ${pool.userFeesEarned?.toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Yield Farms */}
      {selectedView === 'farms' && (
        <div className="space-y-4">
          {farms.map(farm => (
            <Card key={farm.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">🌾 {farm.name}</div>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                        APR: {farm.apr.toFixed(2)}%
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                        Rewards: {farm.rewardToken}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleStake(farm)} size="sm">
                      🌱 Stake
                    </Button>
                    {farm.userStaked > 0 && (
                      <Button onClick={() => {}} size="sm" variant="secondary">
                        📤 Unstake
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-gray-500">Total Staked</div>
                    <div className="font-semibold">{farm.totalStaked.toFixed(2)} {farm.stakingToken}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Your Stake</div>
                    <div className="font-semibold">{farm.userStaked.toFixed(2)} {farm.stakingToken}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Pending Rewards</div>
                    <div className="font-semibold text-green-600">{farm.pendingRewards.toFixed(4)} {farm.rewardToken}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Rewards/Day</div>
                    <div className="font-semibold">{farm.rewardsPerDay.toFixed(4)} {farm.rewardToken}</div>
                  </div>
                </div>

                {farm.userStaked > 0 && (
                  <div className="mt-4">
                    <Button size="sm" variant="secondary">
                      🎁 Claim Rewards ({farm.pendingRewards.toFixed(4)} {farm.rewardToken})
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Swap Interface */}
      {selectedView === 'swap' && (
        <Card>
          <CardBody>
            <SwapInterface />
          </CardBody>
        </Card>
      )}

      {/* Bridge Interface */}
      {selectedView === 'bridge' && (
        <Card>
          <CardBody>
            <h2 className="text-xl font-semibold mb-4">Cross-Chain Bridge</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">From Chain</label>
                <select className="w-full px-3 py-2 border rounded-lg">
                  <option>Kubercoin</option>
                  <option>Ethereum</option>
                  <option>Binance Smart Chain</option>
                  <option>Polygon</option>
                </select>
              </div>

              <div className="text-center">
                <div className="text-3xl">⬇️</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">To Chain</label>
                <select className="w-full px-3 py-2 border rounded-lg">
                  <option>Ethereum</option>
                  <option>Binance Smart Chain</option>
                  <option>Polygon</option>
                  <option>Kubercoin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Amount</label>
                <input
                  type="number"
                  placeholder="0.0000"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                <strong>⚠️ Bridge Fee:</strong> 0.1% + Gas (~$5-20)
                <br />
                <strong>Estimated Time:</strong> 5-15 minutes
              </div>

              <Button className="w-full">
                🌉 Bridge Tokens
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Swap Modal */}
      {showSwapModal && (
        <Modal
          isOpen={showSwapModal}
          onCloseAction={() => setShowSwapModal(false)}
          title="Swap Tokens"
          size="lg"
        >
          <SwapInterface />
        </Modal>
      )}

      {/* Add Liquidity Modal */}
      {showAddLiquidityModal && selectedPool && (
        <Modal
          isOpen={showAddLiquidityModal}
          onCloseAction={() => setShowAddLiquidityModal(false)}
          title={`Add Liquidity: ${selectedPool.token0Symbol}/${selectedPool.token1Symbol}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{selectedPool.token0Symbol}</label>
              <input
                type="number"
                placeholder="0.0000"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div className="text-center text-2xl">➕</div>

            <div>
              <label className="block text-sm font-medium mb-2">{selectedPool.token1Symbol}</label>
              <input
                type="number"
                placeholder="0.0000"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <div className="flex justify-between mb-1">
                <span>Pool Share:</span>
                <span className="font-semibold">0.01%</span>
              </div>
              <div className="flex justify-between">
                <span>Current Ratio:</span>
                <span className="font-semibold">
                  1 {selectedPool.token0Symbol} = {(selectedPool.token1Price / selectedPool.token0Price).toFixed(4)} {selectedPool.token1Symbol}
                </span>
              </div>
            </div>

            <Button className="w-full">
              Add Liquidity
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
