'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './components/Button';
import styles from './error.module.css';

type ErrorPageProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.errorCode}>500</div>
        <h1 className={styles.title}>Something Went Wrong</h1>
        <p className={styles.message}>
          We encountered an unexpected error. Our team has been notified.
        </p>
        
        {error.digest && (
          <div className={styles.digest}>
            <span className={styles.digestLabel}>Error ID:</span>
            <code className={styles.digestCode}>{error.digest}</code>
          </div>
        )}

        <details className={styles.details}>
          <summary>Technical Details</summary>
          <div className={styles.errorDetails}>
            <code>{error.message}</code>
          </div>
        </details>

        <div className={styles.actions}>
          <Button
            variant="primary"
            icon={<span>🔄</span>}
            onClick={reset}
          >
            Try Again
          </Button>
          <Button
            variant="outline"
            icon={<span>🏠</span>}
            onClick={() => router.push('/')}
          >
            Go Home
          </Button>
        </div>
      </div>

      <div className={styles.background}>
        <div className={styles.glitch}>⚠️</div>
      </div>
    </div>
  );
}
