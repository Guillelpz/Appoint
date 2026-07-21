import type { EmailMessage, EmailSender } from './types';
import { trySend } from './appointment-notifications';
import { OwnerInvitationEmail } from './templates/OwnerInvitationEmail';

export interface OwnerInvitationEmailContext {
  business: {
    name: string;
    accentColor: string;
    logoUrl: string | null;
  };
  ownerEmail: string;
  invitationUrl: string;
}

export async function sendOwnerInvitationEmail(
  emailSender: EmailSender,
  ctx: OwnerInvitationEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.ownerEmail,
    subject: `Te han dado de alta como dueño de ${ctx.business.name} en Appoint`,
    react: (
      <OwnerInvitationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        invitationUrl={ctx.invitationUrl}
      />
    ),
  };

  return trySend(emailSender, message);
}
