'use client';

import React, { useState, useRef, useEffect } from 'react';
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
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === selectedValue);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    setSelectedValue(optionValue);
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, optionValue?: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (optionValue) {
        handleSelect(optionValue);
      } else {
        setIsOpen(!isOpen);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`${styles.container} ${className}`} ref={dropdownRef}>
      {label && <label className={styles.label}>{label}</label>}
      <div
        className={`${styles.trigger} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => handleKeyDown(e)}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={styles.triggerContent}>
          {selectedOption?.icon && <span className={styles.triggerIcon}>{selectedOption.icon}</span>}
          <span className={styles.triggerText}>
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <span className={`${styles.arrow} ${isOpen ? styles.arrowUp : ''}`}>▼</span>
      </div>

      {isOpen && (
        <div className={styles.menu}>
          {options.map((option) => (
            <div
              key={option.value}
              className={`${styles.option} ${option.value === selectedValue ? styles.selected : ''} ${option.disabled ? styles.optionDisabled : ''}`}
              onClick={() => !option.disabled && handleSelect(option.value)}
              onKeyDown={(e) => !option.disabled && handleKeyDown(e, option.value)}
              tabIndex={option.disabled ? -1 : 0}
              role="option"
              aria-selected={option.value === selectedValue}
            >
              {option.icon && <span className={styles.optionIcon}>{option.icon}</span>}
              <span className={styles.optionLabel}>{option.label}</span>
              {option.value === selectedValue && <span className={styles.checkmark}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
