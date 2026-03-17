'use client';

import React, { useState } from 'react';
import styles from './CopyButton.module.css';

interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: 'icon' | 'text' | 'full';
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({
  text,
  label = 'Copy',
  variant = 'icon',
  size = 'md',
  className = ''
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${copied ? styles.copied : ''} ${className}`}
      onClick={handleCopy}
      title={copied ? 'Copied!' : label}
      type="button"
    >
      {copied ? (
        <>
          {variant !== 'icon' && <span>✓ Copied</span>}
          {variant === 'icon' && <span className={styles.icon}>✓</span>}
        </>
      ) : (
        <>
          {variant !== 'icon' && <span>{label}</span>}
          {variant === 'icon' && <span className={styles.icon}>📋</span>}
        </>
      )}
    </button>
  );
}
