import React from 'react';
import styles from './PremiumButton.module.css';

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'gold' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function PremiumButton({ 
  variant = 'primary', 
  size = 'md', 
  className = '',
  children,
  ...props 
}: Readonly<PremiumButtonProps>) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      {...props}
    >
      <span className={styles.content}>{children}</span>
      <span className={styles.glow} />
    </button>
  );
}
