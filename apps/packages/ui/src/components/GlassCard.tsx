'use client';

import React from 'react';

export interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'gold' | 'success' | 'warning' | 'error' | 'editorial';
  hover?: boolean;
  onClick?: () => void;
}

const variantClasses = {
  default: 'border-[rgba(124,140,255,0.14)] hover:border-[rgba(124,140,255,0.28)]',
  gold: 'border-[rgba(255,166,84,0.2)] hover:border-[rgba(255,166,84,0.36)]',
  success: 'border-[rgba(22,148,125,0.2)] hover:border-[rgba(22,148,125,0.34)]',
  warning: 'border-[rgba(255,166,84,0.2)] hover:border-[rgba(255,166,84,0.36)]',
  error: 'border-[rgba(217,77,108,0.2)] hover:border-[rgba(217,77,108,0.34)]',
  editorial: 'border-[rgba(124,140,255,0.16)] hover:border-[rgba(124,140,255,0.3)]',
};

export function GlassCard({ children, className = '', variant = 'default', hover = true, onClick }: GlassCardProps) {
  const base = 'rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,246,255,0.95)_100%)] p-6 text-[var(--kc-text)] shadow-[0_25px_60px_rgba(93,106,165,0.12)] transition-all duration-300';
  const hoverClasses = hover ? 'hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(93,106,165,0.16)]' : '';
  const cursor = onClick ? 'cursor-pointer' : '';
  return <div className={[base, hoverClasses, variantClasses[variant], cursor, className].filter(Boolean).join(' ')} onClick={onClick}>{children}</div>;
}

export default GlassCard;
