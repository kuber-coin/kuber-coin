'use client';

import React, { useMemo } from 'react';
import styles from './BarChart.module.css';

interface DataItem {
	label: string;
	value: number;
	color?: string;
}

type BarChartProps = Readonly<{
	data: DataItem[];
	height?: number;
	horizontal?: boolean;
	direction?: 'vertical' | 'horizontal';
	showValues?: boolean;
	animated?: boolean;
	color?: string;
}>;

export function BarChart({
	data,
	height = 300,
	horizontal = false,
	direction,
	showValues = true,
	animated = true,
	color,
}: BarChartProps) {
	const isHorizontal = direction ? direction === 'horizontal' : horizontal;

	const maxValue = useMemo(() => {
		return Math.max(...data.map((d) => d.value), 1);
	}, [data]);

	if (data.length === 0) {
		return (
			<div className={styles.empty} style={{ height }}>
				<span>No data</span>
			</div>
		);
	}

	return (
		<div
			className={`${styles.container} ${isHorizontal ? styles.horizontal : ''}`}
			style={{ height }}
		>
			<div className={styles.chart}>
				{data.map((item, index) => {
					const percentage = (item.value / maxValue) * 100;
					const barColor = item.color || color || `hsl(${(index * 360) / data.length}, 70%, 60%)`;
					const delay = animated ? `${index * 0.1}s` : '0s';

					return (
						<div key={item.label} className={styles.barWrapper}>
							{isHorizontal ? (
								<>
									<div className={styles.labelHorizontal}>{item.label}</div>
									<div className={styles.barContainerHorizontal}>
										<div
											className={`${styles.bar} ${animated ? styles.animated : ''}`}
											style={{
												width: `${percentage}%`,
												background: barColor,
												animationDelay: delay,
											}}
										>
											{showValues && percentage > 15 && (
												<span className={styles.valueInside}>{item.value}</span>
											)}
										</div>
										{showValues && percentage <= 15 && (
											<span className={styles.valueOutside}>{item.value}</span>
										)}
									</div>
								</>
							) : (
								<>
									<div className={styles.barContainerVertical}>
										<div
											className={`${styles.barVertical} ${animated ? styles.animated : ''}`}
											style={{
												height: `${percentage}%`,
												background: barColor,
												animationDelay: delay,
											}}
										>
											{showValues && percentage > 15 && (
												<span className={styles.valueTop}>{item.value}</span>
											)}
										</div>
									</div>
									{showValues && percentage <= 15 && (
										<span className={styles.valueBelow}>{item.value}</span>
									)}
									<div className={styles.labelVertical}>{item.label}</div>
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
