import React from 'react';
import { Spinner } from './Spinner';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
	isLoading: boolean;
	message?: string;
	blur?: boolean;
}

export function LoadingOverlay({
	isLoading,
	message = 'Loading...',
	blur = true,
}: LoadingOverlayProps) {
	if (!isLoading) return null;

	return (
		<div className={`${styles.overlay} ${blur ? styles.blur : ''}`}>
			<div className={styles.content}>
				<Spinner size="lg" />
				{message && <p className={styles.message}>{message}</p>}
			</div>
		</div>
	);
}
