import type { ReactNode } from 'react';
import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { signOutAction } from '../login/actions';

const NAV_LINKS = [
  { href: '/panel', label: 'Agenda' },
  { href: '/panel/servicios', label: 'Servicios' },
  { href: '/panel/equipo', label: 'Equipo' },
  { href: '/panel/clientes', label: 'Clientes' },
  { href: '/panel/ajustes', label: 'Ajustes' },
];

export default async function PanelProtectedLayout({ children }: { children: ReactNode }) {
  const { email } = await requirePanelSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="font-medium text-slate-700 hover:text-slate-900">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{email}</span>
            <form action={signOutAction}>
              <button type="submit" className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
