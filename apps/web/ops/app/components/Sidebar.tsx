'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import { Badge } from './Badge';

interface NavItem {
  icon: string;
  label: string;
  href: string;
  badge?: string;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

interface SidebarProps {
  items: NavItem[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ items, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>💎</span>
          {!collapsed && <span className={styles.logoText}>KuberCoin</span>}
        </div>
        {onToggle && (
          <button
            className={styles.toggle}
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '→' : '←'}
          </button>
        )}
      </div>

      <nav className={styles.nav}>
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge && (
                    <Badge
                      variant={item.badgeVariant || 'primary'}
                      size="sm"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        {!collapsed && (
          <div className={styles.footerContent}>
            <span className={styles.version}>v2.1.0</span>
            <span className={styles.network}>Mainnet</span>
          </div>
        )}
      </div>
    </aside>
  );
}
