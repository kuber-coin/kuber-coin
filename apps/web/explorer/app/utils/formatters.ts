/**
 * Format a number as currency
 */
export function formatCurrency(
	amount: number,
	currency: string = 'KBR',
	decimals: number = 2
): string {
	const formatted = amount.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
	return `${formatted} ${currency}`;
}

/**
 * Format a large number with K, M, B suffixes
 */
export function formatCompactNumber(num: number): string {
	if (num < 1000) return num.toString();
	if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
	if (num < 1000000000) return `${(num / 1000000).toFixed(1)}M`;
	return `${(num / 1000000000).toFixed(1)}B`;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format a timestamp to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: Date | number | string): string {
	const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (Number.isNaN(seconds)) return 'unknown';
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
	if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
	if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
	return `${Math.floor(seconds / 31536000)} years ago`;
}

/**
 * Format a date
 */
export function formatDate(timestamp: Date | number | string, includeTime: boolean = true): string {
	const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	};

	if (includeTime) {
		options.hour = '2-digit';
		options.minute = '2-digit';
	}

	return date.toLocaleDateString('en-US', options);
}

/**
 * Truncate a hash or address for display
 */
export function truncateHash(hash: string, startLength: number = 8, endLength: number = 6): string {
	if (hash.length <= startLength + endLength) return hash;
	return `${hash.slice(0, startLength)}...${hash.slice(-endLength)}`;
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, decimals: number = 2): string {
	return `${value.toFixed(decimals)}%`;
}

/**
 * Format duration in seconds to human-readable
 */
export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

/**
 * Format a blockchain address with checksumming (basic version)
 */
export function formatAddress(address: string): string {
	if (!address || address.length < 10) return address;
	return address.toLowerCase();
}

/**
 * Parse and validate a number input
 */
export function parseNumberInput(value: string): number | null {
	const cleaned = value.replace(/[^0-9.]/g, '');
	const parsed = parseFloat(cleaned);
	return Number.isNaN(parsed) ? null : parsed;
}
