import { signInAction } from './actions';

export default async function PanelLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Panel del negocio</h1>
        <p className="text-sm text-slate-500">Accede con la cuenta de dueño de tu negocio.</p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form action={signInAction} className="space-y-3">
        <label className="block text-sm text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-slate-700">
          Contraseña
          <input
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button type="submit" className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
