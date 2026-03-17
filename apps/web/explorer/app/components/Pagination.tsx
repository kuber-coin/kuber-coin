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
  showPageInfo?: boolean;
  compact?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  pageSize,
  showPageInfo = false,
  compact = false,
}: Readonly<PaginationProps>) {
  const effectiveItemsPerPage = itemsPerPage ?? pageSize;
  const effectiveTotalPages =
    totalPages ??
    (typeof totalItems === 'number' && typeof effectiveItemsPerPage === 'number' && effectiveItemsPerPage > 0
      ? Math.max(1, Math.ceil(totalItems / effectiveItemsPerPage))
      : 1);

  const getPageItems = () => {
    const pages: Array<{ key: string; value: number | '...' }> = [];
    const maxVisible = compact ? 3 : 5;
    
    if (effectiveTotalPages <= maxVisible + 2) {
      for (let i = 1; i <= effectiveTotalPages; i++) {
        pages.push({ key: `page-${i}`, value: i });
      }
    } else {
      pages.push({ key: 'page-1', value: 1 });
      
      if (currentPage > 3) {
        pages.push({ key: 'ellipsis-start', value: '...' });
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(effectiveTotalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push({ key: `page-${i}`, value: i });
      }
      
      if (currentPage < effectiveTotalPages - 2) {
        pages.push({ key: 'ellipsis-end', value: '...' });
      }
      
      pages.push({ key: `page-${effectiveTotalPages}`, value: effectiveTotalPages });
    }
    
    return pages;
  };

  const pages = getPageItems();

  return (
    <nav aria-label="Pagination" className={`${styles.container} ${compact ? styles.compact : ''}`}>
      <div className={styles.controls}>
        <Button
          variant="outline"
          size={compact ? 'sm' : 'md'}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          icon={<span aria-hidden="true">←</span>}
          aria-label="Previous page"
        >
          {!compact && 'Previous'}
        </Button>

        <div className={styles.pages}>
          {pages.map((page) => (
            <React.Fragment key={page.key}>
              {page.value === '...' ? (
                <span className={styles.ellipsis} aria-hidden="true">...</span>
              ) : (
                <button
                  className={`${styles.page} ${
                    page.value === currentPage ? styles.active : ''
                  }`}
                  onClick={() => onPageChange(page.value as number)}
                  disabled={page.value === currentPage}
                  type="button"
                  aria-label={`Page ${page.value}`}
                  aria-current={page.value === currentPage ? 'page' : undefined}
                >
                  {page.value}
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
          icon={<span aria-hidden="true">→</span>}
          aria-label="Next page"
        >
          {!compact && 'Next'}
        </Button>
      </div>
    </nav>
  );
}
