"use client";

import {
    Activity,
    AlertCircle,
    BarChart3,
    Database,
    Droplets,
    ExternalLink,
    GitFork,
    Globe,
    Home,
    Network,
    Search,
    Server,
    Wallet,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Domain configuration
const DOMAINS = {
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.kuber-coin.com",
  explorer:
    process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.kuber-coin.com",
  docs: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.kuber-coin.com",
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || "https://dapp.kuber-coin.com",
};

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Web Wallet", href: "/wallet", icon: Wallet },
  { name: "Block Explorer", href: "/explorer", icon: Database },
  { name: "Transactions", href: "/transactions", icon: Search },
  { name: "Address / UTXO", href: "/address", icon: Activity },
  { name: "Mempool", href: "/mempool", icon: Zap },
  { name: "RPC Console", href: "/rpc", icon: Server },
  { name: "Node Status", href: "/node", icon: Activity },
  { name: "Network", href: "/network", icon: Network },
  { name: "Chain Health", href: "/health", icon: Globe },
  { name: "Metrics", href: "/metrics", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: AlertCircle },
  { name: "Faucet", href: "/faucet", icon: Droplets },
  { name: "Genesis", href: "/genesis", icon: Database },
  { name: "Forks", href: "/forks", icon: GitFork },
];

const externalLinks = [
  { name: "Wallet App", href: DOMAINS.wallet },
  { name: "Explorer", href: DOMAINS.explorer },
  { name: "Documentation", href: DOMAINS.docs },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white dark:bg-gray-800 shadow-lg flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-orange-500">KuberCoin</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Web Dashboard
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-orange-50 dark:bg-gray-700 text-orange-600 dark:text-orange-400 border-l-4 border-orange-500"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* External Links */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <p className="px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          External
        </p>
        {externalLinks.map((item) => (
          <a
            key={item.name}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-6 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <ExternalLink className="w-4 h-4 mr-3 opacity-50" />
            {item.name}
          </a>
        ))}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center justify-between mb-2">
            <span>Network</span>
            <span className="text-green-500 font-semibold"></span>
          </div>
          <div className="text-gray-500 dark:text-gray-500">
            Connected to local node
          </div>
        </div>
      </div>
    </div>
  );
}
