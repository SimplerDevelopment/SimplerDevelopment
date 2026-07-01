import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { Resend, type CreateEmailOptions } from 'resend';

type EmailAddress = string | string[];

export type EmailAttachment = {
  filename?: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
};

export type EmailPayload = {
  from: string;
  to: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: EmailAddress;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type EmailSendResponse = {
  data: { id: string } | null;
  error: { message: string } | null;
};

export type EmailTransport = {
  send(payload: EmailPayload): Promise<EmailSendResponse>;
};

type TransportOptions = {
  resendApiKey?: string;
};

let defaultTransport: EmailTransport | null = null;

function getTransportMode(): 'mailpit' | 'resend' {
  return process.env.EMAIL_TRANSPORT === 'mailpit' ? 'mailpit' : 'resend';
}

export function isMailpitEmailTransport(): boolean {
  return getTransportMode() === 'mailpit';
}

function createMailpitTransport(): EmailTransport {
  const transport = nodemailer.createTransport({
    host: process.env.MAILPIT_SMTP_HOST ?? 'localhost',
    port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    secure: false,
  });

  return {
    async send(payload) {
      const result = await transport.sendMail(payload as SendMailOptions);
      return { data: { id: result.messageId }, error: null };
    },
  };
}

function createResendTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);

  return {
    async send(payload) {
      const resendPayload: CreateEmailOptions = {
        ...payload,
        html: payload.html ?? '',
      };
      const result = await resend.emails.send(resendPayload);
      return {
        data: result.data?.id ? { id: result.data.id } : null,
        error: result.error?.message ? { message: result.error.message } : null,
      };
    },
  };
}

export function createEmailTransport(options: TransportOptions = {}): EmailTransport {
  if (getTransportMode() === 'mailpit') return createMailpitTransport();

  const key = options.resendApiKey ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return createResendTransport(key);
}

export function getEmailTransport(): EmailTransport {
  if (!defaultTransport) defaultTransport = createEmailTransport();
  return defaultTransport;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailSendResponse> {
  return getEmailTransport().send(payload);
}
