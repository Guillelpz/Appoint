import type { Metadata } from 'next';
import { signInAdminAction } from './actions';
import { LoginCard } from '@/components/LoginCard';
import { APP_VERSION } from '@/lib/app-version';

export const metadata: Metadata = {
  title: 'Panel de super-administración',
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <LoginCard
      title="Panel de super-administración"
      description="Accede con tu cuenta de super-admin."
      action={signInAdminAction}
      error={error}
      footer={<p className="text-xs text-slate-400">Versión {APP_VERSION}</p>}
    />
  );
}
