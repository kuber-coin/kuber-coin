'use client';

import React from 'react';
import styles from './Table.module.css';
import { CopyButton } from './CopyButton';

export interface TableColumn<T = any> {
  key: string;
  header?: string;
  label?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  copyable?: boolean;
}

interface TableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  getRowKey?: (row: T, index: number) => React.Key;
}

export function Table<T = any>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
  striped = true,
  hoverable = true,
  compact = false,
  getRowKey,
}: Readonly<TableProps<T>>) {
  const renderCellContent = (col: TableColumn<T>, value: any, row: T, rowIndex: number) => {
    if (col.render) return col.render(value, row, rowIndex);
    return value;
  };

  const getDefaultRowKey = (row: T, index: number): React.Key => {
    const candidate = row as any;
    const knownKey =
      candidate?.id ??
      candidate?.key ??
      candidate?.hash ??
      candidate?.txid ??
      candidate?.height ??
      candidate?.address;
    if (knownKey !== undefined && knownKey !== null) return String(knownKey);

    try {
      return JSON.stringify(row);
    } catch {
      return `row-${index}`;
    }
  };
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <table
          className={`${styles.table} ${striped ? styles.striped : ''} ${
            hoverable ? styles.hoverable : ''
          } ${compact ? styles.compact : ''}`}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    textAlign: col.align || 'left',
                  }}
                  className={col.sortable ? styles.sortable : ''}
                >
                  {col.header ?? col.label ?? ''}
                  {col.sortable && <span className={styles.sortIcon}>⇅</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={(getRowKey ?? getDefaultRowKey)(row, rowIndex)}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={onRowClick ? styles.clickable : ''}
              >
                {columns.map((col) => {
                  const value = (row as any)[col.key];
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {col.copyable ? (
                        <div className={styles.copyCell}>
                          <span className={styles.cellContent}>
                            {renderCellContent(col, value, row, rowIndex)}
                          </span>
                          <CopyButton text={String(value)} size="sm" />
                        </div>
                      ) : (
                        renderCellContent(col, value, row, rowIndex)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
