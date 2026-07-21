'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { acceptOwnerInvitationAction } from './actions';

export function AcceptInvitationForm({ tokenHash }: { tokenHash: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await acceptOwnerInvitationAction({ tokenHash, password, confirmPassword });
      if (result && !result.ok) {
        setMessage(result.message);
        setPassword('');
        setConfirmPassword('');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <label className="block text-sm text-slate-700">
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-slate-700">
        Repite la contraseña
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Guardar y entrar
      </button>
    </form>
  );
}
