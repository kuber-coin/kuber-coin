import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'danger' | 'primary' | 'custom';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  className = '',
  ...props
}: BadgeProps) {
  const normalizedVariant =
    variant === 'danger'
      ? 'error'
      : variant === 'primary'
        ? 'info'
        : variant === 'custom'
          ? 'default'
          : variant;
  return (
    <span
      className={`${styles.badge} ${styles[normalizedVariant]} ${styles[size]} ${pulse ? styles.pulse : ''} ${className}`}
      {...props}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
