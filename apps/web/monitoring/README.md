# KuberCoin Monitoring Web

Next.js dashboard for node health (RPC) and metrics (Prometheus).

## Run

```powershell
cd C:\kubercoin\monitoring-web
npm install
npm run dev
```

Open: http://localhost:3100

## Configuration

Copy `.env.example` to `.env.local` and adjust:

- `KUBERCOIN_RPC_URL` (default `http://localhost:8332`)
- `KUBERCOIN_RPC_USER` / `KUBERCOIN_RPC_PASS` (optional)
- `KUBERCOIN_PROMETHEUS_URL` (default `http://localhost:9091/metrics`)
- `NEXT_PUBLIC_REFRESH_MS` (default `5000`)

## Endpoints

- `GET /api/rpc` → aggregated RPC snapshot (height, best hash, peers, mempool)
- `GET /api/metrics` → fetches Prometheus text and extracts a few key values

## Notes

- The API routes act as a same-origin proxy, so the UI works even if your RPC/metrics endpoints do not enable CORS.
- If your metrics keys differ, update the `keys` list in `app/api/metrics/route.ts`.
