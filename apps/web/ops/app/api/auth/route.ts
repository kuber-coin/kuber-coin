import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'kbc-ops-token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function validateKey(token: string): boolean {
  const keysEnv = process.env.KUBERCOIN_API_KEYS ?? '';
  if (!keysEnv.trim()) return true;
  const keys = keysEnv.split(',').map((k) => k.trim()).filter(Boolean);
  let valid = false;
  for (const key of keys) {
    if (timingSafeEqual(token, key)) valid = true;
  }
  return valid;
}

// POST /api/auth — validate key, set cookie
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const key = typeof (body as Record<string, unknown>).key === 'string'
    ? ((body as Record<string, unknown>).key as string).trim()
    : '';

  if (!key || !validateKey(key)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, key, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

// GET /api/auth — logout (clear cookie)
export async function GET() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
