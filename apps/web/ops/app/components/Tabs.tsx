'use client';

import React, { useState } from 'react';
import { Badge } from './Badge';
import styles from './Tabs.module.css';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'danger' | 'primary';
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  className?: string;
}

export function Tabs({
  tabs,
  activeTab: controlledActiveTab,
  defaultTab,
  onChange,
  variant = 'default',
  className = ''
}: Readonly<TabsProps>) {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || tabs[0]?.id);
  
  // Use controlled value if provided, otherwise use internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (disabled) return;
    if (controlledActiveTab === undefined) {
      setInternalActiveTab(tabId);
    }
    onChange?.(tabId);
  };

  return (
    <div className={`${styles.container} ${styles[variant]} ${className}`}>
      <div className={styles.tabList} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''} ${tab.disabled ? styles.disabled : ''}`}
            onClick={() => handleTabClick(tab.id, tab.disabled)}
            role="tab"
            aria-selected={activeTab === tab.id}
            disabled={tab.disabled}
            type="button"
          >
            {tab.icon && <span className={styles.icon}>{tab.icon}</span>}
            <span className={styles.label}>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <Badge variant={tab.badgeVariant ?? 'default'} size="sm" className={styles.badge}>
                {tab.badge}
              </Badge>
            )}
          </button>
        ))}
        {variant === 'underline' && (
          <div 
            className={styles.indicator}
            style={{
              left: `${tabs.findIndex(t => t.id === activeTab) * (100 / tabs.length)}%`,
              width: `${100 / tabs.length}%`
            }}
          />
        )}
      </div>
    </div>
  );
}
