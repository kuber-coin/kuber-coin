'use client';

import React from 'react';
import styles from './Spinner.module.css';

interface SpinnerProps {
	size?: 'sm' | 'md' | 'lg';
	color?: string;
	label?: string;
}

function cx(...classes: Array<string | undefined | false>) {
	return classes.filter(Boolean).join(' ');
}

export function Spinner({ size = 'md', color, label }: SpinnerProps) {
	return (
		<div className={cx(styles.container, styles[size])}>
			<div
				className={styles.spinner}
				style={color ? { borderTopColor: color, borderRightColor: color } : undefined}
			/>
			{label && <span className={styles.label}>{label}</span>}
		</div>
	);
}
