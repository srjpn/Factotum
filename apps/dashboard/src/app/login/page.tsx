import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="login">
      <h1>Facto</h1>
      <p className="muted">Sign in to the control plane.</p>
      <LoginForm />
    </main>
  );
}
