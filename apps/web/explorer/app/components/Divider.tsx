import React from 'react';
import styles from './Divider.module.css';

interface DividerProps {
  label?: string;
  variant?: 'solid' | 'dashed' | 'gradient';
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Divider({
  label,
  variant = 'solid',
  spacing = 'md',
  className = ''
}: DividerProps) {
  return (
    <div className={`${styles.container} ${styles[spacing]} ${className}`}>
      {label ? (
        <div className={styles.withLabel}>
          <div className={`${styles.line} ${styles[variant]}`} />
          <span className={styles.label}>{label}</span>
          <div className={`${styles.line} ${styles[variant]}`} />
        </div>
      ) : (
        <div className={`${styles.line} ${styles[variant]}`} />
      )}
    </div>
  );
}
