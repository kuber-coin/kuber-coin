'use client';

import React, { useId, useMemo } from 'react';
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
  showGrid?: boolean;
  showLabels?: boolean;
  animated?: boolean;
}

export function LineChart({
  data,
  height = 200,
  color = 'var(--kc-accent-blue)',
  gradient = true,
  showGrid = true,
  showLabels = true,
  animated = true,
}: Readonly<LineChartProps>) {
  const titleId = useId();

  const { pathData, areaData, points } = useMemo(() => {
    if (data.length === 0) {
      return { pathData: '', areaData: '', points: [] as Array<{ x: number; y: number; value: number; label: string }> };
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
      return { x, y, value: d.value, label: d.label };
    });

    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    
    const lastPoint = pts.at(-1);
    const area = lastPoint
      ? `${path} L ${lastPoint.x},${chartHeight} L 0,${chartHeight} Z`
      : path;

    return {
      pathData: path,
      areaData: area,
      points: pts,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={styles.empty} style={{ height }}>
        <span>No data</span>
      </div>
    );
  }

  const gradientId = `gradient-${Math.random().toString(36).slice(2, 11)}`;

  return (
    <div className={styles.container} style={{ height }}>
      <svg
        className={`${styles.chart} ${animated ? styles.animated : ''}`}
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        aria-labelledby={titleId}
      >
        <title id={titleId}>Line chart</title>
        <defs>
          {gradient && (
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

        {gradient && (
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

        {points.map((p) => (
          <circle
            key={`${p.label}-${p.x}-${p.y}`}
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
          <span className={styles.labelEnd}>{data.at(-1)?.label}</span>
        </div>
      )}
    </div>
  );
}
