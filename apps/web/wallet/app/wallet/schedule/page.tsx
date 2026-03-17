'use client';

import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function SchedulePage() {
  return (
    <UnavailableFeaturePage
      title="Scheduled transactions are not wired to the node"
      summary="Recurring, delayed, and conditional sends are not backed by a real server-side scheduler or wallet execution service."
      reason="The previous page stored scheduled sends in browser localStorage and did not execute them through an actual background worker or wallet daemon."
      availableNow={[
        'Use batch send for immediate multi-recipient payments.',
        'Use templates for local payment presets that prefill the real send flow.',
        'Use the live send page for actual transaction creation and broadcast.',
      ]}
    />
  );
}
