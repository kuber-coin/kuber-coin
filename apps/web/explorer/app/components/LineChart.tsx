'use client';

import React, { useMemo } from 'react';
import styles from './LineChart.module.css';

interface DataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  gradient?: boolean;
  showArea?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  animated?: boolean;
}

export function LineChart({
  data,
  height = 200,
  color = 'var(--kc-accent-blue)',
  gradient = true,
  showArea,
  showGrid = true,
  showLabels = true,
  animated = true,
}: LineChartProps) {
  const effectiveGradient = showArea ?? gradient;
  const { pathData, areaData, points, minValue, maxValue, stepX } = useMemo(() => {
    if (data.length === 0) {
      return { pathData: '', areaData: '', points: [], minValue: 0, maxValue: 0, stepX: 0 };
    }

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 100;
    const chartHeight = 80;
    const step = width / (data.length - 1);

    const pts = data.map((d, i) => {
      const x = i * step;
      const y = chartHeight - ((d.value - min) / range) * chartHeight;
      return { x, y, value: d.value };
    });

    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    
    const area = `${path} L ${pts[pts.length - 1].x},${chartHeight} L 0,${chartHeight} Z`;

    return {
      pathData: path,
      areaData: area,
      points: pts,
      minValue: min,
      maxValue: max,
      stepX: step,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={styles.empty} style={{ height }}>
        <span>No data</span>
      </div>
    );
  }

  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={styles.container} style={{ height }}>
      <svg
        className={`${styles.chart} ${animated ? styles.animated : ''}`}
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        aria-label="Line chart"
        role="img"
      >
        <defs>
          {effectiveGradient && (
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          )}
        </defs>

        {showGrid && (
          <g className={styles.grid}>
            {[0, 25, 50, 75, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={(y / 100) * 80}
                x2="100"
                y2={(y / 100) * 80}
                stroke="var(--kc-glass-border)"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            ))}
          </g>
        )}

        {effectiveGradient && (
          <path
            d={areaData}
            fill={`url(#${gradientId})`}
            className={styles.area}
          />
        )}

        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.line}
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.5"
            fill={color}
            className={styles.point}
          />
        ))}
      </svg>

      {showLabels && (
        <div className={styles.labels}>
          <span className={styles.labelStart}>{data[0].label}</span>
          <span className={styles.labelEnd}>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}
