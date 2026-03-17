import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  className = '',
  ...props
}: Readonly<ButtonProps>) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className={styles.spinner} />}
      {!loading && icon && iconPosition === 'left' && <span className={styles.iconLeft}>{icon}</span>}
      <span className={styles.content}>{children}</span>
      {!loading && icon && iconPosition === 'right' && <span className={styles.iconRight}>{icon}</span>}
    </button>
  );
}
