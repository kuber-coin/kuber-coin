'use client';

import React from 'react';

type Primitive = string | number;
type SeriesDatum = object;

interface LineAreaChartProps<T extends SeriesDatum> {
  data: T[];
  xKey: keyof T;
  yKey: keyof T;
  height?: number;
  stroke: string;
  fill?: string;
  valueFormatter?: (value: number) => string;
}

interface MultiBarChartProps<T extends SeriesDatum> {
  data: T[];
  xKey: keyof T;
  bars: Array<{
    key: keyof T;
    label: string;
    color: string;
  }>;
  height?: number;
  valueFormatter?: (value: number) => string;
}

interface DonutChartProps<T extends SeriesDatum> {
  data: T[];
  valueKey: keyof T;
  labelKey: keyof T;
  colorKey?: keyof T;
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  valueFormatter?: (value: number) => string;
}

const CHART_WIDTH = 760;

export function SimpleAreaChart<T extends SeriesDatum>(props: LineAreaChartProps<T>) {
  return <BaseLineChart {...props} withArea />;
}

export function SimpleLineChart<T extends SeriesDatum>(props: LineAreaChartProps<T>) {
  return <BaseLineChart {...props} withArea={false} />;
}

function BaseLineChart<T extends SeriesDatum>({
  data,
  xKey,
  yKey,
  height = 300,
  stroke,
  fill,
  valueFormatter,
  withArea,
}: LineAreaChartProps<T> & { withArea: boolean }) {
  if (!data.length) {
    return <EmptyChartState height={height} message="No chart data available" />;
  }

  const padding = { top: 18, right: 18, bottom: 46, left: 52 };
  const chartHeight = height;
  const values = data.map((entry) => toNumber(readValue(entry, yKey)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = CHART_WIDTH - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const points = data.map((entry, index) => {
    const x = padding.left + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
    const value = toNumber(readValue(entry, yKey));
    const y = padding.top + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y, label: String(readValue(entry, xKey)), value };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding.bottom} L ${points[0].x} ${chartHeight - padding.bottom} Z`;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, index) => min + (range / yTicks) * index).reverse();

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`} className="h-auto w-full" role="img" aria-label="chart">
        {tickValues.map((tick, index) => {
          const y = padding.top + (innerHeight / yTicks) * index;
          return (
            <g key={index}>
              <line x1={padding.left} x2={CHART_WIDTH - padding.right} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 6" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgba(156, 163, 175, 0.85)">
                {valueFormatter ? valueFormatter(tick) : compactNumber(tick)}
              </text>
            </g>
          );
        })}

        {withArea && fill ? <path d={areaPath} fill={fill} opacity="0.22" /> : null}
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) => (
          <g key={index}>
            <circle cx={point.x} cy={point.y} r="4" fill={stroke} />
            <title>{`${point.label}: ${valueFormatter ? valueFormatter(point.value) : point.value}`}</title>
          </g>
        ))}

        {points.map((point, index) => (
          <text key={index} x={point.x} y={chartHeight - 16} textAnchor="middle" fontSize="11" fill="rgba(156, 163, 175, 0.85)">
            {shortLabel(point.label, data.length)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function SimpleBarChart<T extends SeriesDatum>({
  data,
  xKey,
  bars,
  height = 300,
  valueFormatter,
}: MultiBarChartProps<T>) {
  if (!data.length) {
    return <EmptyChartState height={height} message="No chart data available" />;
  }

  const padding = { top: 18, right: 18, bottom: 46, left: 52 };
  const chartHeight = height;
  const innerWidth = CHART_WIDTH - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const values = data.flatMap((entry) => bars.map((bar) => toNumber(readValue(entry, bar.key))));
  const max = Math.max(...values, 0) || 1;
  const yTicks = 4;
  const groupWidth = innerWidth / data.length;
  const barWidth = Math.max(14, Math.min(32, (groupWidth - 16) / bars.length));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`} className="h-auto w-full" role="img" aria-label="bar chart">
        {Array.from({ length: yTicks + 1 }, (_, index) => {
          const value = (max / yTicks) * (yTicks - index);
          const y = padding.top + (innerHeight / yTicks) * index;
          return (
            <g key={index}>
              <line x1={padding.left} x2={CHART_WIDTH - padding.right} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 6" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgba(156, 163, 175, 0.85)">
                {valueFormatter ? valueFormatter(value) : compactNumber(value)}
              </text>
            </g>
          );
        })}

        {data.map((entry, entryIndex) => {
          const x = padding.left + entryIndex * groupWidth + (groupWidth - barWidth * bars.length) / 2;
          return (
            <g key={entryIndex}>
              {bars.map((bar, barIndex) => {
                const value = toNumber(readValue(entry, bar.key));
                const barHeight = (value / max) * innerHeight;
                const y = padding.top + innerHeight - barHeight;
                return (
                  <g key={String(bar.key)}>
                    <rect x={x + barIndex * barWidth} y={y} width={barWidth - 4} height={barHeight} rx="8" fill={bar.color} opacity="0.9" />
                    <title>{`${bar.label}: ${valueFormatter ? valueFormatter(value) : value}`}</title>
                  </g>
                );
              })}
              <text x={padding.left + entryIndex * groupWidth + groupWidth / 2} y={chartHeight - 16} textAnchor="middle" fontSize="11" fill="rgba(156, 163, 175, 0.85)">
                {shortLabel(String(readValue(entry, xKey)), data.length)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-300">
        {bars.map((bar) => (
          <div key={String(bar.key)} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: bar.color }} />
            <span>{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimpleDonutChart<T extends SeriesDatum>({
  data,
  valueKey,
  labelKey,
  colorKey,
  size = 260,
  innerRadius = 62,
  outerRadius = 100,
  valueFormatter,
}: DonutChartProps<T>) {
  if (!data.length) {
    return <EmptyChartState height={size} message="No chart data available" />;
  }

  const total = data.reduce((sum, entry) => sum + toNumber(readValue(entry, valueKey)), 0) || 1;
  const center = size / 2;
  let startAngle = -Math.PI / 2;

  const segments = data.map((entry) => {
    const value = toNumber(readValue(entry, valueKey));
    const angle = (value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const path = createDonutSlice(center, center, innerRadius, outerRadius, startAngle, endAngle);
    const color = colorKey ? String(readValue(entry, colorKey)) : '#7277ff';
    const label = String(readValue(entry, labelKey));
    const segment = { path, color, label, value };
    startAngle = endAngle;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[260px]" role="img" aria-label="donut chart">
        {segments.map((segment, index) => (
          <path key={index} d={segment.path} fill={segment.color} stroke="#0F0F23" strokeWidth="2">
            <title>{`${segment.label}: ${valueFormatter ? valueFormatter(segment.value) : segment.value}`}</title>
          </path>
        ))}
        <circle cx={center} cy={center} r={innerRadius - 10} fill="rgba(15,15,35,0.82)" />
        <text x={center} y={center - 4} textAnchor="middle" fontSize="14" fill="rgba(156,163,175,0.9)">Total</text>
        <text x={center} y={center + 18} textAnchor="middle" fontSize="22" fontWeight="700" fill="#ffffff">{valueFormatter ? valueFormatter(total) : compactNumber(total)}</text>
      </svg>

      <div className="w-full space-y-2 text-sm">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center justify-between gap-4 rounded-lg bg-[#0F0F23] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-gray-300">{segment.label}</span>
            </div>
            <span className="font-medium text-white">{valueFormatter ? valueFormatter(segment.value) : segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChartState({ height, message }: { height: number; message: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-700 text-gray-400" style={{ height }}>
      {message}
    </div>
  );
}

function toNumber(value: Primitive): number {
  return typeof value === 'number' ? value : Number(value);
}

function readValue<T extends SeriesDatum>(entry: T, key: keyof T): Primitive {
  return entry[key] as Primitive;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function shortLabel(label: string, length: number) {
  if (length <= 8) return label;
  return label.length > 8 ? `${label.slice(0, 8)}…` : label;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function createDonutSlice(cx: number, cy: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}