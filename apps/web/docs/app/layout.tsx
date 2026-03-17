import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GlobalFooter, GlobalHeader } from "@kubercoin/ui";
import "./globals.css";
import "./premium-ui.css";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

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
  title: "Kuber Documentation",
  description: "Official documentation for Kuber - API reference, guides, and tutorials",
  keywords: ["kuber", "documentation", "api", "cryptocurrency", "blockchain"],
};

const navItems = [
  { label: "Main", href: DOMAINS.main },
  { label: "Wallet", href: DOMAINS.wallet },
  { label: "Explorer", href: DOMAINS.explorer },
  { label: "Docs", href: DOMAINS.docs },
  { label: "DApp", href: DOMAINS.dapp },
  { label: "Ops", href: DOMAINS.ops },
  { label: "Node", href: DOMAINS.node },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen bg-white text-gray-900 antialiased`}>
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/4 rounded-full blur-3xl" />
        </div>

        <GlobalHeader
          title="Kuber Docs"
          subtitle="Docs"
          gradient="from-violet-500 to-indigo-400"
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
