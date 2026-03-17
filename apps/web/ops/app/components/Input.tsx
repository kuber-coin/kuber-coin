import React, { useId } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  helperText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export function Input({
  label,
  error,
  hint,
  helperText,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  ...props
}: InputProps) {
  const autoId = useId();
  const inputId = props.id ?? autoId;

  return (
    <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''}`}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {icon && iconPosition === 'left' && (
          <span className={`${styles.icon} ${styles.iconLeft}`}>{icon}</span>
        )}
        <input
          id={inputId}
          className={`${styles.input} ${error ? styles.error : ''} ${icon ? styles[`with${iconPosition === 'left' ? 'Left' : 'Right'}Icon`] : ''} ${className}`}
          {...props}
        />
        {icon && iconPosition === 'right' && (
          <span className={`${styles.icon} ${styles.iconRight}`}>{icon}</span>
        )}
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
      {(hint ?? helperText) && !error && <span className={styles.hint}>{hint ?? helperText}</span>}
    </div>
  );
}
