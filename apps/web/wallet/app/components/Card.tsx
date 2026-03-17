import React from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated';
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
}: Readonly<CardProps>) {
  const paddingKey = `padding-${padding}`;
  const paddingClass = styles[paddingKey];
  const classes = `${styles.card} ${styles[variant]} ${paddingClass} ${hoverable ? styles.hoverable : ''} ${onClick ? styles.clickable : ''} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={classes}
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

export function CardHeader({ children, action, className = '' }: Readonly<CardHeaderProps>) {
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

export function CardBody({ children, className = '' }: Readonly<CardBodyProps>) {
  return <div className={`${styles.body} ${className}`}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: Readonly<CardFooterProps>) {
  return <div className={`${styles.footer} ${className}`}>{children}</div>;
}
