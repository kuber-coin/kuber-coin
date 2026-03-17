'use client';

import React, { useState } from 'react';
import styles from './AppLayout.module.css';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarItems: Array<{
    icon: string;
    label: string;
    href: string;
    badge?: string;
    badgeVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  }>;
}

export function AppLayout({ children, sidebarItems }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={styles.layout}>
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className={`${styles.main} ${sidebarCollapsed ? styles.expanded : ''}`}>
        {children}
      </main>
    </div>
  );
}
