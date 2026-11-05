import dns from 'node:dns';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { config } from '../config';

dns.setDefaultResultOrder('ipv4first');

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!config.email.user || !config.email.pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS must be configured.');
  }

  transporter ??= nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
  return transporter;
};

const sendWithResend = async (message: Omit<SendMailOptions, 'from'>): Promise<void> => {
  if (!config.email.resendFrom) {
    throw new Error('RESEND_FROM must be configured when RESEND_API_KEY is set.');
  }
  const to = Array.isArray(message.to) ? message.to : [message.to];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.resendFrom,
      to,
      subject: message.subject,
      ...(message.text && { text: message.text }),
      ...(message.html && { html: message.html }),
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend API returned ${response.status}: ${responseText}`);
  }
};

export const verifyEmailService = async (): Promise<void> => {
  if (config.email.resendApiKey) {
    if (!config.email.resendFrom) {
      throw new Error('RESEND_FROM must be configured when RESEND_API_KEY is set.');
    }
    return;
  }
  if (!config.email.user || !config.email.pass) {
    console.info('[Email] No email provider configured; password-reset emails are disabled.');
    return;
  }
  await getTransporter().verify();
};

export const sendEmail = async (message: Omit<SendMailOptions, 'from'>): Promise<void> => {
  if (config.email.resendApiKey) {
    await sendWithResend(message);
    console.info('[Email] Message sent with Resend');
    return;
  }

  const displayName = config.email.from.match(/^(.*?)\s*<[^>]+>$/)?.[1]?.trim()
    || config.email.from.trim()
    || 'BookLingo';
  const info = await getTransporter().sendMail({
    from: config.email.user
      ? `${displayName} <${config.email.user}>`
      : config.email.from,
    ...message,
  });
  console.info('[Email] Message sent with SMTP', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  });
};

export const sendTestEmail = (to: string): Promise<void> => sendEmail({
  to,
  subject: 'BookLingo SMTP test',
  text: 'This is a test email sent through Gmail SMTP using Nodemailer.',
  html: '<p>This is a test email sent through Gmail SMTP using Nodemailer.</p>',
});
