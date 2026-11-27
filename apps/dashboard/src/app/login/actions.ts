'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { passwordMatches } from '@/lib/password';
import { cookieSecure, createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/session';
import { FAILED_LOGIN_DELAY_MS, loginThrottle } from '@/lib/throttle';

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const wait = loginThrottle.lockedForMs();
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 1000)} seconds.` };

  const env = getEnv();
  const given = form.get('password');
  if (typeof given !== 'string' || !passwordMatches(given, env.FACTO_DASHBOARD_PASSWORD)) {
    loginThrottle.recordFailure();
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
    return { error: 'Incorrect password.' };
  }

  loginThrottle.recordSuccess();
  const host = (await headers()).get('host');
  (await cookies()).set(SESSION_COOKIE, createSessionToken(env.FACTO_SESSION_SECRET), {
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieSecure(host, env.FACTO_COOKIE_SECURE),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect('/');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
