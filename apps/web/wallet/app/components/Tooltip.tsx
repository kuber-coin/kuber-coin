'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200
}: Readonly<TooltipProps>) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const showTooltip = () => {
    timeoutRef.current = globalThis.setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      globalThis.clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      className={styles.container}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {visible && (
        <div className={`${styles.tooltip} ${styles[position]}`}>
          {content}
        </div>
      )}
    </button>
  );
}
