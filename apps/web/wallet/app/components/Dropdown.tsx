'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import styles from './Dropdown.module.css';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
  className = ''
}: Readonly<DropdownProps>) {
  const autoId = useId();
  const selectId = `dropdown-${autoId}`;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState('');
  const selectedValue = isControlled ? value : internalValue;

  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!isControlled && value !== undefined) {
      setInternalValue(value);
    }
  }, [isControlled, value]);

  const handleChange = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <div className={`${styles.container} ${className}`}>
      {label ? (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      ) : null}

      <select
        ref={selectRef}
        id={selectId}
        className={`${styles.select} ${disabled ? styles.disabled : ''}`}
        disabled={disabled}
        value={selectedValue}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
