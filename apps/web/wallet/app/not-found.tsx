"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from './components/Button';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.errorCode}>404</div>
        <h1 className={styles.title}>Page Not Found</h1>
        <p className={styles.message}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        
        <div className={styles.suggestions}>
          <h3>Helpful Links:</h3>
          <ul>
            <li>
              <Link href="/dashboard">
                🏠 Go to Dashboard
              </Link>
            </li>
            <li>
              <Link href="/">
                💰 View Wallet
              </Link>
            </li>
            <li>
              <Link href="/transactions">
                📊 Transaction History
              </Link>
            </li>
            <li>
              <Link href="/settings">
                ⚙️ Settings
              </Link>
            </li>
          </ul>
        </div>

        <div className={styles.actions}>
          <Link href="/">
            <Button variant="primary" icon={<span>🏠</span>}>
              Go Home
            </Button>
          </Link>
          <Button
            variant="outline"
            icon={<span>←</span>}
            onClick={() => globalThis.history.back()}
          >
            Go Back
          </Button>
        </div>
      </div>

      <div className={styles.animation}>
        <div className={styles.coin}>🪙</div>
        <div className={styles.coin}>🪙</div>
        <div className={styles.coin}>🪙</div>
      </div>
    </div>
  );
}
