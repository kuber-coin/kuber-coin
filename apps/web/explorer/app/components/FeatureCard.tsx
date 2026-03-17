import React from 'react';
import styles from './FeatureCard.module.css';

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  variant?: 'blue' | 'gold' | 'purple';
}

export function FeatureCard({ icon, title, description, variant = 'blue' }: Readonly<FeatureCardProps>) {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.iconCircle}>
        <div className={styles.icon}>{icon}</div>
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
