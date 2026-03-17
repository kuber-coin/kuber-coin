'use client';

import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'custom';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  default: 'bg-[rgba(109,114,255,0.1)] text-[var(--kc-accent)] border-[rgba(109,114,255,0.14)]',
  success: 'bg-[rgba(22,148,125,0.12)] text-[var(--kc-good)] border-[rgba(22,148,125,0.18)]',
  warning: 'bg-[rgba(255,166,84,0.14)] text-[#c16b18] border-[rgba(255,166,84,0.2)]',
  danger: 'bg-[rgba(217,77,108,0.1)] text-[var(--kc-bad)] border-[rgba(217,77,108,0.18)]',
  info: 'bg-[rgba(104,214,243,0.14)] text-[#177f9b] border-[rgba(104,214,243,0.18)]',
  custom: '',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-xs',
  lg: 'px-4 py-1.5 text-sm',
};

export function Badge({ variant = 'default', size = 'md', className = '', style, children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.06em]',
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].filter(Boolean).join(' ')}
      style={style}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
