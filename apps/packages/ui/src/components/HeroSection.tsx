'use client';

import React from 'react';

export interface HeroSectionProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  illustration?: React.ReactNode;
  className?: string;
}

export function HeroSection({ eyebrow, title, description, actions, stats, illustration, className = '' }: HeroSectionProps) {
  return (
    <section className={`grid gap-8 rounded-[36px] border border-[rgba(124,140,255,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,246,255,0.94)_100%)] p-6 shadow-[0_30px_80px_rgba(93,106,165,0.16)] lg:grid-cols-[1.1fr,0.9fr] lg:items-center lg:p-10 ${className}`}>
      <div className="space-y-6">
        {eyebrow ? <div className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--kc-accent)]">{eyebrow}</div> : null}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-[-0.05em] text-[var(--kc-text-bright)] sm:text-5xl">{title}</h1>
          {description ? <p className="max-w-2xl text-lg leading-8 text-[var(--kc-muted-strong)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-4">{actions}</div> : null}
        {stats ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats}</div> : null}
      </div>
      <div>{illustration}</div>
    </section>
  );
}

export default HeroSection;
