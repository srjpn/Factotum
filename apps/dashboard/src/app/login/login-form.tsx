'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="card stack">
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
