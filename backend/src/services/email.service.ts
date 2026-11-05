import { config } from '../config';
import { sendEmail, verifySMTP } from '../utils/sendEmail';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]!));

export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const resetUrl = new URL('/reset-password', config.clientUrl);
  resetUrl.searchParams.set('email', email);
  resetUrl.searchParams.set('token', token);
  const link = resetUrl.toString();
  const escapedName = escapeHtml(name);
  const escapedLink = escapeHtml(link);

  await sendEmail({
    to: email,
    subject: 'Reset your BookLingo password',
    text: `Hello ${name},\n\nReset your BookLingo password by opening this link:\n${link}\n\nThis link expires in one hour. If you did not request a reset, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#2d2d2d"><h1>Password reset</h1><p>Hello ${escapedName},</p><p>Use this link to reset your password. It expires in one hour.</p><p><a href="${escapedLink}" style="display:inline-block;padding:12px 20px;background:#5c4a32;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p>If you did not request a reset, you can ignore this email.</p></div>`,
  });
};

export const initializeEmailService = async (): Promise<void> => {
  try {
    await verifySMTP();
    console.info('SMTP ready');
  } catch (error) {
    console.error('SMTP verification failed:', error);
  }
};
