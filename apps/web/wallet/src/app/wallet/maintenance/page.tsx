'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import walletHealth, { HealthScore, OptimizationSuggestion } from '@/services/walletHealth';
import optimizer from '@/services/optimizer';

export default function MaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [showConsolidationWizard, setShowConsolidationWizard] = useState(false);
  const [consolidationStep, setConsolidationStep] = useState(1);
  const [consolidationData, setConsolidationData] = useState<any>(null);

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = async () => {
    setLoading(true);
    try {
      const score = await walletHealth.calculateHealthScore();
      const opts = await walletHealth.getOptimizationSuggestions();
      setHealthScore(score);
      setSuggestions(opts);
    } catch (error) {
      console.error('Failed to load health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConsolidateDust = async () => {
    setShowConsolidationWizard(true);
    setConsolidationStep(1);
    try {
      const data = await optimizer.analyzeDustConsolidation();
      setConsolidationData(data);
    } catch (error: any) {
      alert(error.message || 'Failed to analyze dust consolidation');
    }
  };

  const handleExecuteConsolidation = async () => {
    try {
      const txid = await optimizer.consolidateDust();
      alert(`Dust consolidation transaction created: ${txid}`);
      setShowConsolidationWizard(false);
      loadHealthData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleOptimizeUTXOs = async () => {
    if (confirm('This will consolidate your UTXOs. Continue?')) {
      try {
        const txid = await optimizer.optimizeUTXOs();
        alert(`UTXO optimization transaction created: ${txid}`);
        loadHealthData();
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const handleResolveStuckTransaction = async (txId: string) => {
    const method = prompt('Choose method: CPFP or RBF?');
    if (!method) return;

    try {
      if (method.toUpperCase() === 'CPFP') {
        const txid = await optimizer.resolveStuckTransactionCPFP(txId);
        alert(`CPFP transaction created: ${txid}`);
      } else if (method.toUpperCase() === 'RBF') {
        const txid = await optimizer.resolveStuckTransactionRBF(txId);
        alert(`Transaction replaced: ${txid}`);
      } else {
        alert('Invalid method');
      }
      loadHealthData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBackground = (score: number): string => {
    if (score >= 80) return 'bg-green-50';
    if (score >= 60) return 'bg-yellow-50';
    if (score >= 40) return 'bg-orange-50';
    return 'bg-red-50';
  };

  const getRatingColor = (rating: string): string => {
    if (rating === 'Excellent') return 'text-green-600';
    if (rating === 'Good') return 'text-yellow-600';
    if (rating === 'Fair') return 'text-orange-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing wallet health...</p>
        </div>
      </div>
    );
  }

  if (!healthScore) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load wallet health data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Wallet Health & Maintenance</h1>
        <Button onClick={loadHealthData} variant="secondary">
          🔄 Refresh
        </Button>
      </div>

      {/* Health Score Card */}
      <Card>
        <CardBody>
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">Overall Health Score</h2>
            <div className={`text-6xl font-bold mb-2 ${getScoreColor(healthScore.score)}`}>
              {healthScore.score}/100
            </div>
            <div className={`text-2xl font-semibold mb-4 ${getRatingColor(healthScore.rating)}`}>
              {healthScore.rating}
            </div>
            <p className="text-gray-600 mb-6">{healthScore.summary}</p>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 mb-6">
              <div
                className={`h-4 rounded-full ${
                  healthScore.score >= 80 ? 'bg-green-500' :
                  healthScore.score >= 60 ? 'bg-yellow-500' :
                  healthScore.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${healthScore.score}%` }}
              ></div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardBody className={getScoreBackground(healthScore.metrics.utxoScore)}>
            <div className="text-sm text-gray-600 mb-1">UTXO Health</div>
            <div className={`text-3xl font-bold ${getScoreColor(healthScore.metrics.utxoScore)}`}>
              {healthScore.metrics.utxoScore}/100
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {healthScore.metrics.utxoCount} UTXOs
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className={getScoreBackground(healthScore.metrics.feeEfficiencyScore)}>
            <div className="text-sm text-gray-600 mb-1">Fee Efficiency</div>
            <div className={`text-3xl font-bold ${getScoreColor(healthScore.metrics.feeEfficiencyScore)}`}>
              {healthScore.metrics.feeEfficiencyScore}/100
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {healthScore.metrics.averageFee.toFixed(6)} KC avg
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className={getScoreBackground(healthScore.metrics.privacyScore)}>
            <div className="text-sm text-gray-600 mb-1">Privacy Score</div>
            <div className={`text-3xl font-bold ${getScoreColor(healthScore.metrics.privacyScore)}`}>
              {healthScore.metrics.privacyScore}/100
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {healthScore.metrics.addressReuse} reused
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className={getScoreBackground(healthScore.metrics.dustScore)}>
            <div className="text-sm text-gray-600 mb-1">Dust Level</div>
            <div className={`text-3xl font-bold ${getScoreColor(healthScore.metrics.dustScore)}`}>
              {healthScore.metrics.dustScore}/100
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {healthScore.metrics.dustAmount.toFixed(6)} KC
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Optimization Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-xl font-semibold mb-4">Optimization Suggestions</h3>
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    suggestion.priority === 'high' ? 'border-red-300 bg-red-50' :
                    suggestion.priority === 'medium' ? 'border-yellow-300 bg-yellow-50' :
                    'border-blue-300 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{suggestion.icon}</span>
                        <h4 className="font-semibold">{suggestion.title}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          suggestion.priority === 'high' ? 'bg-red-200 text-red-800' :
                          suggestion.priority === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-blue-200 text-blue-800'
                        }`}>
                          {suggestion.priority.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{suggestion.description}</p>
                      {suggestion.impact && (
                        <p className="text-sm text-gray-600">
                          <strong>Impact:</strong> {suggestion.impact}
                        </p>
                      )}
                      {suggestion.estimatedSavings !== undefined && (
                        <p className="text-sm text-green-600">
                          <strong>Estimated Savings:</strong> {suggestion.estimatedSavings.toFixed(6)} KC
                        </p>
                      )}
                    </div>
                    {suggestion.action && (
                      <Button onClick={suggestion.action} size="sm">
                        Fix Now
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardBody>
          <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={handleConsolidateDust}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">🧹</div>
              <div className="font-semibold mb-1">Consolidate Dust</div>
              <div className="text-sm text-gray-600">Merge small UTXOs to reduce fees</div>
            </button>

            <button
              onClick={handleOptimizeUTXOs}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">⚡</div>
              <div className="font-semibold mb-1">Optimize UTXOs</div>
              <div className="text-sm text-gray-600">Consolidate all UTXOs for efficiency</div>
            </button>

            <button
              onClick={() => {
                const txId = prompt('Enter stuck transaction ID:');
                if (txId) handleResolveStuckTransaction(txId);
              }}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">🔧</div>
              <div className="font-semibold mb-1">Resolve Stuck TX</div>
              <div className="text-sm text-gray-600">Fix transactions with low fees</div>
            </button>

            <button
              onClick={async () => {
                const result = await walletHealth.checkAddressReuse();
                alert(`Address reuse check: ${result.count} addresses reused`);
              }}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">🔍</div>
              <div className="font-semibold mb-1">Privacy Check</div>
              <div className="text-sm text-gray-600">Analyze address reuse patterns</div>
            </button>

            <button
              onClick={async () => {
                const report = await walletHealth.generateAnalyticsReport();
                alert(JSON.stringify(report, null, 2));
              }}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">📊</div>
              <div className="font-semibold mb-1">Analytics Report</div>
              <div className="text-sm text-gray-600">View detailed wallet analytics</div>
            </button>

            <button
              onClick={() => {
                const tips = optimizer.getFeeOptimizationTips();
                alert(tips.join('\n\n'));
              }}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-3xl mb-2">💡</div>
              <div className="font-semibold mb-1">Fee Tips</div>
              <div className="text-sm text-gray-600">Learn how to reduce transaction fees</div>
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Wallet Analytics */}
      <Card>
        <CardBody>
          <h3 className="text-xl font-semibold mb-4">Wallet Analytics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Wallet Age</div>
              <div className="text-2xl font-bold">{healthScore.metrics.walletAge} days</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Transactions</div>
              <div className="text-2xl font-bold">{healthScore.metrics.transactionCount}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Fees Paid</div>
              <div className="text-2xl font-bold">{healthScore.metrics.totalFeesPaid.toFixed(4)} KC</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Wallet Size</div>
              <div className="text-2xl font-bold">{(healthScore.metrics.walletSize / 1024).toFixed(2)} KB</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Consolidation Wizard Modal */}
      {showConsolidationWizard && consolidationData && (
        <Modal
          isOpen={showConsolidationWizard}
          onCloseAction={() => setShowConsolidationWizard(false)}
          title="Dust Consolidation Wizard"
        >
          <div className="space-y-4">
            {consolidationStep === 1 && (
              <>
                <div>
                  <h3 className="font-semibold mb-2">Step 1: Review Dust UTXOs</h3>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span>Dust UTXOs Found:</span>
                      <span className="font-semibold">{consolidationData.dustUtxoCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Dust Amount:</span>
                      <span className="font-semibold">{consolidationData.totalDustAmount.toFixed(6)} KC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Fee:</span>
                      <span className="font-semibold">{consolidationData.estimatedFee.toFixed(6)} KC</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span>Net Recovery:</span>
                      <span className="font-semibold text-green-600">
                        {(consolidationData.totalDustAmount - consolidationData.estimatedFee).toFixed(6)} KC
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Consolidating dust will merge {consolidationData.dustUtxoCount} small UTXOs into one,
                    reducing future transaction fees. This is recommended when fees are low.
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button onClick={() => setShowConsolidationWizard(false)} variant="secondary">
                    Cancel
                  </Button>
                  <Button onClick={() => setConsolidationStep(2)}>
                    Next
                  </Button>
                </div>
              </>
            )}

            {consolidationStep === 2 && (
              <>
                <div>
                  <h3 className="font-semibold mb-2">Step 2: Confirm Consolidation</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Review the details below and click "Execute" to consolidate your dust UTXOs.
                  </p>

                  <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Warning:</strong> This transaction cannot be undone. Make sure you have enough balance to cover the fee.
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>UTXOs to consolidate:</span>
                      <span className="font-semibold">{consolidationData.dustUtxoCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total amount:</span>
                      <span className="font-semibold">{consolidationData.totalDustAmount.toFixed(6)} KC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Network fee:</span>
                      <span className="font-semibold">{consolidationData.estimatedFee.toFixed(6)} KC</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Final amount:</span>
                      <span>{(consolidationData.totalDustAmount - consolidationData.estimatedFee).toFixed(6)} KC</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button onClick={() => setConsolidationStep(1)} variant="secondary">
                    Back
                  </Button>
                  <Button onClick={handleExecuteConsolidation}>
                    Execute Consolidation
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
