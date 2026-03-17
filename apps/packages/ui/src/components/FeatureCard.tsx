'use client';

import React from 'react';

export interface FeatureCardProps {
  eyebrow?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  accent?: 'blue' | 'gold' | 'green' | 'purple';
  className?: string;
}

const accentMap = {
  blue: 'before:border-[#7277ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,243,255,0.94)_100%)]',
  gold: 'before:border-[#ffb166] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,247,238,0.95)_100%)]',
  green: 'before:border-[#71c7ae] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,249,245,0.95)_100%)]',
  purple: 'before:border-[#b68dff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,240,255,0.95)_100%)]',
};

export function FeatureCard({ eyebrow, title, description, icon, accent = 'blue', className = '' }: FeatureCardProps) {
  return (
    <article className={`relative overflow-hidden rounded-[28px] border border-[rgba(124,140,255,0.14)] p-6 shadow-[0_25px_60px_rgba(93,106,165,0.12)] before:absolute before:left-0 before:right-0 before:top-0 before:h-[5px] ${accentMap[accent]} ${className}`}>
      <div className="relative z-10 space-y-4">
        {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-[var(--kc-accent)] shadow-[0_12px_24px_rgba(93,106,165,0.08)]">{icon}</div> : null}
        {eyebrow ? <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--kc-accent)]">{eyebrow}</div> : null}
        <h3 className="text-2xl font-bold tracking-[-0.03em] text-[var(--kc-text-bright)]">{title}</h3>
        <p className="leading-7 text-[var(--kc-muted-strong)]">{description}</p>
      </div>
    </article>
  );
}

export default FeatureCard;
