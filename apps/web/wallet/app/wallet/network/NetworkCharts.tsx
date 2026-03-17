'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChartData {
  time: string;
  value: number;
}

interface Props {
  hashrateHistory: ChartData[];
  difficultyHistory: ChartData[];
  blockTimeData: ChartData[];
}

function getNumericValue(
  value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined,
): number {
  const normalized = Array.isArray(value) ? value[0] : value;
  const numeric = typeof normalized === 'number' ? normalized : Number(normalized ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function NetworkCharts({ hashrateHistory, difficultyHistory, blockTimeData }: Props) {
  return (
    <>
      {/* Hashrate Chart */}
      <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 mb-6">
        <h2 className="text-xl font-semibold mb-4">Network Hashrate (24h)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={hashrateHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" />
            <YAxis stroke="#888" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #8B5CF6' }}
                          formatter={(value) => [`${getNumericValue(value).toFixed(2)} TH/s`, 'Hashrate']}
                        />
            <Line type="monotone" dataKey="value" stroke="#8B5CF6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Difficulty Chart */}
      <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20 mb-6">
        <h2 className="text-xl font-semibold mb-4">Difficulty History (24h)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={difficultyHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" />
            <YAxis stroke="#888" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #3B82F6' }}
                          formatter={(value) => [getNumericValue(value).toFixed(2), 'Difficulty']}
                        />
            <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Block Time Distribution */}
      <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
        <h2 className="text-xl font-semibold mb-4">Block Time Distribution (Last 20 Blocks)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={blockTimeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" />
            <YAxis stroke="#888" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #10B981' }}
                          formatter={(value) => {
                            const numeric = getNumericValue(value);
                            return [`${Math.floor(numeric / 60)}m ${Math.floor(numeric % 60)}s`, 'Block Time'];
                          }}
                        />
            <Bar dataKey="value" fill="#10B981" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/50 rounded-lg">
          <p className="text-sm text-green-300">
            <strong className="text-green-400">Target:</strong> 600 seconds (10 minutes) per block
          </p>
          <p className="text-xs text-green-400 mt-1">
            Difficulty adjusts every 2016 blocks to maintain target
          </p>
        </div>
      </div>
    </>
  );
}
