'use client';

import React, { useRef, useState } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  ripple?: boolean;
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
  ripple = true,
  onClick,
  ...props
}: ButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (ripple && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      
      setRipples(prev => [...prev, { x, y, id }]);
      setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
    }
    onClick?.(e);
  };

  return (
    <button
      ref={buttonRef}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${fullWidth ? styles.fullWidth : ''} ${loading ? styles.loading : ''} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {ripple && ripples.map(r => (
        <span
          key={r.id}
          className={styles.ripple}
          style={{ left: `${r.x}px`, top: `${r.y}px` }}
        />
      ))}
      {loading && (
        <span className={styles.loadingContainer}>
          <span className={styles.spinner} />
        </span>
      )}
      {!loading && icon && iconPosition === 'left' && <span className={styles.iconLeft}>{icon}</span>}
      <span className={`${styles.content} ${loading ? styles.contentHidden : ''}`}>{children}</span>
      {!loading && icon && iconPosition === 'right' && <span className={styles.iconRight}>{icon}</span>}
    </button>
  );
}
