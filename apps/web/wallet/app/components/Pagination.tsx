'use client';

import React from 'react';
import styles from './Pagination.module.css';
import { Button } from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  itemsPerPage?: number;
  totalItems?: number;
  showPageInfo?: boolean;
  compact?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  itemsPerPage,
  totalItems,
  showPageInfo = true,
  compact = false,
}: Readonly<PaginationProps>) {
  const effectivePageSize = pageSize ?? itemsPerPage;
  const effectiveTotalPages =
    totalPages ??
    (totalItems && effectivePageSize
      ? Math.max(1, Math.ceil(totalItems / effectivePageSize))
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
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      {showPageInfo && effectivePageSize && totalItems && (
        <div className={styles.info}>
          Showing {Math.min((currentPage - 1) * effectivePageSize + 1, totalItems)} to{' '}
          {Math.min(currentPage * effectivePageSize, totalItems)} of {totalItems} items
        </div>
      )}
      
      <div className={styles.controls}>
        <Button
          variant="outline"
          size={compact ? 'sm' : 'md'}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          icon={<span>←</span>}
        >
          {!compact && 'Previous'}
        </Button>

        <div className={styles.pages}>
          {pages.map((page) => (
            <React.Fragment key={page.key}>
              {page.value === '...' ? (
                <span className={styles.ellipsis}>...</span>
              ) : (
                <button
                  className={`${styles.page} ${
                    page.value === currentPage ? styles.active : ''
                  }`}
                  onClick={() => onPageChange(page.value as number)}
                  disabled={page.value === currentPage}
                  type="button"
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
          icon={<span>→</span>}
        >
          {!compact && 'Next'}
        </Button>
      </div>
    </div>
  );
}
