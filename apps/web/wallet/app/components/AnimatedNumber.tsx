import React from 'react';
import styles from './AnimatedNumber.module.css';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  className = ''
}: Readonly<AnimatedNumberProps>) {
  const displayValue = Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
    : '0';

  return (
    <span className={`${styles.number} ${className}`}>
      {prefix}{displayValue}{suffix}
    </span>
  );
}
