'use client';

import React, { useState } from 'react';
import styles from './AppLayout.module.css';
import { Sidebar } from './Sidebar';

type SidebarItem = {
  icon: string;
  label: string;
  href: string;
  badge?: string;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
};

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarItems?: SidebarItem[];
}

const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { icon: '🏠', label: 'Home', href: '/' },
  { icon: '🚨', label: 'Alerts', href: '/alerts' },
  { icon: '📊', label: 'Charts', href: '/charts' },
  { icon: '🌐', label: 'Network', href: '/network' },
  { icon: '🧭', label: 'Explorer', href: '/explorer' },
  { icon: '❤️', label: 'Health', href: '/explorer/health' },
  { icon: '🧵', label: 'Peers', href: '/explorer/network' },
  { icon: '👛', label: 'Addresses', href: '/wallet/addresses' },
  { icon: '🪙', label: 'UTXOs', href: '/wallet/utxos' },
  { icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
  { icon: '🚰', label: 'Faucet', href: '/faucet' },
  { icon: '🧰', label: 'RPC', href: '/ops/rpc' },
  { icon: '🧩', label: 'Components', href: '/components-docs' },
];

export function AppLayout({ children, sidebarItems }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const effectiveSidebarItems = sidebarItems ?? DEFAULT_SIDEBAR_ITEMS;

  return (
    <div className={styles.layout}>
      <Sidebar
        items={effectiveSidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className={`${styles.main} ${sidebarCollapsed ? styles.expanded : ''}`}>
        {children}
      </main>
    </div>
  );
}
