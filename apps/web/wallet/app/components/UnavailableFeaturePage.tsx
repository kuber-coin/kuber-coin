import Link from 'next/link';

type UnavailableFeaturePageProps = {
  title: string;
  summary: string;
  reason: string;
  availableNow: string[];
};

export function UnavailableFeaturePage({
  title,
  summary,
  reason,
  availableNow,
}: UnavailableFeaturePageProps) {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
          <div className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-200">
            Route retained, feature not shipped
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-4 text-lg text-slate-300">{summary}</p>
          <p className="mt-4 text-sm leading-7 text-slate-400">{reason}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-sky-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-sky-400"
            >
              Open live dashboard
            </Link>
            <Link
              href="/wallet/history"
              className="rounded-xl border border-slate-700 px-4 py-2 font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              View wallet history
            </Link>
            <Link
              href="/ops/node"
              className="rounded-xl border border-slate-700 px-4 py-2 font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Check node status
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Available now</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              {availableNow.map((item) => (
                <li key={item} className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">What would make this real</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                Node or wallet API endpoints that persist and validate feature state.
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                Server-side execution paths instead of browser-local storage or fallback mocks.
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                E2E coverage proving the workflow against a running KuberCoin node.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}