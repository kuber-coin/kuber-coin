'use client';

import React from 'react';

export interface FooterLink {
  label: string;
  href: string;
}

export interface GlobalFooterProps {
  links?: FooterLink[];
  copyright?: string;
}

export function GlobalFooter({
  links = [
    { label: 'Docs', href: 'https://docs.kuber-coin.com' },
    { label: 'GitHub', href: 'https://github.com/kubercoin' },
    { label: 'Discord', href: 'https://discord.gg/kubercoin' },
    { label: 'Twitter', href: 'https://twitter.com/kubercoin' },
  ],
  copyright = '© 2026 Kuber. All rights reserved.',
}: GlobalFooterProps) {
  return (
    <footer className="relative overflow-hidden px-6 pb-12 pt-20">
      <div className="pointer-events-none absolute left-1/2 top-6 h-40 w-40 -translate-x-1/2 rounded-full bg-[rgba(108,92,231,0.1)] blur-3xl" />
        <div className="mx-auto max-w-7xl rounded-[32px] border border-violet-100 bg-white px-6 py-10 shadow-[0_8px_40px_rgba(108,92,231,0.1)] sm:px-10">
        <div className="mb-8 h-px bg-[linear-gradient(90deg,rgba(108,92,231,0)_0%,rgba(108,92,231,0.5)_50%,rgba(108,92,231,0)_100%)]" />
        <div className="grid gap-10 lg:grid-cols-[1.2fr,0.8fr,0.8fr] lg:items-start">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-indigo-400 shadow-[0_8px_24px_rgba(108,92,231,0.3)]">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-500">Kuber</p>
                <p className="text-2xl font-bold tracking-[-0.03em] text-gray-900">Build on the Kuber network.</p>
              </div>
            </div>
            <p className="max-w-xl text-gray-500">Public infrastructure, wallet tools, explorer access, and operational visibility in one branded ecosystem.</p>
            <p className="text-sm text-gray-400">{copyright}</p>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-violet-500">Explore</h3>
            <div className="grid gap-3">
              {links.slice(0, 2).map((link) => (
                <a key={link.href} href={link.href} className="text-gray-500 transition-colors hover:text-violet-600" target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}>{link.label}</a>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-violet-500">Community</h3>
            <div className="grid gap-3">
              {links.slice(2).map((link) => (
                <a key={link.href} href={link.href} className="text-gray-500 transition-colors hover:text-violet-600" target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}>{link.label}</a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default GlobalFooter;
