import React from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';

export default function WalletUtxosPage() {
	const sidebarItems = [
		{ icon: '💰', label: 'Wallet', href: '/dashboard' },
		{ icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
		{ icon: '📍', label: 'Addresses', href: '/wallet/addresses' },
		{ icon: '💎', label: 'UTXOs', href: '/wallet/utxos' },
		{ icon: '⚙️', label: 'Settings', href: '/settings' },
	];

	return (
		<AppLayout sidebarItems={sidebarItems}>
			<Card variant="glass">
				<CardHeader>
					<div>
						<h1 style={{ margin: 0 }}>UTXO Set</h1>
						<p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>
							View unspent outputs, maturity, and coin selection candidates.
						</p>
					</div>
				</CardHeader>
				<CardBody>
					<p style={{ margin: 0 }}>
						This page is scaffolded but not yet wired to live wallet data.
					</p>
				</CardBody>
			</Card>
		</AppLayout>
	);
}
