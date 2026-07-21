import { AcceptInvitationForm } from './AcceptInvitationForm';

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash: tokenHash } = await searchParams;

  if (!tokenHash) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Enlace no válido</h1>
        <p className="text-sm text-slate-500">
          Este enlace de invitación no es válido. Pide al super-admin que te envíe uno nuevo.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Crea tu contraseña</h1>
        <p className="text-sm text-slate-500">Establece una contraseña para acceder al panel de tu negocio.</p>
      </div>
      <AcceptInvitationForm tokenHash={tokenHash} />
    </main>
  );
}
