import { NextResponse, type NextRequest } from 'next/server';
import { getEnv } from './lib/env';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';

// Redirects every request without a valid signed session to /login (Next.js 16 "proxy", formerly middleware).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const valid = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, getEnv().FACTO_SESSION_SECRET);
  if (pathname === '/login') {
    if (valid) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }
  if (!valid) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico|icon.svg).*)'] };
