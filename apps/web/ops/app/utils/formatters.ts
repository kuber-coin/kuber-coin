export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes)) return 'unknown';
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return 'unknown';
	const s = Math.max(0, Math.floor(seconds));
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

export function formatRelativeTime(timestamp: Date | number | string): string {
	const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (Number.isNaN(seconds)) return 'unknown';
	if (seconds < 0) return 'just now';
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
	if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
	if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
	return `${Math.floor(seconds / 31536000)} years ago`;
}

export function truncateHash(hash: string, startLength: number = 8, endLength: number = 6): string {
	if (!hash) return '';
	if (hash.length <= startLength + endLength) return hash;
	return `${hash.slice(0, startLength)}...${hash.slice(-endLength)}`;
}
