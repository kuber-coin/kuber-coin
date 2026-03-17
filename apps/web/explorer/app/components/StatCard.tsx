import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  icon: string;
  label?: string;
  title?: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  iconBg?: string;
}

export function StatCard({
  icon,
  label,
  title,
  value,
  subtitle,
  trend,
  variant = 'blue',
  iconBg,
}: Readonly<StatCardProps>) {
  const displayLabel = label ?? title ?? '';

  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.iconWrapper} style={iconBg ? { background: iconBg } : undefined}>
        <div className={styles.icon}>{icon}</div>
      </div>
      <div className={styles.content}>
        <div className={styles.value}>{value}</div>
        {displayLabel && <div className={styles.label}>{displayLabel}</div>}
        {subtitle && <div className={styles.label} style={{ opacity: 0.75 }}>{subtitle}</div>}
        {trend && <div className={styles.trend}>{trend}</div>}
      </div>
    </div>
  );
}
