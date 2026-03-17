import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '20px', borderRadius = '8px', className }: Readonly<SkeletonProps>) {
  return (
    <div
      className={`${styles.skeleton} ${className || ''}`}
      style={{ width, height, borderRadius }}
    />
  );
}
