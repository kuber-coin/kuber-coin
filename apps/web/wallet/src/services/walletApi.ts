import { API_ENDPOINTS } from '../lib/domains';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const API_BASE_URL =
  process.env.NEXT_PUBLIC_WALLET_API_URL ||
  API_ENDPOINTS.walletApi ||
  'http://localhost:8080';

const API_KEY = process.env.NEXT_PUBLIC_WALLET_API_KEY || '';

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
