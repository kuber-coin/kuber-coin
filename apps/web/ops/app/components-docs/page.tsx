import React from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
import { Input } from '../components/Input';

export default function ComponentsDocsPage() {
	return (
		<AppLayout>
			<div style={{ display: 'grid', gap: 16, maxWidth: 980, margin: '0 auto' }}>
				<Card>
					<CardHeader title="Component Docs" subtitle="Quick visual sanity checks" />
					<CardBody>
						<p style={{ marginTop: 0, color: 'var(--muted)' }}>
							This page exists to exercise shared UI components during builds.
						</p>
						<Divider />
						<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
							<Badge variant="success">success</Badge>
							<Badge variant="warning">warning</Badge>
							<Badge variant="error">error</Badge>
							<Badge variant="info">info</Badge>
						</div>
						<Divider />
						<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
							<Button>Primary</Button>
							<Button variant="secondary">Secondary</Button>
							<Button variant="ghost">Ghost</Button>
						</div>
						<Divider />
						<Input label="Example input" placeholder="Type here..." />
					</CardBody>
				</Card>
			</div>
		</AppLayout>
	);
}
