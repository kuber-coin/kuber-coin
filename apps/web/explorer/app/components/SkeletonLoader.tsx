import React from 'react';
import styles from './SkeletonLoader.module.css';

interface SkeletonLoaderProps {
	variant?: 'text' | 'card' | 'stat' | 'table' | 'chart' | 'avatar' | 'button';
	width?: string;
	height?: string;
	count?: number;
	className?: string;
}

export function SkeletonLoader({
	variant = 'text',
	width,
	height,
	count = 1,
	className = '',
}: SkeletonLoaderProps) {
	const getSkeletonElement = () => {
		switch (variant) {
			case 'text':
				return <div className={`${styles.skeleton} ${styles.text}`} style={{ width, height }} />;

			case 'card':
				return (
					<div className={`${styles.skeletonCard}`}>
						<div className={styles.cardHeader}>
							<div className={`${styles.skeleton} ${styles.title}`} />
							<div className={`${styles.skeleton} ${styles.badge}`} />
						</div>
						<div className={styles.cardBody}>
							<div className={`${styles.skeleton} ${styles.text}`} />
							<div className={`${styles.skeleton} ${styles.text}`} style={{ width: '80%' }} />
							<div className={`${styles.skeleton} ${styles.text}`} style={{ width: '60%' }} />
						</div>
					</div>
				);

			case 'stat':
				return (
					<div className={styles.skeletonStat}>
						<div className={`${styles.skeleton} ${styles.icon}`} />
						<div className={styles.statContent}>
							<div className={`${styles.skeleton} ${styles.label}`} />
							<div className={`${styles.skeleton} ${styles.value}`} />
							<div className={`${styles.skeleton} ${styles.trend}`} />
						</div>
					</div>
				);

			case 'table':
				return (
					<div className={styles.skeletonTable}>
						<div className={styles.tableHeader}>
							{[1, 2, 3, 4].map((i) => (
								<div key={i} className={`${styles.skeleton} ${styles.tableCell}`} />
							))}
						</div>
						{Array.from({ length: count }).map((_, i) => (
							<div key={i} className={styles.tableRow}>
								{[1, 2, 3, 4].map((j) => (
									<div key={j} className={`${styles.skeleton} ${styles.tableCell}`} />
								))}
							</div>
						))}
					</div>
				);

			case 'chart':
				return (
					<div className={styles.skeletonChart} style={{ height: height || '300px' }}>
						<div className={styles.chartBars}>
							{[1, 2, 3, 4, 5, 6].map((i) => (
								<div
									key={i}
									className={`${styles.skeleton} ${styles.chartBar}`}
									style={{ height: `${20 + Math.random() * 60}%` }}
								/>
							))}
						</div>
					</div>
				);

			case 'avatar':
				return <div className={`${styles.skeleton} ${styles.avatar}`} style={{ width, height }} />;

			case 'button':
				return <div className={`${styles.skeleton} ${styles.button}`} style={{ width, height }} />;

			default:
				return <div className={`${styles.skeleton}`} style={{ width, height }} />;
		}
	};

	if (count === 1) {
		return <div className={className}>{getSkeletonElement()}</div>;
	}

	return (
		<div className={className}>
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} style={{ marginBottom: '12px' }}>
					{getSkeletonElement()}
				</div>
			))}
		</div>
	);
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
	return (
		<div className={className}>
			{Array.from({ length: lines }).map((_, i) => (
				<div
					key={i}
					className={`${styles.skeleton} ${styles.text}`}
					style={{ width: i === lines - 1 ? '60%' : '100%', marginBottom: '8px' }}
				/>
			))}
		</div>
	);
}

export function SkeletonCard({ className = '' }: { className?: string }) {
	return <SkeletonLoader variant="card" className={className} />;
}

export function SkeletonTable({ rows = 5, className = '' }: { rows?: number; className?: string }) {
	return <SkeletonLoader variant="table" count={rows} className={className} />;
}

export function SkeletonChart({ height = '300px', className = '' }: { height?: string; className?: string }) {
	return <SkeletonLoader variant="chart" height={height} className={className} />;
}
