'use client';

import React, { useEffect, useId, useRef } from 'react';
import styles from './Modal.module.css';

type ModalSize = 'sm' | 'md' | 'lg';

function resolveModalWidth(size: ModalSize): string {
  switch (size) {
    case 'sm':
      return 'min(480px, 100%)';
    case 'lg':
      return 'min(960px, 100%)';
    case 'md':
    default:
      return 'min(720px, 100%)';
  }
}

interface ModalProps {
  title: string;
  open?: boolean;
  isOpen?: boolean;
  size?: ModalSize;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Modal({
  title,
  open,
  isOpen,
  size = 'md',
  onClose,
  children,
  className,
}: Readonly<ModalProps>) {
  const effectiveOpen = open ?? isOpen ?? false;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const modalWidth = resolveModalWidth(size);

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
        style={{ width: modalWidth }}
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
