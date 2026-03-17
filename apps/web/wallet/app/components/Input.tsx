import React, { useId, useState, useRef, useEffect } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  helperText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  success?: boolean;
  animateOnFocus?: boolean;
}

export function Input({
  label,
  error,
  hint,
  helperText,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  success = false,
  animateOnFocus = true,
  className = '',
  onFocus,
  onBlur,
  ...props
}: Readonly<InputProps>) {
  const autoId = useId();
  const inputId = props.id ?? autoId;
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const wrapperClassName = `${styles.container} ${fullWidth ? styles.fullWidth : ''} ${isFocused && animateOnFocus ? styles.focused : ''}`.trim();

  let iconClassName = '';
  let withIconClassName = '';

  if (icon) {
    if (iconPosition === 'left') {
      iconClassName = `${styles.icon} ${styles.iconLeft}`;
      withIconClassName = styles.withLeftIcon;
    } else {
      iconClassName = `${styles.icon} ${styles.iconRight}`;
      withIconClassName = styles.withRightIcon;
    }
  }

  const inputClassName = `${styles.input} ${error ? styles.error : ''} ${success ? styles.success : ''} ${withIconClassName} ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {icon && iconPosition === 'left' ? <span className={iconClassName}>{icon}</span> : null}
        <input
          ref={inputRef}
          id={inputId}
          className={inputClassName}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {icon && iconPosition === 'right' ? <span className={iconClassName}>{icon}</span> : null}
        {success && !error && (
          <span className={`${styles.icon} ${styles.iconRight} ${styles.successIcon}`}>
            ✓
          </span>
        )}
      </div>
      {error && <span className={styles.errorText}>⚠️ {error}</span>}
      {(hint ?? helperText) && !error && <span className={styles.hint}>{hint ?? helperText}</span>}
    </div>
  );
}
