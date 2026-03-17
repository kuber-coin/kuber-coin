'use client';

import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, change, changeType = 'neutral', icon, className = '' }: StatCardProps) {
  const changeColors = {
    positive: 'text-emerald-600',
    negative: 'text-rose-500',
    neutral: 'text-[var(--kc-muted-strong)]',
  };

  return (
    <div className={`rounded-[28px] border border-[rgba(124,140,255,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,246,255,0.95)_100%)] p-6 shadow-[0_25px_60px_rgba(93,106,165,0.12)] ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium uppercase tracking-[0.08em] text-[var(--kc-muted-strong)]">{label}</span>
        {icon ? <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(109,114,255,0.16)] bg-[rgba(109,114,255,0.1)] text-[var(--kc-accent)]">{icon}</div> : null}
      </div>
      <div className="mb-1 text-3xl font-bold text-[var(--kc-text-bright)]">{value}</div>
      {change ? <div className={`text-sm ${changeColors[changeType]}`}>{changeType === 'positive' ? '↑ ' : changeType === 'negative' ? '↓ ' : ''}{change}</div> : null}
    </div>
  );
}

export default StatCard;
