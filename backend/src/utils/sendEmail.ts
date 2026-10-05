import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!config.email.user || !config.email.pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured.');
  }

  transporter ??= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
  return transporter;
};

export const verifySMTP = async (): Promise<void> => {
  await getTransporter().verify();
};

export const sendEmail = async (message: Omit<SendMailOptions, 'from'>): Promise<void> => {
  const displayName = config.email.from.match(/^(.*?)\s*<[^>]+>$/)?.[1]?.trim() || 'BookLingo';
  const info = await getTransporter().sendMail({
    from: `${displayName} <${config.email.user}>`,
    ...message,
  });
  console.info('[SMTP] Message sent', {
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
