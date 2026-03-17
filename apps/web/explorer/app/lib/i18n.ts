/**
 * Lightweight i18n framework for KuberCoin Explorer.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from '@/app/lib/i18n';
 *   t('explorer.title')  // => "KuberCoin Explorer"
 */

// ── Locale files ────────────────────────────────────────────────

const locales: Record<string, Record<string, string>> = {
  en: {
    // -- Common
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.noData': 'No data available',
    'common.search': 'Search...',
    'common.clear': 'Clear',
    'common.close': 'Close',
    'common.copy': 'Copy',
    'common.copied': 'Copied!',
    'common.previous': 'Previous',
    'common.next': 'Next',
    'common.page': 'Page',
    'common.of': 'of',

    // -- Explorer
    'explorer.title': 'Kuber Explorer',
    'explorer.subtitle': 'Blockchain explorer for KuberCoin network',
    'explorer.searchPlaceholder': 'Search blocks, transactions, addresses...',
    'explorer.latestBlocks': 'Latest Blocks',
    'explorer.latestTransactions': 'Latest Transactions',
    'explorer.blockHeight': 'Block Height',
    'explorer.transactions': 'Transactions',
    'explorer.hash': 'Hash',
    'explorer.timestamp': 'Timestamp',
    'explorer.size': 'Size',
    'explorer.miner': 'Miner',
    'explorer.reward': 'Reward',
    'explorer.difficulty': 'Difficulty',
    'explorer.confirmations': 'Confirmations',
    'explorer.amount': 'Amount',
    'explorer.fee': 'Fee',
    'explorer.from': 'From',
    'explorer.to': 'To',
    'explorer.status': 'Status',
    'explorer.confirmed': 'Confirmed',
    'explorer.pending': 'Pending',

    // -- Wallet
    'wallet.title': 'Wallet',
    'wallet.balance': 'Balance',
    'wallet.send': 'Send',
    'wallet.receive': 'Receive',
    'wallet.address': 'Address',
    'wallet.amount': 'Amount',

    // -- Stats
    'stats.networkHashrate': 'Network Hashrate',
    'stats.blockTime': 'Block Time',
    'stats.totalSupply': 'Total Supply',
    'stats.marketCap': 'Market Cap',
    'stats.activeAddresses': 'Active Addresses',
    'stats.mempoolSize': 'Mempool Size',
  },

  es: {
    'common.loading': 'Cargando...',
    'common.error': 'Ocurrió un error',
    'common.noData': 'Sin datos disponibles',
    'common.search': 'Buscar...',
    'common.clear': 'Limpiar',
    'common.close': 'Cerrar',
    'common.copy': 'Copiar',
    'common.copied': '¡Copiado!',
    'common.previous': 'Anterior',
    'common.next': 'Siguiente',
    'common.page': 'Página',
    'common.of': 'de',
    'explorer.title': 'Explorador KuberCoin',
    'explorer.subtitle': 'Explorador de blockchain para la red KuberCoin',
    'explorer.searchPlaceholder': 'Buscar bloques, transacciones, direcciones...',
    'explorer.latestBlocks': 'Últimos Bloques',
    'explorer.latestTransactions': 'Últimas Transacciones',
    'explorer.blockHeight': 'Altura del Bloque',
    'explorer.transactions': 'Transacciones',
    'explorer.hash': 'Hash',
    'explorer.timestamp': 'Marca de tiempo',
    'explorer.size': 'Tamaño',
    'explorer.miner': 'Minero',
    'explorer.reward': 'Recompensa',
    'explorer.difficulty': 'Dificultad',
    'explorer.confirmations': 'Confirmaciones',
    'explorer.amount': 'Cantidad',
    'explorer.fee': 'Comisión',
    'explorer.from': 'De',
    'explorer.to': 'Para',
    'explorer.status': 'Estado',
    'explorer.confirmed': 'Confirmado',
    'explorer.pending': 'Pendiente',
    'wallet.title': 'Cartera',
    'wallet.balance': 'Saldo',
    'wallet.send': 'Enviar',
    'wallet.receive': 'Recibir',
    'wallet.address': 'Dirección',
    'wallet.amount': 'Cantidad',
    'stats.networkHashrate': 'Hashrate de la Red',
    'stats.blockTime': 'Tiempo de Bloque',
    'stats.totalSupply': 'Suministro Total',
    'stats.marketCap': 'Capitalización',
    'stats.activeAddresses': 'Direcciones Activas',
    'stats.mempoolSize': 'Tamaño del Mempool',
  },

  zh: {
    'common.loading': '加载中...',
    'common.error': '发生错误',
    'common.noData': '暂无数据',
    'common.search': '搜索...',
    'common.clear': '清除',
    'common.close': '关闭',
    'common.copy': '复制',
    'common.copied': '已复制！',
    'common.previous': '上一页',
    'common.next': '下一页',
    'common.page': '页',
    'common.of': '/',
    'explorer.title': 'KuberCoin 浏览器',
    'explorer.subtitle': 'KuberCoin 网络区块链浏览器',
    'explorer.searchPlaceholder': '搜索区块、交易、地址...',
    'explorer.latestBlocks': '最新区块',
    'explorer.latestTransactions': '最新交易',
    'explorer.blockHeight': '区块高度',
    'explorer.transactions': '交易',
    'explorer.hash': '哈希',
    'explorer.timestamp': '时间戳',
    'explorer.size': '大小',
    'explorer.miner': '矿工',
    'explorer.reward': '奖励',
    'explorer.difficulty': '难度',
    'explorer.confirmations': '确认数',
    'explorer.amount': '金额',
    'explorer.fee': '手续费',
    'explorer.from': '发送方',
    'explorer.to': '接收方',
    'explorer.status': '状态',
    'explorer.confirmed': '已确认',
    'explorer.pending': '待确认',
    'wallet.title': '钱包',
    'wallet.balance': '余额',
    'wallet.send': '发送',
    'wallet.receive': '接收',
    'wallet.address': '地址',
    'wallet.amount': '金额',
    'stats.networkHashrate': '全网算力',
    'stats.blockTime': '出块时间',
    'stats.totalSupply': '总供应量',
    'stats.marketCap': '市值',
    'stats.activeAddresses': '活跃地址',
    'stats.mempoolSize': '内存池大小',
  },
};

// ── Runtime state ───────────────────────────────────────────────

let currentLocale = 'en';

/** Set the active locale (e.g. 'en', 'es', 'zh'). */
export function setLocale(locale: string) {
  if (locales[locale]) {
    currentLocale = locale;
  }
}

/** Get the current locale code. */
export function getLocale(): string {
  return currentLocale;
}

/** Return all supported locale codes. */
export function getSupportedLocales(): string[] {
  return Object.keys(locales);
}

/**
 * Translate a key in the current locale.
 * Falls back to English, then returns the key itself if not found.
 */
export function t(key: string): string {
  return locales[currentLocale]?.[key] ?? locales['en']?.[key] ?? key;
}
