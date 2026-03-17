"use client";

import React from "react";
import { AppLayout } from "./components/AppLayout";
import { Card, CardBody, CardHeader } from "./components/Card";
import { Button } from "./components/Button";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<AppLayout>
			<div style={{ maxWidth: 720, margin: "0 auto" }}>
				<Card>
					<CardHeader title="Something went wrong" subtitle="Ops Web" />
					<CardBody>
						<p style={{ marginTop: 0, color: "var(--muted)" }}>
							An unexpected error occurred while rendering this page.
						</p>
						<pre
							style={{
								whiteSpace: "pre-wrap",
								background: "rgba(0,0,0,0.25)",
								border: "1px solid rgba(255,255,255,0.08)",
								borderRadius: 12,
								padding: 12,
								overflow: "auto",
							}}
						>
							{error?.message ?? "Unknown error"}
						</pre>
						<div style={{ display: "flex", gap: 12, marginTop: 12 }}>
							<Button onClick={() => reset()}>Try again</Button>
						</div>
					</CardBody>
				</Card>
			</div>
		</AppLayout>
	);
}
