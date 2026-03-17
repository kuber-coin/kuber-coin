import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'danger' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
}

function normalizeVariant(
  variant: NonNullable<BadgeProps['variant']>
): 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' {
  switch (variant) {
    case 'danger':
      return 'error';
    case 'primary':
      return 'info';
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
      {...rest}
      className={`${styles.badge} ${styles[normalizedVariant]} ${styles[size]} ${pulse ? styles.pulse : ''} ${className}`}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
