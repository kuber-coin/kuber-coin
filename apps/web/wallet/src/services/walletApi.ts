import { API_ENDPOINTS } from '../lib/domains';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const API_BASE_URL =
  process.env.NEXT_PUBLIC_WALLET_API_URL ||
  API_ENDPOINTS.walletApi ||
  'http://localhost:8080';

// Never expose an API key via NEXT_PUBLIC_* — it would be embedded in the
// client JS bundle. Calls that require auth should go through the server-side
// Next.js API route proxy (app/api/), which reads KUBERCOIN_WALLET_API_KEY
// from the server environment.
const API_KEY = '';

async function request<T = JsonValue>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    const message = (data && data.error) || text || 'Wallet API request failed';
    throw new Error(message);
  }

  return data as T;
}

export const walletApi = {
  get: <T = JsonValue>(path: string) => request<T>(path),
  post: <T = JsonValue>(path: string, body: JsonValue) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export default walletApi;
