import type { Metadata } from "next";
import { GlobalFooter, GlobalHeader } from "@kubercoin/ui";
import "./globals.css";

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
  title: "Kuber Wallet",
  description: "Secure digital wallet for Kuber cryptocurrency",
  keywords: ["cryptocurrency", "wallet", "kuber", "blockchain", "digital currency"],
  authors: [{ name: "Kuber Team" }],
  openGraph: {
    title: "Kuber Wallet",
    description: "Secure digital wallet for Kuber cryptocurrency",
    type: "website",
    siteName: "Kuber",
  },
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(108, 92, 231, 0.06)' }} />
          <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(162, 155, 254, 0.07)' }} />
          <div className="absolute top-1/2 right-0 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(108, 92, 231, 0.04)' }} />
        </div>

        <GlobalHeader
          title="Kuber Wallet"
          subtitle="Wallet"
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
