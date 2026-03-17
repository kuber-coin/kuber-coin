'use client';

import Link from 'next/link';
import { useState } from 'react';

// Inline SVG icons
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ExternalLinkIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

// Domain configuration - uses public-facing production domains by default
const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'https://kuber-coin.com',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'https://wallet.kuber-coin.com',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer.kuber-coin.com',
  node: process.env.NEXT_PUBLIC_NODE_URL || 'https://node.kuber-coin.com',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.kuber-coin.com',
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || 'https://dapp.kuber-coin.com',
};

interface GlobalHeaderProps {
  currentApp?: 'main' | 'wallet' | 'explorer' | 'docs' | 'dapp';
}

export default function GlobalHeader({ currentApp = 'main' }: GlobalHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Home', href: DOMAINS.main, key: 'main' },
    { name: 'Wallet', href: DOMAINS.wallet, key: 'wallet' },
    { name: 'Explorer', href: DOMAINS.explorer, key: 'explorer' },
    { name: 'dApp', href: DOMAINS.dapp, key: 'dapp' },
    { name: 'Docs', href: DOMAINS.docs, key: 'docs' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href={DOMAINS.main} className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">K</span>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Kuber
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${currentApp === link.key
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                `}
              >
                {link.name}
                {currentApp !== link.key && (
                  <ExternalLinkIcon className="inline-block w-3 h-3 ml-1 opacity-50" />
                )}
              </a>
            ))}
          </div>

          {/* API Status Indicator */}
          <div className="hidden md:flex items-center space-x-4">
            <a
              href={`${DOMAINS.node}/api/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span>API</span>
            </a>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-800">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  className={`
                    block px-4 py-3 rounded-lg text-base font-medium transition-colors
                    ${currentApp === link.key
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.name}
                  {currentApp !== link.key && (
                    <ExternalLinkIcon className="inline-block w-4 h-4 ml-2 opacity-50" />
                  )}
                </a>
              ))}
            </div>
            
            {/* Mobile API Status */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <a
                href={`${DOMAINS.node}/api/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span>API Status</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
