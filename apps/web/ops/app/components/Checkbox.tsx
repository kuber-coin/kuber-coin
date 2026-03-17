import React from 'react';
import styles from './Checkbox.module.css';

interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  className = ''
}: CheckboxProps) {
  return (
    <label className={`${styles.container} ${disabled ? styles.disabled : ''} ${className}`}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className={styles.checkbox}>
        {checked && <span className={styles.checkmark}>✓</span>}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
