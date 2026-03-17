'use client';

import React, { useId, useMemo } from 'react';
import styles from './DonutChart.module.css';

export interface DonutChartData {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  centerLabel?: string;
  centerValue?: string;
  animated?: boolean;
}

export function DonutChart({
  data,
  size = 200,
  thickness = 30,
  showLegend = true,
  centerLabel,
  centerValue,
  animated = true,
}: Readonly<DonutChartProps>) {
  const titleId = useId();

  const { segments, total } = useMemo(() => {
    const t = data.reduce((sum, d) => sum + d.value, 0);
    let currentAngle = -90; // Start from top

    const segs = data.map((item, index) => {
      const percentage = (item.value / t) * 100;
      const angle = (item.value / t) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const color = item.color || `hsl(${(index * 360) / data.length}, 70%, 60%)`;

      return {
        ...item,
        percentage,
        startAngle,
        endAngle,
        color,
      };
    });

    return { segments: segs, total: t };
  }, [data]);

  if (data.length === 0 || total === 0) {
    return (
      <div className={styles.empty} style={{ width: size, height: size }}>
        <span>No data</span>
      </div>
    );
  }

  const radius = size / 2;
  const innerRadius = radius - thickness;
  const center = size / 2;

  const createArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(center, center, radius, endAngle);
    const end = polarToCartesian(center, center, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    const innerStart = polarToCartesian(center, center, innerRadius, endAngle);
    const innerEnd = polarToCartesian(center, center, innerRadius, startAngle);

    return `
      M ${start.x} ${start.y}
      A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}
      L ${innerEnd.x} ${innerEnd.y}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}
      Z
    `;
  };

  return (
    <div className={styles.container}>
      <svg
        className={`${styles.donut} ${animated ? styles.animated : ''}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-labelledby={titleId}
      >
        <title id={titleId}>Donut chart</title>
        {segments.map((segment, index) => (
          <g key={segment.label}>
            <path
              d={createArc(segment.startAngle, segment.endAngle)}
              fill={segment.color}
              className={styles.segment}
              style={{
                animationDelay: animated ? `${index * 0.1}s` : '0s',
              }}
            />
          </g>
        ))}

        {(centerLabel || centerValue) && (
          <g>
            <text
              x={center}
              y={center - 8}
              textAnchor="middle"
              className={styles.centerLabel}
            >
              {centerLabel}
            </text>
            <text
              x={center}
              y={center + 12}
              textAnchor="middle"
              className={styles.centerValue}
            >
              {centerValue}
            </text>
          </g>
        )}
      </svg>

      {showLegend && (
        <div className={styles.legend}>
          {segments.map((segment) => (
            <div key={segment.label} className={styles.legendItem}>
              <div
                className={styles.legendColor}
                style={{ background: segment.color }}
              />
              <span className={styles.legendLabel}>{segment.label}</span>
              <span className={styles.legendValue}>
                {segment.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
