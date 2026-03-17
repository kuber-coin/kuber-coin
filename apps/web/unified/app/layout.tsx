import type { Metadata } from 'next';
import { GlobalHeader, GlobalFooter } from '@kubercoin/ui';
import './globals.css';
import './premium-ui.css';

const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'http://localhost:3000',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'http://localhost:3250',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'http://localhost:3200',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3004',
  ops: process.env.NEXT_PUBLIC_OPS_URL || 'http://localhost:3300',
};

const navItems = [
  { label: 'Wallet', href: DOMAINS.wallet },
  { label: 'Explorer', href: DOMAINS.explorer },
  { label: 'Ops', href: DOMAINS.ops },
  { label: 'Docs', href: DOMAINS.docs },
];

export const metadata: Metadata = {
  title: 'Kuber - Modern Cryptocurrency',
  description: 'A fast, secure, and developer-friendly Kuber platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-white text-gray-900 antialiased">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-400/5 rounded-full blur-3xl" />
        </div>

        <GlobalHeader
          title="Kuber"
          navItems={navItems}
        />

        <main className="relative z-10 min-h-screen pt-24 pb-12">
          {children}
        </main>

        <GlobalFooter />
      </body>
    </html>
  );
}
