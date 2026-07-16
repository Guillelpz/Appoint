import type { ReactElement } from 'react';

export interface EmailMessage {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
