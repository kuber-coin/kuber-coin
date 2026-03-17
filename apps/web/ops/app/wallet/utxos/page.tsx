import React from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';

export default function WalletUtxosPage() {
	return (
		<AppLayout>
			<Card>
				<CardHeader title="UTXOs" subtitle="Wallet" />
				<CardBody>
					<p style={{ marginTop: 0, color: 'var(--muted)' }}>
						UTXO tooling is coming soon.
					</p>
				</CardBody>
			</Card>
		</AppLayout>
	);
}
