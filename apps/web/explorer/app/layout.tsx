import type { Metadata } from "next";
import "@kubercoin/ui/styles/globals";
import "@kubercoin/ui/styles/premium";
import "@kubercoin/ui/styles/editorial";
import GlobalFooter from "./components/GlobalFooter";
import GlobalHeader from "./components/GlobalHeader";
import "./globals.css";
import "./premium-ui.css";

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
  title: "Kuber Explorer",
  description: "Blockchain explorer for Kuber network - View blocks, transactions, and addresses",
  keywords: ["blockchain", "explorer", "kuber", "blocks", "transactions", "cryptocurrency"],
  authors: [{ name: "Kuber Team" }],
  openGraph: {
    title: "Kuber Explorer",
    description: "Blockchain explorer for Kuber network",
    type: "website",
    siteName: "Kuber",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen bg-white text-gray-900 antialiased">
        {/* Skip to main content link for keyboard / screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
        >
          Skip to main content
        </a>

        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-[rgba(125,131,255,0.16)] rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[rgba(196,156,255,0.14)] rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-0 w-64 h-64 bg-[rgba(126,215,236,0.12)] rounded-full blur-3xl" />
        </div>

        <GlobalHeader currentApp="explorer" />

        <main id="main-content" className="relative z-10 min-h-screen pt-24 pb-12" role="main">
          {children}
        </main>

        <GlobalFooter />
      </body>
    </html>
  );
}
