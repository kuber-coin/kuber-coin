'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, FeatureCard, HeroSection } from '@kubercoin/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Invalid API key');
        return;
      }
      const from = searchParams.get('from') || '/';
      router.push(from);
      router.refresh();
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="kc-paper-card space-y-6 p-8 before:border-t-[5px] before:border-[#c49cff]">
      <div>
        <label htmlFor="key" className="mb-2 block text-sm font-medium text-[var(--kc-muted-strong)]">
          API Key
        </label>
        <input
          id="key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Enter API key"
          required
          autoComplete="current-password"
          className="w-full rounded-2xl border border-[rgba(124,140,255,0.14)] bg-white/88 px-4 py-3 font-mono text-sm text-[var(--kc-text-bright)] placeholder:text-[var(--kc-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(114,119,255,0.25)]"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-[rgba(217,77,108,0.24)] bg-[rgba(217,77,108,0.08)] px-4 py-3 text-sm text-[#b74e68]">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading || !key} className="w-full justify-center" size="lg">
        {loading ? 'Authenticating…' : 'Sign In'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="overflow-hidden px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <HeroSection
          eyebrow="KuberCoin operations access"
          title={<>Authenticate into the <span>operations workspace</span> without breaking the brand flow.</>}
          description={<>The ops login route is now part of the same KuberCoin editorial system. It explains the protected surface first, then hands off to the API-key gate used by the operations dashboard.</>}
          actions={
            <>
              <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">Protected by KUBERCOIN_API_KEYS</div>
            </>
          }
          stats={
            <>
              <FeatureCard eyebrow="Access" title="API key gate" description="Entry is limited to keys already configured in the KuberCoin operations environment." accent="purple" icon={<LockIcon />} className="h-full" />
              <FeatureCard eyebrow="Scope" title="Metrics and controls" description="After login, users land in dashboards for health, metrics, network state, and operational actions." accent="blue" icon={<OpsIcon />} className="h-full" />
            </>
          }
          illustration={<LoginArt />}
        />

        <section className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr] lg:items-start">
          <div className="space-y-6 px-2 pt-4 sm:px-0">
            <div className="kc-section-label">Before sign-in</div>
            <h2 className="text-4xl font-bold tracking-[-0.04em] text-[var(--kc-text-bright)]">Operations access now starts with a real prelude.</h2>
            <p className="max-w-xl text-[var(--kc-muted-strong)] leading-8">
              This route used to jump straight into a dark login card. It now explains that the page is protected, what unlocks after sign-in, and how that protection fits into the KuberCoin system.
            </p>
          </div>

          <Suspense fallback={
            <div className="kc-paper-card p-8 before:border-t-[5px] before:border-[#c49cff]">
              <div className="h-12 animate-pulse rounded-2xl bg-[rgba(124,140,255,0.12)]" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

function LockIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
}

function OpsIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>;
}

function LoginArt() {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(244,241,249,0.95)_100%)]">
      <div className="absolute left-10 top-10 h-24 w-24 rounded-full bg-[rgba(196,156,255,0.24)] blur-2xl" />
      <div className="absolute right-12 bottom-12 h-28 w-28 rounded-full bg-[rgba(114,119,255,0.18)] blur-2xl" />
      <div className="absolute inset-x-10 bottom-10 top-24 rounded-[28px] border border-[rgba(124,140,255,0.14)] bg-white/84" />
      <div className="absolute left-16 top-16 h-16 w-32 rounded-[18px] border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute left-16 top-40 h-24 w-24 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(196,156,255,0.22)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="absolute right-18 top-36 h-36 w-28 rounded-[26px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(114,119,255,0.16)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#8e74e9_0%,#b89aff_100%)] text-white shadow-[0_22px_48px_rgba(142,116,233,0.24)]">
          <LockIcon />
        </div>
        <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">
          Protected operations prelude
        </div>
      </div>
    </div>
  );
}
