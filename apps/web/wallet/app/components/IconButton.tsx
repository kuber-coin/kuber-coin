'use client';

import React from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function IconButton({
  icon,
  variant = 'default',
  size = 'md',
  label,
  className = '',
  ...props
}: Readonly<IconButtonProps>) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <span className={styles.icon}>{icon}</span>
    </button>
  );
}
