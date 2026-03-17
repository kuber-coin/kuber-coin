import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  icon: string;
  label?: string;
  title?: string;
  value: string | number;
  trend?: string;
  subtitle?: string;
  iconBg?: string;
  variant?: 'blue' | 'gold' | 'green' | 'purple' | 'primary' | 'success' | 'info' | 'default';
}

function normalizeVariant(
  variant: StatCardProps['variant']
): 'blue' | 'gold' | 'green' | 'purple' {
  switch (variant) {
    case 'primary':
      return 'blue';
    case 'success':
      return 'green';
    case 'info':
      return 'blue';
    case 'default':
      return 'gold';
    case 'gold':
    case 'green':
    case 'purple':
    case 'blue':
      return variant;
    default:
      return 'blue';
  }
}

export function StatCard({ icon, label, title, value, trend, subtitle, iconBg, variant = 'blue' }: Readonly<StatCardProps>) {
  const normalizedVariant = normalizeVariant(variant);
  const displayLabel = label ?? title ?? '';
  const displayTrend = trend ?? subtitle;

  return (
    <div className={`${styles.card} ${styles[normalizedVariant]}`}>
      <div className={styles.iconWrapper} style={iconBg ? { background: iconBg } : undefined}>
        <div className={styles.icon}>{icon}</div>
      </div>
      <div className={styles.content}>
        <div className={styles.value}>{value}</div>
        <div className={styles.label}>{displayLabel}</div>
        {displayTrend && <div className={styles.trend}>{displayTrend}</div>}
      </div>
    </div>
  );
}
