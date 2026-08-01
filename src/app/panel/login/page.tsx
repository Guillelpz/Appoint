import type { Metadata } from 'next';
import { signInAction } from './actions';
import { LoginCard } from '@/components/LoginCard';

export const metadata: Metadata = {
  title: 'Panel del negocio',
};

export default async function PanelLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <LoginCard
      title="Panel del negocio"
      description="Accede con la cuenta de dueño de tu negocio."
      action={signInAction}
      error={error}
    />
  );
}
