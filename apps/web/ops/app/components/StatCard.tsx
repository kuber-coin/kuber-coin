import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  icon: string;
  label?: string;
  title?: string;
  subtitle?: string;
  value: string | number;
  trend?: string;
  iconBg?: string;
  variant?:
    | 'blue'
    | 'gold'
    | 'green'
    | 'purple'
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'error'
    | 'info';
}

function normalizeVariant(variant: StatCardProps['variant']): 'blue' | 'gold' | 'green' | 'purple' {
  switch (variant) {
    case 'default':
    case 'primary':
    case 'info':
      return 'blue';
    case 'success':
      return 'green';
    case 'warning':
      return 'gold';
    case 'danger':
    case 'error':
      return 'purple';
    case 'gold':
    case 'green':
    case 'purple':
    case 'blue':
      return variant;
    default:
      return 'blue';
  }
}

export function StatCard({ icon, label, title, subtitle, value, trend, iconBg, variant = 'blue' }: Readonly<StatCardProps>) {
  const normalizedVariant = normalizeVariant(variant);
  const effectiveLabel = label ?? title ?? '';
  return (
    <div className={`${styles.card} ${styles[normalizedVariant]}`}>
      <div className={styles.iconWrapper} style={iconBg ? { background: iconBg } : undefined}>
        <div className={styles.icon}>{icon}</div>
      </div>
      <div className={styles.content}>
        <div className={styles.value}>{value}</div>
        <div className={styles.label}>{effectiveLabel}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        {trend && <div className={styles.trend}>{trend}</div>}
      </div>
    </div>
  );
}
