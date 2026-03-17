'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ChartEntry {
  name: string;
  value: number;
  color: string;
}

interface Props {
  gainLossData: ChartEntry[];
  termData: ChartEntry[];
  totalGains: number;
  totalLosses: number;
  shortTermGains: number;
  longTermGains: number;
}

export default function TaxCharts({ gainLossData, termData, totalGains, totalLosses, shortTermGains, longTermGains }: Props) {
  const panelClassName =
    'rounded-2xl border p-6 shadow-[var(--kc-shadow)] backdrop-blur-xl';
  const panelStyle = {
    background: 'linear-gradient(180deg, rgba(19, 27, 49, 0.92) 0%, rgba(10, 16, 32, 0.88) 100%)',
    borderColor: 'var(--kc-glass-border)',
  } as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Gains vs Losses */}
      {totalGains + totalLosses > 0 && (
        <div className={panelClassName} style={panelStyle}>
          <h3 className="mb-4 text-xl font-semibold text-[var(--kc-text-bright)]">Gains vs Losses</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={gainLossData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: $${entry.value.toFixed(2)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {gainLossData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Short vs Long Term */}
      {(Math.abs(shortTermGains) + Math.abs(longTermGains) > 0) && (
        <div className={panelClassName} style={panelStyle}>
          <h3 className="mb-4 text-xl font-semibold text-[var(--kc-text-bright)]">Short-Term vs Long-Term</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={termData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: $${entry.value.toFixed(2)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {termData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-[var(--kc-muted-strong)]">
            <p>Short-Term: Held ≤ 1 year</p>
            <p>Long-Term: Held &gt; 1 year</p>
          </div>
        </div>
      )}
    </div>
  );
}
