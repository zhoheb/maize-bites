import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send: (message: EmailMessage) => Promise<void>;
}

export interface MailerOptions {
  /** Without a key, emails are logged instead of sent (local development). */
  apiKey?: string | undefined;
  from: string;
  logger: Pick<Console, 'info'>;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export function createMailer({ apiKey, from, logger }: MailerOptions): Mailer {
  if (!apiKey) {
    return {
      send: (m) => {
        logger.info(`[email:dev] to=${m.to} subject=${JSON.stringify(m.subject)}\n${m.text}`);
        return Promise.resolve();
      },
    };
  }
  const resend = new Resend(apiKey);
  return {
    send: async (m) => {
      const { error } = await resend.emails.send({
        from,
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
      });
      if (error) throw new EmailSendError(`Resend: ${error.message}`, error.statusCode);
    },
  };
}
