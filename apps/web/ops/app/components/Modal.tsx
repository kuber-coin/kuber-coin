"use client";

import React, { useEffect, useId, useRef } from 'react';
import styles from './Modal.module.css';

type ModalProps = Readonly<{
  title: string;
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | number;
}>;

function resolveModalWidth(size: ModalProps['size']): string | undefined {
  if (typeof size === 'number') return `${size}px`;
  if (size === 'sm') return '420px';
  if (size === 'md') return '560px';
  if (size === 'lg') return '720px';
  return undefined;
}

export function Modal({
  title,
  open,
  isOpen,
  onClose,
  children,
  className,
  size,
}: ModalProps) {
  const effectiveOpen = isOpen ?? open ?? false;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!effectiveOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // ignore
      }
    }

    return () => {
      try {
        if (dialog.open) dialog.close();
      } catch {
        // ignore
      }
    };
  }, [effectiveOpen]);

  if (!effectiveOpen) return null;

  const resolvedWidth = resolveModalWidth(size);

  return (
    <dialog
      ref={dialogRef}
      className={styles.overlay}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className={styles.backdropButton}
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close dialog"
      />
      <div
        className={`${styles.modal} ${className || ''}`.trim()}
        style={resolvedWidth ? { width: resolvedWidth, maxWidth: '95vw' } : undefined}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}

export default Modal;
