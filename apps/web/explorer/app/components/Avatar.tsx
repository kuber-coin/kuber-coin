import React from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'busy';
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
  const getInitials = (name?: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className={`${styles.container} ${styles[size]} ${styles[variant]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className={styles.image} />
      ) : (
        <div className={styles.fallback}>
          {fallback || getInitials(alt)}
        </div>
      )}
      {status && (
        <span className={`${styles.status} ${styles[`status${status.charAt(0).toUpperCase()}${status.slice(1)}`]}`} />
      )}
    </div>
  );
}
