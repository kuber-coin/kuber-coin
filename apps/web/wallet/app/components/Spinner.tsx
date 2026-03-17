'use client';

import React from 'react';
import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  label?: string;
}

export function Spinner({ size = 'md', color, label }: Readonly<SpinnerProps>) {
  return (
    <div className={`${styles.container} ${styles[size]}`}>
      <div
        className={styles.spinner}
        style={color ? { borderTopColor: color, borderRightColor: color } : undefined}
      />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
