'use client';

import React from 'react';
import styles from './Pagination.module.css';
import { Button } from './Button';

interface PaginationProps {
	currentPage: number;
	totalPages?: number;
	onPageChange: (page: number) => void;
	totalItems?: number;
	itemsPerPage?: number;
	pageSize?: number;
	compact?: boolean;
}

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	totalItems,
	itemsPerPage,
	pageSize,
	compact = false,
}: PaginationProps) {
	const effectiveItemsPerPage = itemsPerPage ?? pageSize;
	const effectiveTotalPages =
		totalPages ??
		(typeof totalItems === 'number' && typeof effectiveItemsPerPage === 'number' && effectiveItemsPerPage > 0
			? Math.max(1, Math.ceil(totalItems / effectiveItemsPerPage))
			: 1);

	const getPageNumbers = () => {
		const pages: (number | string)[] = [];
		const maxVisible = compact ? 3 : 5;

		if (effectiveTotalPages <= maxVisible + 2) {
			for (let i = 1; i <= effectiveTotalPages; i++) pages.push(i);
			return pages;
		}

		pages.push(1);
		if (currentPage > 3) pages.push('...');

		const start = Math.max(2, currentPage - 1);
		const end = Math.min(effectiveTotalPages - 1, currentPage + 1);
		for (let i = start; i <= end; i++) pages.push(i);

		if (currentPage < effectiveTotalPages - 2) pages.push('...');
		pages.push(effectiveTotalPages);

		return pages;
	};

	const pages = getPageNumbers();

	return (
		<div className={`${styles.container ?? ''} ${compact ? styles.compact ?? '' : ''}`.trim()}>
			<div className={styles.controls ?? ''}>
				<Button
					variant="outline"
					size={compact ? 'sm' : 'md'}
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
					icon={<span>←</span>}
				>
					{!compact && 'Previous'}
				</Button>

				<div className={styles.pages ?? ''}>
					{pages.map((page, index) => (
						<React.Fragment key={index}>
							{page === '...' ? (
								<span className={styles.ellipsis ?? ''}>...</span>
							) : (
								<button
									className={`${styles.page ?? ''} ${page === currentPage ? styles.active ?? '' : ''}`.trim()}
									onClick={() => onPageChange(page as number)}
									disabled={page === currentPage}
									type="button"
								>
									{page}
								</button>
							)}
						</React.Fragment>
					))}
				</div>

				<Button
					variant="outline"
					size={compact ? 'sm' : 'md'}
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === effectiveTotalPages}
					iconPosition="right"
					icon={<span>→</span>}
				>
					{!compact && 'Next'}
				</Button>
			</div>
		</div>
	);
}
