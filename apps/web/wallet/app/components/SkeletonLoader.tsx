"use client";

import React from 'react';
import styles from './SkeletonLoader.module.css';

interface SkeletonLoaderProps {
  variant?: 'text' | 'card' | 'stat' | 'table' | 'chart' | 'avatar' | 'button';
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}

function createStableId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createStableKeys(count: number, prefix: string): string[] {
  return Array.from({ length: count }, () => `${prefix}-${createStableId()}`);
}

export function SkeletonLoader({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
}: Readonly<SkeletonLoaderProps>) {
  const elementCount = variant === 'table' ? 1 : Math.max(count, 1);
  const elementKeys = React.useMemo(() => createStableKeys(elementCount, `sk-${variant}`), [elementCount, variant]);
  const tableRowKeys = React.useMemo(
    () => (variant === 'table' ? createStableKeys(Math.max(count, 1), 'sk-table-row') : []),
    [count, variant]
  );

  const getSkeletonElement = () => {
    switch (variant) {
      case 'text':
        return <div className={`${styles.skeleton} ${styles.text}`} style={{ width, height }} />;
      
      case 'card':
        return (
          <div className={`${styles.skeletonCard}`}>
            <div className={styles.cardHeader}>
              <div className={`${styles.skeleton} ${styles.title}`} />
              <div className={`${styles.skeleton} ${styles.badge}`} />
            </div>
            <div className={styles.cardBody}>
              <div className={`${styles.skeleton} ${styles.text}`} />
              <div className={`${styles.skeleton} ${styles.text}`} style={{ width: '80%' }} />
              <div className={`${styles.skeleton} ${styles.text}`} style={{ width: '60%' }} />
            </div>
          </div>
        );
      
      case 'stat':
        return (
          <div className={styles.skeletonStat}>
            <div className={`${styles.skeleton} ${styles.icon}`} />
            <div className={styles.statContent}>
              <div className={`${styles.skeleton} ${styles.label}`} />
              <div className={`${styles.skeleton} ${styles.value}`} />
              <div className={`${styles.skeleton} ${styles.trend}`} />
            </div>
          </div>
        );
      
      case 'table':
        return (
          <div className={styles.skeletonTable}>
            <div className={styles.tableHeader}>
              {[1, 2, 3, 4].map((i) => (
                <div key={`th-${i}`} className={`${styles.skeleton} ${styles.tableCell}`} />
              ))}
            </div>
            {tableRowKeys.map((rowKey) => (
              <div key={rowKey} className={styles.tableRow}>
                {[1, 2, 3, 4].map((j) => (
                  <div key={`${rowKey}-c-${j}`} className={`${styles.skeleton} ${styles.tableCell}`} />
                ))}
              </div>
            ))}
          </div>
        );
      
      case 'chart':
        return (
          <div className={styles.skeletonChart} style={{ height: height || '300px' }}>
            <div className={styles.chartBars}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`${styles.skeleton} ${styles.chartBar}`}
                  style={{ height: `${20 + Math.random() * 60}%` }}
                />
              ))}
            </div>
          </div>
        );
      
      case 'avatar':
        return <div className={`${styles.skeleton} ${styles.avatar}`} style={{ width, height }} />;
      
      case 'button':
        return <div className={`${styles.skeleton} ${styles.button}`} style={{ width, height }} />;
      
      default:
        return <div className={`${styles.skeleton}`} style={{ width, height }} />;
    }
  };

  if (count === 1) {
    return <div className={className}>{getSkeletonElement()}</div>;
  }

  return (
    <div className={className}>
      {elementKeys.map((key) => (
        <div key={key} style={{ marginBottom: '12px' }}>
          {getSkeletonElement()}
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, className = '' }: Readonly<{ lines?: number; className?: string }>) {
  const lineKeys = React.useMemo(() => createStableKeys(Math.max(lines, 1), 'sk-text'), [lines]);

  return (
    <div className={className}>
      {lineKeys.map((key, i) => (
        <div
          key={key}
          className={`${styles.skeleton} ${styles.text}`}
          style={{ width: i === lines - 1 ? '60%' : '100%', marginBottom: '8px' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: Readonly<{ className?: string }>) {
  return <SkeletonLoader variant="card" className={className} />;
}

export function SkeletonTable({ rows = 5, className = '' }: Readonly<{ rows?: number; className?: string }>) {
  return <SkeletonLoader variant="table" count={rows} className={className} />;
}

export function SkeletonChart({ height = '300px', className = '' }: Readonly<{ height?: string; className?: string }>) {
  return <SkeletonLoader variant="chart" height={height} className={className} />;
}
