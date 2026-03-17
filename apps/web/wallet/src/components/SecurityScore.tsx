'use client';

import { Card } from '@/components/Card';
import { SecurityScore as SecurityScoreType } from '@/services/securityMonitor';

interface SecurityScoreProps {
  score: SecurityScoreType;
}

export function SecurityScore({ score }: SecurityScoreProps) {
  const getScoreColor = (value: number): string => {
    if (value >= 80) return 'text-green-600';
    if (value >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBarColor = (value: number): string => {
    if (value >= 80) return 'bg-green-500';
    if (value >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Security Score</h2>

      {/* Overall Score */}
      <div className="text-center mb-8">
        <div className={`text-6xl font-bold ${getScoreColor(score.overall)}`}>
          {score.overall}
        </div>
        <div className="text-gray-600 mt-2">Overall Security Score</div>
        
        <div className="mt-4 bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full ${getScoreBarColor(score.overall)} transition-all`}
            style={{ width: `${score.overall}%` }}
          />
        </div>
      </div>

      {/* Category Scores */}
      <div className="space-y-4 mb-6">
        <h3 className="font-semibold mb-3">Category Breakdown</h3>
        
        {Object.entries(score.categories).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className={`font-semibold ${getScoreColor(value)}`}>{value}</span>
            </div>
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getScoreBarColor(value)} transition-all`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {score.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold mb-2 text-blue-900">💡 Recommendations</h4>
          <ul className="space-y-2">
            {score.recommendations.map((rec, index) => (
              <li key={index} className="text-sm text-blue-800 flex items-start">
                <span className="mr-2">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
