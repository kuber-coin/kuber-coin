import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'danger' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
}

function normalizeVariant(variant: NonNullable<ProgressBarProps['variant']>) {
  switch (variant) {
    case 'danger':
      return 'error';
    case 'info':
      return 'default';
    case 'primary':
      return 'gradient';
    default:
      return variant;
  }
}

export function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  className = ''
}: Readonly<ProgressBarProps>) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const normalizedVariant = normalizeVariant(variant);

  return (
    <div className={`${styles.container} ${className}`}>
      {(showLabel || label) && (
        <div className={styles.labelRow}>
          {label && <span className={styles.label}>{label}</span>}
          {showLabel && <span className={styles.percentage}>{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={`${styles.track} ${styles[size]}`}>
        <div
          className={`${styles.fill} ${styles[normalizedVariant]} ${animated ? styles.animated : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
