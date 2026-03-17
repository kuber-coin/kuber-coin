import { NextResponse } from 'next/server';

const METRICS_URL = process.env.KUBERCOIN_PROMETHEUS_URL ?? 'http://localhost:9091/metrics';

function parsePrometheusText(text: string, keys: string[]) {
  const extracted: Record<string, number> = {};

  for (const key of keys) {
    const re = new RegExp(String.raw`^${key}\s+(-?\d+(?:\.\d+)?)$`, 'm');
    const m = re.exec(text);
    if (m?.[1]) extracted[key] = Number(m[1]);
  }

  return extracted;
}

export async function GET() {
  try {
    const res = await fetch(METRICS_URL, { cache: 'no-store' });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Metrics HTTP ${res.status}: ${t || res.statusText}`);
    }

    const text = await res.text();

    // These keys are examples; adjust as your exporter evolves.
    const keys = [
      'kubercoin_block_height',
      'kubercoin_mempool_size',
      'kubercoin_peers',
      'process_resident_memory_bytes',
    ];

    const extracted = parsePrometheusText(text, keys);

    return NextResponse.json({ ok: true, extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg });
  }
}
