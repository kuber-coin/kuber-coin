'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import portfolioAnalysis, { AssetAllocation, DiversificationScore, RebalanceSuggestion } from '@/services/portfolioAnalysis';
import walletService from '@/services/wallet';

export default function PortfolioToolsPage() {
  const [loading, setLoading] = useState(true);
  const [allocation, setAllocation] = useState<AssetAllocation[]>([]);
  const [diversificationScore, setDiversificationScore] = useState<DiversificationScore | null>(null);
  const [rebalanceSuggestions, setRebalanceSuggestions] = useState<RebalanceSuggestion[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<any>(null);
  const [correlationMatrix, setCorrelationMatrix] = useState<any>(null);
  const [selectedTool, setSelectedTool] = useState<'allocation' | 'diversification' | 'rebalance' | 'risk' | 'correlation' | 'whatif'>('allocation');
  
  const [targetAllocation, setTargetAllocation] = useState({
    KC: 60,
    BTC: 20,
    ETH: 15,
    OTHER: 5,
  });

  const [whatIfScenario, setWhatIfScenario] = useState({
    asset: 'KC',
    newPercentage: 50,
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  useEffect(() => {
    loadPortfolioData();
  }, []);

  const loadPortfolioData = async () => {
    setLoading(true);
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) {
        setLoading(false);
        return;
      }

      // Load all portfolio analysis data
      const allocData = portfolioAnalysis.getAssetAllocation();
      const divScore = portfolioAnalysis.getDiversificationScore();
      const rebalance = portfolioAnalysis.getRebalanceSuggestions(targetAllocation);
      const risk = portfolioAnalysis.calculateRiskMetrics();
      const corr = portfolioAnalysis.getCorrelationMatrix();

      setAllocation(allocData);
      setDiversificationScore(divScore);
      setRebalanceSuggestions(rebalance);
      setRiskMetrics(risk);
      setCorrelationMatrix(corr);
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRebalance = () => {
    if (confirm('Are you sure you want to rebalance your portfolio? This will create multiple transactions.')) {
      try {
        const txs = portfolioAnalysis.executeRebalance(targetAllocation);
        alert(`Created ${txs.length} rebalancing transactions!`);
        loadPortfolioData();
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const calculateWhatIf = () => {
    const newAllocation = allocation.map(asset => ({
      ...asset,
      percentage: asset.asset === whatIfScenario.asset ? whatIfScenario.newPercentage : asset.percentage,
    }));

    // Recalculate total and normalize
    const total = newAllocation.reduce((sum, asset) => sum + asset.percentage, 0);
    return newAllocation.map(asset => ({
      ...asset,
      percentage: (asset.percentage / total) * 100,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading portfolio analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Portfolio Tools</h1>
        <div className="flex gap-2">
          <Button onClick={loadPortfolioData} variant="secondary">
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* Tool Selection */}
      <Card>
        <CardBody>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedTool('allocation')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'allocation'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              📊 Asset Allocation
            </button>
            <button
              onClick={() => setSelectedTool('diversification')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'diversification'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              🎯 Diversification
            </button>
            <button
              onClick={() => setSelectedTool('rebalance')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'rebalance'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              ⚖️ Rebalance
            </button>
            <button
              onClick={() => setSelectedTool('risk')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'risk'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              ⚠️ Risk Assessment
            </button>
            <button
              onClick={() => setSelectedTool('correlation')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'correlation'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              🔗 Correlation Matrix
            </button>
            <button
              onClick={() => setSelectedTool('whatif')}
              className={`px-4 py-2 rounded-lg ${
                selectedTool === 'whatif'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              🔮 What-If Analysis
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Asset Allocation */}
      {selectedTool === 'allocation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardBody>
              <h2 className="text-xl font-bold mb-4">Asset Allocation</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="percentage"
                    nameKey="asset"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(props: any) => `${props.asset}: ${props.percentage.toFixed(1)}%`}
                  >
                    {allocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-xl font-bold mb-4">Holdings Detail</h2>
              <div className="space-y-3">
                {allocation.map((asset, index) => (
                  <div key={asset.asset} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div>
                        <div className="font-semibold">{asset.asset}</div>
                        <div className="text-sm text-gray-600">{asset.percentage.toFixed(2)}%</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{asset.amount.toFixed(4)}</div>
                      <div className="text-sm text-gray-600">${asset.value.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Diversification Score */}
      {selectedTool === 'diversification' && diversificationScore && (
        <Card>
          <CardBody>
            <h2 className="text-xl font-bold mb-4">Diversification Analysis</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Overall Score</div>
                <div className="text-3xl font-bold text-blue-600">
                  {diversificationScore.score}/100
                </div>
                <div className="text-sm text-gray-600 mt-1">{diversificationScore.rating}</div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Number of Assets</div>
                <div className="text-3xl font-bold text-green-600">
                  {diversificationScore.numAssets}
                </div>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Concentration Risk</div>
                <div className="text-3xl font-bold text-orange-600">
                  {(diversificationScore.concentrationRisk * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Recommendations:</h3>
              {diversificationScore.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                  <span className="text-yellow-600">💡</span>
                  <p className="text-sm text-gray-700">{rec}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Rebalance Suggestions */}
      {selectedTool === 'rebalance' && (
        <div className="space-y-6">
          <Card>
            <CardBody>
              <h2 className="text-xl font-bold mb-4">Target Allocation</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(targetAllocation).map(([asset, percentage]) => (
                  <div key={asset}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {asset}
                    </label>
                    <input
                      type="number"
                      value={percentage}
                      onChange={(e) => setTargetAllocation({
                        ...targetAllocation,
                        [asset]: parseFloat(e.target.value) || 0,
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                      min="0"
                      max="100"
                      step="1"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Total: {Object.values(targetAllocation).reduce((sum, val) => sum + val, 0)}%
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => loadPortfolioData()} variant="secondary">
                    Recalculate
                  </Button>
                  <Button onClick={handleRebalance}>
                    Execute Rebalance
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          {rebalanceSuggestions.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="text-xl font-bold mb-4">Rebalancing Actions</h2>
                <div className="space-y-3">
                  {rebalanceSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        suggestion.action === 'buy'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">
                            {suggestion.action === 'buy' ? '📈 Buy' : '📉 Sell'} {suggestion.asset}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Current: {suggestion.currentPercentage.toFixed(2)}% → Target: {suggestion.targetPercentage.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">
                            {suggestion.amount.toFixed(4)} {suggestion.asset}
                          </div>
                          <div className="text-sm text-gray-600">
                            ${suggestion.valueUSD.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Risk Assessment */}
      {selectedTool === 'risk' && riskMetrics && (
        <Card>
          <CardBody>
            <h2 className="text-xl font-bold mb-4">Risk Assessment</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Volatility (30d)</div>
                <div className="text-2xl font-bold text-blue-600">
                  {(riskMetrics.volatility * 100).toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
                <div className="text-2xl font-bold text-green-600">
                  {riskMetrics.sharpeRatio.toFixed(2)}
                </div>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                <div className="text-2xl font-bold text-orange-600">
                  {(riskMetrics.maxDrawdown * 100).toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Beta</div>
                <div className="text-2xl font-bold text-purple-600">
                  {riskMetrics.beta.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Risk Level: {riskMetrics.riskLevel}</h3>
                <p className="text-sm text-gray-600">{riskMetrics.riskDescription}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Value at Risk (VaR 95%):</h3>
                <p className="text-sm text-gray-600">
                  There is a 95% confidence that your portfolio will not lose more than ${riskMetrics.valueAtRisk.toFixed(2)} in the next day.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Recommendations:</h3>
                <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                  {riskMetrics.recommendations.map((rec: string, index: number) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Correlation Matrix */}
      {selectedTool === 'correlation' && correlationMatrix && (
        <Card>
          <CardBody>
            <h2 className="text-xl font-bold mb-4">Asset Correlation Matrix</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="p-2 text-left">Asset</th>
                    {correlationMatrix.assets.map((asset: string) => (
                      <th key={asset} className="p-2 text-center">{asset}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correlationMatrix.assets.map((asset1: string, i: number) => (
                    <tr key={asset1}>
                      <td className="p-2 font-semibold">{asset1}</td>
                      {correlationMatrix.assets.map((asset2: string, j: number) => {
                        const corr = correlationMatrix.matrix[i][j];
                        const bgColor = corr > 0.7
                          ? 'bg-green-100'
                          : corr > 0.3
                          ? 'bg-yellow-100'
                          : corr < -0.3
                          ? 'bg-red-100'
                          : 'bg-gray-50';
                        
                        return (
                          <td key={asset2} className={`p-2 text-center ${bgColor}`}>
                            {corr.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>• Green: Strong positive correlation (&gt; 0.7)</p>
              <p>• Yellow: Moderate correlation (0.3 - 0.7)</p>
              <p>• Gray: Weak correlation (-0.3 - 0.3)</p>
              <p>• Red: Negative correlation (&lt; -0.3)</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* What-If Analysis */}
      {selectedTool === 'whatif' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardBody>
              <h2 className="text-xl font-bold mb-4">What-If Scenario</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Asset
                  </label>
                  <select
                    value={whatIfScenario.asset}
                    onChange={(e) => setWhatIfScenario({ ...whatIfScenario, asset: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {allocation.map(asset => (
                      <option key={asset.asset} value={asset.asset}>
                        {asset.asset}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Allocation (%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={whatIfScenario.newPercentage}
                    onChange={(e) => setWhatIfScenario({ ...whatIfScenario, newPercentage: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="text-center font-semibold text-lg mt-2">
                    {whatIfScenario.newPercentage}%
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Current Allocation:</h3>
                  <div className="text-sm space-y-1">
                    {allocation.map(asset => (
                      <div key={asset.asset} className="flex justify-between">
                        <span>{asset.asset}:</span>
                        <span className="font-semibold">{asset.percentage.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-xl font-bold mb-4">Projected Allocation</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={calculateWhatIf()}
                    dataKey="percentage"
                    nameKey="asset"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(props: any) => `${props.asset}: ${props.percentage.toFixed(1)}%`}
                  >
                    {allocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Impact:</h3>
                <div className="text-sm space-y-1">
                  {calculateWhatIf().map(asset => {
                    const current = allocation.find(a => a.asset === asset.asset);
                    if (!current) return null;
                    const change = asset.percentage - current.percentage;
                    return (
                      <div key={asset.asset} className="flex justify-between">
                        <span>{asset.asset}:</span>
                        <span className={change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : ''}>
                          {change > 0 ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
