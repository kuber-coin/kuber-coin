'use client';

import { useRouter } from 'next/navigation';
import { Button, FeatureCard, HeroSection, StatCard } from '@kubercoin/ui';
import WalletClient from './components/WalletClient';

export default function Home() {
  const router = useRouter();

  return (
    <div className="overflow-hidden px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <HeroSection
          eyebrow="Kuber Wallet"
          title={<>Start with the <span>wallet prelude</span>, then drop into the live controls.</>}
          description={<>The root wallet route now opens with orientation first. Users see what this workspace is for, which actions matter most, and where the live wallet controls begin.</>}
          actions={
            <>
              <Button variant="primary" size="lg" onClick={() => document.getElementById('wallet-live')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Enter Workspace</Button>
              <Button variant="secondary" size="lg" onClick={() => router.push('/wallet/manage')}>Manage Wallets</Button>
              <Button variant="ghost" size="lg" onClick={() => router.push('/landing')}>View Landing</Button>
            </>
          }
          stats={
            <>
              <StatCard label="Wallet Files" value="Local" change="File-backed control" changeType="positive" icon={<FolderIcon />} />
              <StatCard label="Send Flow" value="Live" change="Broadcast from active wallet" changeType="positive" icon={<SendIcon />} />
              <StatCard label="History" value="Tracked" change="Filter by txid" changeType="neutral" icon={<HistoryIcon />} />
              <StatCard label="Addresses" value="Verifiable" change="Explorer handoff ready" changeType="neutral" icon={<AddressIcon />} />
            </>
          }
          illustration={<WalletWorkspaceArt />}
        />

        <section className="grid gap-6 lg:grid-cols-3">
          <FeatureCard eyebrow="Control" title="Active wallet context" description="The workspace centers around the selected wallet file, with send, receive, and balance updates staying tied to that choice." accent="gold" icon={<WalletGlyph />} />
          <FeatureCard eyebrow="Visibility" title="Immediate transaction review" description="Search recent transaction history, copy txids, and inspect details without leaving the wallet experience." accent="blue" icon={<InspectIcon />} />
          <FeatureCard eyebrow="Flow" title="Public-to-product continuity" description="This route now behaves like an entry surface first and a dense tool second, matching the broader Kuber redesign." accent="purple" icon={<FlowIcon />} />
        </section>

        <section id="wallet-live" className="kc-paper-card p-6 sm:p-8 before:border-t-[5px] before:border-[#7277ff]">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="kc-section-label">Live workspace</div>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[var(--kc-text-bright)]">Wallet controls start here.</h2>
              <p className="mt-3 max-w-2xl text-[var(--kc-muted-strong)] leading-7">The existing wallet client stays intact below. The new prelude simply gives this route a proper branded opening before the operational interface begins.</p>
            </div>
          </div>
          <WalletClient />
        </section>
      </div>
    </div>
  );
}

function FolderIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>;
}

function SendIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-9.193-5.106A1 1 0 004 6.94v10.12a1 1 0 001.559.832l9.193-6.724a1 1 0 000-1.6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12h6" /></svg>;
}

function HistoryIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-3.14-6.86M12 3v3m9 6h-3" /></svg>;
}

function AddressIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h2m10 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0H7" /></svg>;
}

function WalletWorkspaceArt() {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.7)_0%,rgba(242,246,255,0.95)_100%)]">
      <div className="absolute left-10 top-12 h-24 w-24 rounded-full bg-[rgba(114,119,255,0.2)] blur-2xl" />
      <div className="absolute right-12 top-10 h-20 w-20 rounded-full bg-[rgba(255,179,107,0.22)] blur-2xl" />
      <div className="absolute inset-x-10 bottom-10 top-24 rounded-[28px] border border-[rgba(124,140,255,0.14)] bg-white/84" />
      <div className="absolute left-14 top-18 h-14 w-28 rounded-[18px] border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute left-16 bottom-16 h-28 w-32 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(114,119,255,0.14)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="absolute right-20 bottom-16 h-36 w-28 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(255,179,107,0.24)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#7277ff_0%,#8d9bff_100%)] text-white shadow-[0_22px_48px_rgba(109,114,255,0.26)]">
          <WalletGlyph />
        </div>
        <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">
          Live wallet workspace
        </div>
      </div>
    </div>
  );
}

function WalletGlyph() {
  return <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
}

function InspectIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l6 6m-3-10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function FlowIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L10 16l-5-5" /></svg>;
}
