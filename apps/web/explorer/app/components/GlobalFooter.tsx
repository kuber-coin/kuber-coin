"use client";

// Inline SVG icons
const GithubIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path
      fillRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      clipRule="evenodd"
    />
  </svg>
);

const TwitterIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
  </svg>
);

const DiscordIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const ExternalLinkIcon = ({
  className = "w-3 h-3",
}: {
  className?: string;
}) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

// Domain configuration
const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || "https://kuber-coin.com",
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.kuber-coin.com",
  explorer:
    process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.kuber-coin.com",
  node: process.env.NEXT_PUBLIC_NODE_URL || "https://node.kuber-coin.com",
  rpc: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.kuber-coin.com",
  docs: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.kuber-coin.com",
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || "https://dapp.kuber-coin.com",
};

export default function GlobalFooter() {
  const currentYear = new Date().getFullYear();

  const productLinks = [
    { name: "Web Wallet", href: DOMAINS.wallet },
    { name: "Block Explorer", href: DOMAINS.explorer },
    { name: "dApp Platform", href: DOMAINS.dapp },
    { name: "Node API", href: DOMAINS.node },
  ];

  const developerLinks = [
    { name: "Documentation", href: DOMAINS.docs },
    { name: "API Reference", href: `${DOMAINS.docs}/api` },
    { name: "RPC Endpoint", href: DOMAINS.rpc },
    { name: "WebSocket API", href: `${DOMAINS.docs}/websocket` },
  ];

  const resourceLinks = [
    { name: "Getting Started", href: `${DOMAINS.docs}/getting-started` },
    { name: "FAQ", href: `${DOMAINS.docs}/faq` },
    { name: "Security", href: `${DOMAINS.docs}/security` },
    { name: "Brand Guidelines", href: `${DOMAINS.docs}/brand` },
  ];

  const socialLinks = [
    { name: "GitHub", href: "https://github.com/kubercoin", Icon: GithubIcon },
    {
      name: "Twitter",
      href: "https://twitter.com/kubercoin",
      Icon: TwitterIcon,
    },
    {
      name: "Discord",
      href: "https://discord.gg/kubercoin",
      Icon: DiscordIcon,
    },
  ];

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <a href={DOMAINS.main} className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">K</span>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Kuber
              </span>
            </a>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              A modern, secure cryptocurrency platform built for the future.
            </p>
            <div className="flex space-x-4">
              {socialLinks.map((link) => {
                const { Icon } = link;
                return (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    aria-label={link.name}
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Products */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Products
            </h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors flex items-center"
                  >
                    {link.name}
                    <ExternalLinkIcon className="w-3 h-3 ml-1 opacity-50" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Developers
            </h3>
            <ul className="space-y-3">
              {developerLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors flex items-center"
                  >
                    {link.name}
                    <ExternalLinkIcon className="w-3 h-3 ml-1 opacity-50" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Resources
            </h3>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors flex items-center"
                  >
                    {link.name}
                    <ExternalLinkIcon className="w-3 h-3 ml-1 opacity-50" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {currentYear} Kuber. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a
                href={`${DOMAINS.docs}/privacy`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Privacy Policy
              </a>
              <a
                href={`${DOMAINS.docs}/terms`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
