import React from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated' | 'hover';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  className = '',
  onClick
}: CardProps) {
  const normalizedVariant = variant === 'hover' ? 'glass' : variant;
  const normalizedHoverable = hoverable || variant === 'hover';

  return (
    <div
      className={`${styles.card} ${styles[normalizedVariant]} ${styles[`padding-${padding}`]} ${normalizedHoverable ? styles.hoverable : ''} ${onClick ? styles.clickable : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`${styles.header} ${className}`}>
      <div className={styles.headerContent}>{children}</div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`${styles.body} ${className}`}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return <div className={`${styles.footer} ${className}`}>{children}</div>;
}
