import React from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'busy' | 'active' | 'syncing' | 'idle';
  fallback?: string;
  variant?: 'circle' | 'square';
  className?: string;
}

export function Avatar({
  src,
  alt = 'Avatar',
  size = 'md',
  status,
  fallback,
  variant = 'circle',
  className = ''
}: AvatarProps) {
    const normalizedSize = size === 'xs' ? 'sm' : size;
  const getInitials = (name?: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const normalizedStatus =
    status === 'active' ? 'online' : status === 'syncing' ? 'busy' : status === 'idle' ? 'away' : status;

  return (
    <div className={`${styles.container} ${styles[normalizedSize]} ${styles[variant]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className={styles.image} />
      ) : (
        <div className={styles.fallback}>
          {fallback || getInitials(alt)}
        </div>
      )}
      {normalizedStatus && (
        <span
          className={`${styles.status} ${
            styles[`status${normalizedStatus.charAt(0).toUpperCase()}${normalizedStatus.slice(1)}`]
          }`}
        />
      )}
    </div>
  );
}
