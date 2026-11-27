'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/nodes', label: 'Nodes' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/activity', label: 'Activity' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
