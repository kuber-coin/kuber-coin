'use client';

import React, { useEffect, useId, useRef } from 'react';
import styles from './Modal.module.css';

type ModalSize = 'sm' | 'md' | 'lg';

function resolveMaxWidth(size: ModalSize | undefined): number {
  switch (size) {
    case 'sm':
      return 420;
    case 'lg':
      return 720;
    case 'md':
    default:
      return 560;
  }
}

export default function Modal({
  title,
  open,
  isOpen,
  size,
  onCloseAction,
  children,
  className,
}: Readonly<{
  title: string;
  open?: boolean;
  isOpen?: boolean;
  size?: ModalSize;
  onCloseAction: () => void;
  children: React.ReactNode;
  className?: string;
}>) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const effectiveOpen = open ?? isOpen ?? false;
  const maxWidth = resolveMaxWidth(size);

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
        onCloseAction();
      }}
    >
      <button
        type="button"
        className={styles.backdropButton}
        onClick={onCloseAction}
        tabIndex={-1}
        aria-label="Close dialog"
      />
      <div
        className={`${styles.modal} ${className || ''}`.trim()}
        style={{ width: '100%', maxWidth }}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onCloseAction} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}

export { Modal };
