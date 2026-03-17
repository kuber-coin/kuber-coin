'use client';

import { useRouter } from 'next/navigation';
import { Button, FeatureCard, HeroSection, StatCard } from '@kubercoin/ui';
import ExplorerClient from './components/ExplorerClient';

export default function Home() {
  const router = useRouter();

  return (
    <div className="overflow-hidden px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <HeroSection
          eyebrow="Kuber Explorer"
          title={<>Explore the <span>Kuber chain</span> — blocks, transactions, addresses.</>}
          description={<>The public explorer entry now starts with an editorial introduction that frames block lookup, mempool activity, and transaction tracing before the live explorer client takes over.</>}
          actions={
            <>
              <Button variant="primary" size="lg" onClick={() => document.getElementById('explorer-live')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Enter Explorer</Button>
              <Button variant="secondary" size="lg" onClick={() => router.push('/dashboard')}>Open Dashboard</Button>
              <Button variant="ghost" size="lg" onClick={() => router.push('/statistics')}>View Statistics</Button>
            </>
          }
          stats={
            <>
              <StatCard label="Blocks" value="Indexed" change="Height and hash lookup" changeType="positive" icon={<BlockIcon />} />
              <StatCard label="Transactions" value="Traceable" change="Search and inspect" changeType="neutral" icon={<TxIcon />} />
              <StatCard label="Mempool" value="Visible" change="Pending flow exposed" changeType="positive" icon={<MempoolIcon />} />
              <StatCard label="Addresses" value="Linked" change="Explorer handoffs ready" changeType="neutral" icon={<AddressIcon />} />
            </>
          }
          illustration={<ExplorerPreludeArt />}
        />

        <section className="grid gap-6 lg:grid-cols-3">
          <FeatureCard eyebrow="Blocks" title="Readable chain lookup" description="Make the first interaction about understanding the chain, then drop into raw hashes and detailed records below." accent="blue" icon={<BlockGlyph />} />
          <FeatureCard eyebrow="Transactions" title="Fast trace paths" description="Move from the entry surface to tx details, block pages, and mempool states without crossing into a different visual language." accent="gold" icon={<TraceIcon />} />
          <FeatureCard eyebrow="Public" title="Credible entry surface" description="The explorer now behaves like a real public homepage instead of opening immediately on an internal tool shell." accent="green" icon={<PublicIcon />} />
        </section>

        <section id="explorer-live" className="kc-paper-card p-6 sm:p-8 before:border-t-[5px] before:border-[#71c7ae]">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="kc-section-label">Live explorer</div>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[var(--kc-text-bright)]">Public prelude above the live explorer client.</h2>
              <p className="mt-3 max-w-2xl text-[var(--kc-muted-strong)] leading-7">The existing client remains in place below. This route now meets the redesign requirement by opening with branded Kuber context first.</p>
            </div>
          </div>
          <ExplorerClient />
        </section>
      </div>
    </div>
  );
}

function BlockIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}

function TxIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>;
}

function MempoolIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
}

function AddressIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 12h14M5 16h9" /></svg>;
}

function ExplorerPreludeArt() {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(241,248,246,0.95)_100%)]">
      <div className="absolute left-10 top-10 h-24 w-24 rounded-full bg-[rgba(113,199,174,0.24)] blur-2xl" />
      <div className="absolute right-12 bottom-12 h-28 w-28 rounded-full bg-[rgba(114,119,255,0.16)] blur-2xl" />
      <div className="absolute inset-x-10 bottom-10 top-24 rounded-[28px] border border-[rgba(124,140,255,0.14)] bg-white/84" />
      <div className="absolute left-16 top-16 h-16 w-36 rounded-[18px] border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute left-16 top-40 h-36 w-24 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(113,199,174,0.24)_0%,rgba(255,255,255,0.92)_100%)]" />
      <div className="absolute right-18 top-36 h-28 w-40 rounded-[26px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(114,119,255,0.14)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#71c7ae_0%,#8ad4be_100%)] text-white shadow-[0_22px_48px_rgba(76,166,140,0.24)]">
          <BlockGlyph />
        </div>
        <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">
          Explorer prelude
        </div>
      </div>
    </div>
  );
}

function BlockGlyph() {
  return <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}

function TraceIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m8-14h-2m2 0a2 2 0 012 2v2m-2-2l-6 6m0 0H9m2 0V9" /></svg>;
}

function PublicIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m9 9H3" /></svg>;
}
