import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { FakeEmailSender } from '../../test/fake-email-sender';
import { sendOwnerInvitationEmail, type OwnerInvitationEmailContext } from './owner-invitation';

const BASE_CTX: OwnerInvitationEmailContext = {
  business: { name: 'Barbería Ejemplo', accentColor: '#B25539', logoUrl: null },
  ownerEmail: 'dueno@barberia-ejemplo.example',
  invitationUrl: 'http://localhost:3000/panel/invitacion?token_hash=abc123',
};

describe('sendOwnerInvitationEmail', () => {
  it('envía al email del dueño con el enlace de invitación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendOwnerInvitationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('dueno@barberia-ejemplo.example');
    expect(sender.sent[0].subject).toContain('Barbería Ejemplo');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Barbería Ejemplo');
    expect(text).toContain('http://localhost:3000/panel/invitacion?token_hash=abc123');
  });

  it('devuelve ok:false y no lanza si el envío falla', async () => {
    const failingSender = { send: async () => { throw new Error('fallo de red'); } };

    const result = await sendOwnerInvitationEmail(failingSender, BASE_CTX);

    expect(result.ok).toBe(false);
  });
});
