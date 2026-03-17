'use client';

import React, { useState } from 'react';

export interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface GlobalHeaderProps {
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  navItems?: NavItem[];
  rightContent?: React.ReactNode;
  gradient?: string;
}

export function GlobalHeader({
  logo,
  title = 'Kuber',
  subtitle,
  navItems = [],
  rightContent,
  gradient = 'from-violet-500 to-indigo-400',
}: GlobalHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navBaseClass = 'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200';
  const navActiveClass = 'bg-violet-100 text-violet-700 shadow-[0_12px_28px_rgba(109,40,217,0.18)]';
  const navIdleClass = 'text-gray-500 hover:bg-violet-50 hover:text-violet-700';

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[rgba(108,92,231,0.15)] bg-white/90 shadow-[0_4px_24px_rgba(108,92,231,0.08)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(108,92,231,0)_0%,rgba(108,92,231,0.7)_50%,rgba(108,92,231,0)_100%)]" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <a href="https://kuber-coin.com" className="flex min-w-0 items-center gap-3">
          {logo || (
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br ${gradient} shadow-[0_18px_34px_rgba(57,91,212,0.34)]`}>
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <span className="block truncate text-lg font-extrabold tracking-[-0.03em] text-(--kc-text-bright) sm:text-xl">{title}</span>
            {subtitle ? <span className="block truncate text-sm text-(--kc-muted-strong)">{subtitle}</span> : null}
          </div>
        </a>

        {navItems.length > 0 ? (
          <nav className="hidden items-center gap-2 rounded-full border border-violet-100 bg-gray-50/80 p-2 shadow-[0_4px_16px_rgba(108,92,231,0.08)] md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`${navBaseClass} ${item.active ? navActiveClass : navIdleClass}`}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-3">
          {rightContent}
          {navItems.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-gray-50 text-gray-700 shadow-[0_4px_12px_rgba(108,92,231,0.1)] md:hidden"
              aria-expanded={isOpen}
              aria-label="Toggle navigation"
              onClick={() => setIsOpen((prev) => !prev)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'} />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      {isOpen && navItems.length > 0 ? (
        <div className="px-4 pb-4 md:hidden">
          <nav className="rounded-[28px] border border-[rgba(98,126,234,0.18)] bg-[linear-gradient(180deg,rgba(18,24,45,0.96)_0%,rgba(10,16,32,0.94)_100%)] p-3 shadow-[0_24px_52px_rgba(2,6,23,0.4)]">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className={`block rounded-2xl px-4 py-3 text-sm font-semibold ${item.active ? 'bg-[linear-gradient(135deg,rgba(98,126,234,0.24)_0%,rgba(95,166,255,0.14)_100%)] text-(--kc-text-bright)' : 'text-(--kc-muted-strong) hover:bg-[rgba(92,113,191,0.16)] hover:text-(--kc-text-bright)'}`} onClick={() => setIsOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export default GlobalHeader;
