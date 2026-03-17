'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface BalancePoint {
  date: string;
  balance: number;
  timestamp: number;
}

interface TransactionVolume {
  date: string;
  incoming: number;
  outgoing: number;
  net: number;
}

interface SpendingCategory {
  name: string;
  value: number;
  count: number;
}

interface BiggestTransaction {
  txid: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  timestamp: number;
  address: string;
}

interface Props {
  balanceHistory: BalancePoint[];
  volumeData: TransactionVolume[];
  spendingData: SpendingCategory[];
  biggestTransactions: BiggestTransaction[];
}

const COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#6366F1'];

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatTooltipAmount(
  value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined,
): string {
  const normalized = Array.isArray(value) ? value[0] : value;
  const numeric = typeof normalized === 'number' ? normalized : Number(normalized ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return `${safeValue.toFixed(8)} KBC`;
}

export default function AnalyticsCharts({ balanceHistory, volumeData, spendingData, biggestTransactions }: Props) {
  return (
    <>
      {/* Balance History Chart */}
      <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
        <h2 className="text-xl font-semibold mb-4">Balance History</h2>
        {balanceHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={balanceHistory}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #8B5CF6' }}
                formatter={(value) => [formatTooltipAmount(value), 'Balance']}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#8B5CF6"
                strokeWidth={2}
                fill="url(#colorBalance)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-gray-400 py-8">No balance history available</p>
        )}
      </div>

      {/* Transaction Volume Chart */}
      <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
        <h2 className="text-xl font-semibold mb-4">Transaction Volume</h2>
        {volumeData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #8B5CF6' }}
                formatter={(value) => formatTooltipAmount(value)}
              />
              <Legend />
              <Bar dataKey="incoming" fill="#10B981" name="Incoming" />
              <Bar dataKey="outgoing" fill="#EF4444" name="Outgoing" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-gray-400 py-8">No transaction volume data available</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending Analysis */}
        <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
          <h2 className="text-xl font-semibold mb-4">Top Recipients</h2>
          {spendingData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={spendingData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {spendingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid #8B5CF6' }}
                    formatter={(value) => formatTooltipAmount(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full mt-4 space-y-2">
                {spendingData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-gray-300">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-medium">{item.value.toFixed(8)} KBC</div>
                      <div className="text-gray-500 text-xs">{item.count} txs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">No spending data available</p>
          )}
        </div>

        {/* Biggest Transactions */}
        <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
          <h2 className="text-xl font-semibold mb-4">Biggest Transactions</h2>
          {biggestTransactions.length > 0 ? (
            <div className="space-y-3">
              {biggestTransactions.map((tx, index) => (
                <div key={tx.txid} className="p-3 bg-[#0F0F23] rounded-lg border border-purple-500/10">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {tx.type === 'incoming' ? '↓' : '↑'}
                      </span>
                      <div>
                        <div className={`font-semibold ${tx.type === 'incoming' ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.type === 'incoming' ? '+' : '-'}{tx.amount.toFixed(8)} KBC
                        </div>
                        <div className="text-xs text-gray-500">{formatTimestamp(tx.timestamp)}</div>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-gray-600">#{index + 1}</div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    {tx.address.substring(0, 20)}...
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">No transactions yet</p>
          )}
        </div>
      </div>
    </>
  );
}
