import './globals.css';
import './premium-ui.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GlobalFooter, GlobalHeader } from '@kubercoin/ui';

const inter = Inter({ subsets: ['latin'] });

const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'http://localhost:3000',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'http://localhost:3250',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'http://localhost:3200',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3004',
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || 'http://localhost:3005',
  ops: process.env.NEXT_PUBLIC_OPS_URL || 'http://localhost:3300',
  node: process.env.NEXT_PUBLIC_NODE_URL || 'http://localhost:3100',
};

export const metadata: Metadata = {
  title: 'Kuber Node - API & Metrics',
  description: 'Node status, REST API, JSON-RPC, and Prometheus metrics',
};

const navItems = [
  { label: 'Main', href: DOMAINS.main },
  { label: 'Wallet', href: DOMAINS.wallet },
  { label: 'Explorer', href: DOMAINS.explorer },
  { label: 'Docs', href: DOMAINS.docs },
  { label: 'DApp', href: DOMAINS.dapp },
  { label: 'Ops', href: DOMAINS.ops },
  { label: 'Node', href: DOMAINS.node },
];

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  const { children } = props;

  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-white antialiased min-h-screen`}>
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        </div>

        <GlobalHeader
          title="Kuber Node"
          subtitle="API & Metrics"
          gradient="from-emerald-500 to-teal-500"
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
