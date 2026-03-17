import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'purple'
    | 'gold'
    | 'primary'
    | 'danger'
    | 'custom';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

function normalizeVariant(
  variant: NonNullable<BadgeProps['variant']>
): 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' {
  switch (variant) {
    case 'custom':
      return 'default';
    case 'primary':
      return 'info';
    case 'danger':
      return 'error';
    default:
      return variant;
  }
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  className = '',
  ...rest
}: Readonly<BadgeProps>) {
  const normalizedVariant = normalizeVariant(variant);

  return (
    <span
      className={`${styles.badge} ${styles[normalizedVariant]} ${styles[size]} ${pulse ? styles.pulse : ''} ${className}`}
      {...rest}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
