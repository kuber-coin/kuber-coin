'use client';

import React, { useState } from 'react';
import styles from './NotificationCenter.module.css';
import { Badge } from './Badge';
import { IconButton } from './IconButton';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
}

interface NotificationCenterProps {
  notifications?: Notification[];
  onNotificationClick?: (id: string) => void;
  onMarkAllRead?: () => void;
  onClear?: () => void;
}

export function NotificationCenter({
  notifications = [],
  onNotificationClick,
  onMarkAllRead,
  onClear
}: Readonly<NotificationCenterProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return '✓';
      case 'warning': return '!';
      case 'error': return '×';
      default: return 'i';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.trigger}>
        <IconButton
          icon="🔔︎"
          label="Notifications"
          variant={unreadCount > 0 ? 'primary' : 'default'}
          onClick={() => setIsOpen(!isOpen)}
        />
        {unreadCount > 0 && (
          <Badge variant="error" size="sm" className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </div>

      {isOpen && (
        <>
          <button
            type="button"
            className={styles.overlay}
            onClick={() => setIsOpen(false)}
            aria-label="Close notifications"
            tabIndex={-1}
          />
          <div className={styles.panel}>
            <div className={styles.header}>
              <h3 className={styles.title}>Notifications</h3>
              <div className={styles.actions}>
                {unreadCount > 0 && (
                  <button className={styles.action} onClick={onMarkAllRead}>
                    Mark all read
                  </button>
                )}
                <button className={styles.action} onClick={onClear}>
                  Clear
                </button>
                <IconButton
                  icon="✕"
                  size="sm"
                  variant="ghost"
                  label="Close"
                  onClick={() => setIsOpen(false)}
                />
              </div>
            </div>

            <div className={styles.list}>
              {notifications.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>🔔︎</span>
                  <p>No notifications</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`${styles.notification} ${notification.read ? '' : styles.unread} ${styles[notification.type]}`}
                    onClick={() => {
                      onNotificationClick?.(notification.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className={styles.notificationIcon}>
                      {getIcon(notification.type)}
                    </div>
                    <div className={styles.notificationContent}>
                      <h4 className={styles.notificationTitle}>{notification.title}</h4>
                      <p className={styles.notificationMessage}>{notification.message}</p>
                      <span className={styles.notificationTime}>
                        {formatTime(notification.timestamp)}
                      </span>
                    </div>
                    {!notification.read && <span className={styles.unreadDot} />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
