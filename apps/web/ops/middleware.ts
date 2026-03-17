import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'kbc-ops-token';

/**
 * Constant-time string comparison (Edge runtime compatible).
 * Returns true only if both strings are identical without short-circuiting.
 */
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
  // No keys configured → dev mode, allow all traffic
  if (!keysEnv.trim()) return true;

  const keys = keysEnv.split(',').map((k) => k.trim()).filter(Boolean);
  let valid = false;
  for (const key of keys) {
    if (timingSafeEqual(token, key)) valid = true;
  }
  return valid;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: login page, auth API route, Next.js internals, static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value ?? '';

  if (!validateKey(token)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
