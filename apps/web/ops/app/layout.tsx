import type { Metadata } from "next";
import { GlobalHeader, GlobalFooter } from '@kubercoin/ui';
import "@kubercoin/ui/styles/globals";
import "@kubercoin/ui/styles/premium";
import "@kubercoin/ui/styles/editorial";
import "./globals.css";
import "./premium-ui.css";

const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'http://localhost:3000',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'http://localhost:3250',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'http://localhost:3200',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3004',
};

const navItems = [
  { label: 'Main', href: DOMAINS.main },
  { label: 'Wallet', href: DOMAINS.wallet },
  { label: 'Explorer', href: DOMAINS.explorer },
  { label: 'Docs', href: DOMAINS.docs },
];

export const metadata: Metadata = {
  title: "KuberCoin Operations",
  description: "Operations dashboard for KuberCoin network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans bg-[var(--kc-bg1)] text-[var(--kc-text)] antialiased min-h-screen">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-[rgba(196,156,255,0.16)] rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[rgba(89,211,255,0.16)] rounded-full blur-3xl" />
        </div>

        <GlobalHeader 
          title="KuberCoin Operations" 
          gradient="from-indigo-400 via-blue-400 to-cyan-300"
          navItems={navItems}
        />

        <main className="relative z-10 pt-24 pb-12">
          {children}
        </main>
        
        <GlobalFooter />
      </body>
    </html>
  );
}
