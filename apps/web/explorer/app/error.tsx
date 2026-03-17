'use client';

import React, { useEffect } from 'react';

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error(error);
	}, [error]);

	return (
		<div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
			<h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Something went wrong</h1>
			<p style={{ opacity: 0.85 }}>
				The explorer hit an unexpected error. You can try again, or refresh the page.
			</p>
			<div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
				<button
					type="button"
					onClick={() => reset()}
					style={{
						padding: '0.6rem 0.9rem',
						borderRadius: 10,
						border: '1px solid rgba(148, 163, 184, 0.25)',
						background: 'rgba(2, 6, 23, 0.6)',
						color: 'white',
						cursor: 'pointer',
					}}
				>
					Try again
				</button>
				<button
					type="button"
					onClick={() => window.location.reload()}
					style={{
						padding: '0.6rem 0.9rem',
						borderRadius: 10,
						border: '1px solid rgba(148, 163, 184, 0.25)',
						background: 'transparent',
						color: 'white',
						cursor: 'pointer',
					}}
				>
					Reload
				</button>
			</div>
			{process.env.NODE_ENV !== 'production' && (
				<pre
					style={{
						marginTop: '1rem',
						padding: '1rem',
						borderRadius: 12,
						overflow: 'auto',
						background: 'rgba(15, 23, 42, 0.75)',
						border: '1px solid rgba(148, 163, 184, 0.15)',
					}}
				>
					{String(error?.stack || error?.message || error)}
				</pre>
			)}
		</div>
	);
}

