import React from 'react';
import styles from './AnimatedNumber.module.css';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number;
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
}: AnimatedNumberProps) {
  const displayValue = typeof value === 'number' 
    ? value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : '0';

  return (
    <span className={`${styles.number} ${className}`}>
      {prefix}{displayValue}{suffix}
    </span>
  );
}
