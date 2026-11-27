import Link from 'next/link';
import { logout } from '../login/actions';
import { NavLinks } from '@/components/nav-links';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          Facto
        </Link>
        <NavLinks />
        <form action={logout}>
          <button type="submit" className="ghost">
            Log out
          </button>
        </form>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
