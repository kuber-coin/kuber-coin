'use client';

import { Card } from '@/components/Card';
import { PortfolioOptimization, Anomaly, PricePrediction } from '@/services/mlEngine';

interface AIInsightsProps {
  portfolio?: PortfolioOptimization;
  anomalies?: Anomaly[];
  prediction?: PricePrediction;
  onRefreshAction?: () => void;
}

export function AIInsights({ portfolio, anomalies = [], prediction, onRefreshAction }: AIInsightsProps) {
  const getTrendIcon = (trend: string) => {
    if (trend === 'bullish') return '📈';
    if (trend === 'bearish') return '📉';
    return '➡️';
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'bullish') return 'text-green-600';
    if (trend === 'bearish') return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI Insights</h2>
        {onRefreshAction && (
          <button
            onClick={onRefreshAction}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            🔄 Refresh
          </button>
        )}
      </div>

      {/* Portfolio Optimization */}
      {portfolio && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Portfolio Optimization</h3>
            <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full">
              Sharpe: {portfolio.sharpeRatio.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Expected Return</div>
              <div className="text-2xl font-bold text-blue-600">{portfolio.expectedReturn}%</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Risk (Volatility)</div>
              <div className="text-2xl font-bold text-orange-600">{portfolio.risk}%</div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Recommended Allocation</h4>
            {Object.entries(portfolio.recommendedAllocation).map(([asset, percentage]) => (
              <div key={asset}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{asset}</span>
                  <span className="font-semibold">{percentage}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Price Prediction */}
      {prediction && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Price Forecast</h3>
            <span className={`text-2xl ${getTrendColor(prediction.trend)}`}>
              {getTrendIcon(prediction.trend)} {prediction.trend}
            </span>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Current Price</div>
            <div className="text-3xl font-bold">${prediction.current.toFixed(2)}</div>
          </div>

          <div className="space-y-2">
            {prediction.predictions.map((pred, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{pred.time}</span>
                <span className="font-mono font-semibold">${pred.price.toFixed(2)}</span>
                <span className="text-xs text-gray-500">
                  {(pred.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              ⚠️ Predictions are based on historical data and ML models. Not financial advice.
            </p>
          </div>
        </Card>
      )}

      {/* Anomaly Detection */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Anomaly Detection</h3>

        {anomalies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">✅</div>
            <p>No anomalies detected</p>
            <p className="text-sm mt-1">Your activity looks normal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`border rounded-lg p-4 ${
                  anomaly.severity === 'high'
                    ? 'border-red-300 bg-red-50'
                    : anomaly.severity === 'medium'
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-blue-300 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold">
                    {anomaly.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded ${
                    anomaly.severity === 'high'
                      ? 'bg-red-200 text-red-800'
                      : anomaly.severity === 'medium'
                      ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-blue-200 text-blue-800'
                  }`}>
                    {anomaly.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm">{anomaly.description}</p>
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(anomaly.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
