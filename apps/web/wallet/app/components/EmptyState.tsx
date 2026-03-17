import React from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  illustration?: 'wallet' | 'search' | 'network' | 'data';
}

const illustrations = {
  wallet: '💼',
  search: '🔍',
  network: '🌐',
  data: '📊'
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  illustration = 'data'
}: EmptyStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        {icon || <span className={styles.illustration}>{illustrations[illustration]}</span>}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
