import crypto from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { EmailJob } from '../models/EmailJob';
import { OTPRecord, type OTPType } from '../models/OTPRecord';
import { OTPThrottleState } from '../models/OTPThrottleState';

const EMAIL_SEND_TIMEOUT_MS = 10_000;
const EMAIL_DNS_TIMEOUT_MS = 5_000;
const EMAIL_JOB_LOCK_MS = 30_000;
const EMAIL_JOB_POLL_MS = 1_000;

interface OtpEmailPayload {
  email: string;
  name: string;
  otp: string;
  type: 'email_verify' | 'password_reset';
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

class OtpRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many OTP requests. Try again in ${retryAfterSeconds} seconds.`);
    this.name = 'OtpRateLimitError';
  }
}

class EmailDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly providerResponseCode?: number
  ) {
    super(code);
    this.name = 'EmailDeliveryError';
  }
}

class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(`EMAIL_CONFIGURATION_ERROR: ${message}`);
    this.name = 'EmailConfigurationError';
  }
}

interface EmailConfigurationStatus {
  provider: 'resend' | 'smtp';
  configured: boolean;
  errors: string[];
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
}

interface DiagnosticError extends Error {
  code?: string;
  command?: string;
  responseCode?: number;
  response?: string;
  syscall?: string;
  hostname?: string;
  host?: string;
  port?: number;
  address?: string;
  cause?: unknown;
}

let smtpTransporter: Transporter | null = null;
let workerBusy = false;

const getEmailConfigurationStatus = (): EmailConfigurationStatus => {
  const provider = config.email.resendApiKey ? 'resend' : 'smtp';
  const errors: string[] = [];
  const secureSetting = config.email.secure.trim().toLowerCase();
  const secure = secureSetting
    ? secureSetting === 'true'
    : config.email.port === 465;

  if (provider === 'resend') {
    if (!config.email.resendFrom) {
      errors.push('RESEND_FROM must be set to a sender address verified with Resend.');
    }
  } else {
    if (!config.email.host) errors.push('SMTP_HOST is required.');
    if (!Number.isInteger(config.email.port) || config.email.port < 1 || config.email.port > 65535) {
      errors.push('SMTP_PORT must be an integer between 1 and 65535.');
    }
    if (!config.email.user) errors.push('SMTP_USER or EMAIL_USER is required.');
    if (!config.email.pass) errors.push('SMTP_PASS or EMAIL_PASS is required.');

    if (secureSetting && secureSetting !== 'true' && secureSetting !== 'false') {
      errors.push('SMTP_SECURE must be either true or false.');
    } else if (config.email.port === 465 && !secure) {
      errors.push('SMTP_PORT=465 requires SMTP_SECURE=true (implicit TLS).');
    } else if ([25, 587].includes(config.email.port) && secure) {
      errors.push(`SMTP_PORT=${config.email.port} requires SMTP_SECURE=false (STARTTLS).`);
    } else if (!secureSetting && ![25, 465, 587].includes(config.email.port)) {
      errors.push('Set SMTP_SECURE explicitly when using a non-standard SMTP port.');
    }
  }

  return {
    provider,
    configured: errors.length === 0,
    errors,
    smtp: {
      host: config.email.host,
      port: config.email.port,
      secure,
    },
  };
};

const assertEmailConfiguration = (): EmailConfigurationStatus => {
  const status = getEmailConfigurationStatus();
  if (!status.configured) {
    throw new EmailConfigurationError(status.errors.join(' '));
  }
  return status;
};

const diagnosticString = (value: unknown): string | undefined => (
  typeof value === 'string' ? value : undefined
);

const safeDiagnosticText = (value: string, additionalSecrets: string[] = []): string => {
  let safeValue = value;
  for (const secret of [
    config.email.pass,
    config.email.user,
    config.email.resendApiKey,
    config.jwt.accessSecret,
    config.jwt.refreshSecret,
    ...additionalSecrets,
  ]) {
    if (secret) safeValue = safeValue.split(secret).join('[redacted]');
  }
  return safeValue
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(AUTH\s+(?:PLAIN|LOGIN)\s+)\S+/gi, '$1[redacted]')
    .slice(0, 500);
};

const asDiagnosticError = (error: unknown): DiagnosticError => (
  error instanceof Error ? error as DiagnosticError : new Error('Unknown SMTP error')
);

const logSmtpDiagnostic = (
  event: string,
  error: unknown,
  additionalSecrets: string[] = []
): DiagnosticError => {
  const smtpError = asDiagnosticError(error);
  const cause = smtpError.cause instanceof Error
    ? smtpError.cause as DiagnosticError
    : undefined;
  const status = getEmailConfigurationStatus();
  const safeString = (value: unknown): string | undefined => {
    const text = diagnosticString(value);
    return text ? safeDiagnosticText(text, additionalSecrets) : undefined;
  };

  console.error(event, {
    errorName: smtpError.name,
    errorCode: safeString(smtpError.code),
    command: safeString(smtpError.command),
    responseCode: Number.isInteger(smtpError.responseCode) ? smtpError.responseCode : undefined,
    response: safeString(smtpError.response),
    syscall: safeString(smtpError.syscall),
    hostname: safeString(smtpError.hostname || smtpError.host || status.smtp.host),
    port: Number.isInteger(smtpError.port) ? smtpError.port : status.smtp.port,
    address: safeString(smtpError.address),
    message: safeString(smtpError.message),
    cause: cause ? {
      errorName: cause.name,
      errorCode: safeString(cause.code),
      syscall: safeString(cause.syscall),
      hostname: safeString(cause.hostname || cause.host),
      port: Number.isInteger(cause.port) ? cause.port : undefined,
      address: safeString(cause.address),
      message: safeString(cause.message),
    } : undefined,
    connection: {
      secure: status.smtp.secure,
      tlsServername: status.smtp.host,
      connectionTimeoutMs: EMAIL_SEND_TIMEOUT_MS,
      greetingTimeoutMs: EMAIL_SEND_TIMEOUT_MS,
      dnsTimeoutMs: EMAIL_DNS_TIMEOUT_MS,
      socketTimeoutMs: EMAIL_SEND_TIMEOUT_MS,
    },
  });
  return smtpError;
};

const generateOTP = (): string => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const encryptPayload = (payload: OtpEmailPayload): string => {
  const key = crypto.createHash('sha256')
    .update('booklingo:otp-email-queue:v1:')
    .update(config.email.queueEncryptionSecret)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const encrypted: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return JSON.stringify(encrypted);
};

const decryptPayload = (value: string): OtpEmailPayload => {
  const encrypted = JSON.parse(value) as EncryptedPayload;
  const key = crypto.createHash('sha256')
    .update('booklingo:otp-email-queue:v1:')
    .update(config.email.queueEncryptionSecret)
    .digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as OtpEmailPayload;
};

const reserveOtpSend = async (identifier: string, type: OTPType): Promise<void> => {
  const now = new Date();
  const windowMs = config.otp.windowMinutes * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);
  const cooldownStart = new Date(now.getTime() - config.otp.resendCooldownSeconds * 1000);
  const stateId = crypto.createHash('sha256')
    .update(`${type}:${identifier.toLowerCase()}`)
    .digest('hex');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allowed = await OTPThrottleState.findOneAndUpdate(
      {
        _id: stateId,
        windowStartedAt: { $gt: windowStart },
        lastSentAt: { $lte: cooldownStart },
        sendCount: { $lt: config.otp.maxAttempts },
      },
      {
        $inc: { sendCount: 1 },
        $set: {
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { returnDocument: 'after' }
    ).lean();

    if (allowed) return;

    const reset = await OTPThrottleState.findOneAndUpdate(
      { _id: stateId, windowStartedAt: { $lte: windowStart } },
      {
        $set: {
          sendCount: 1,
          windowStartedAt: now,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { returnDocument: 'after' }
    ).lean();

    if (reset) return;

    try {
      await OTPThrottleState.create({
        _id: stateId,
        sendCount: 1,
        windowStartedAt: now,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + windowMs),
      });
      return;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  const state = await OTPThrottleState.findById(stateId).lean();
  const retryAt = state
    ? state.sendCount >= config.otp.maxAttempts
      ? new Date(state.windowStartedAt.getTime() + windowMs)
      : new Date(state.lastSentAt.getTime() + config.otp.resendCooldownSeconds * 1000)
    : new Date(now.getTime() + config.otp.resendCooldownSeconds * 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
  throw new OtpRateLimitError(retryAfterSeconds);
};

const emailHtml = (payload: OtpEmailPayload): string => {
  const verification = payload.type === 'email_verify';
  const title = verification ? 'Welcome to BookReader' : 'Password Reset';
  const intro = verification
    ? 'verify your email to start reading.'
    : 'use this code to reset your password.';
  return `
    <div style="font-family: 'Georgia', serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #faf8f5; color: #2d2d2d;">
      <h1 style="font-size: 24px; color: #5c4a32; margin-bottom: 8px;">${title}</h1>
      <p style="color: #6b6b6b; margin-bottom: 32px;">Hello ${escapeHtml(payload.name)}, ${intro}</p>
      <div style="background: #fff; border: 1px solid #e8e0d5; border-radius: 12px; padding: 32px; text-align: center;">
        <p style="color: #6b6b6b; font-size: 14px; margin-bottom: 16px;">Your code is:</p>
        <div style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #5c4a32; font-family: monospace;">${payload.otp}</div>
        <p style="color: #999; font-size: 13px; margin-top: 16px;">Expires in ${config.otp.expiryMinutes} minutes</p>
      </div>
      ${verification ? '<p style="color: #aaa; font-size: 12px; margin-top: 24px; text-align: center;">If you did not create an account, you can safely ignore this email.</p>' : ''}
    </div>
  `;
};

const createTransporter = (): Transporter => {
  const status = assertEmailConfiguration();
  if (status.provider !== 'smtp') throw new EmailConfigurationError('SMTP is not the configured provider.');

  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: status.smtp.secure,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: EMAIL_SEND_TIMEOUT_MS,
    greetingTimeout: EMAIL_SEND_TIMEOUT_MS,
    dnsTimeout: EMAIL_DNS_TIMEOUT_MS,
    socketTimeout: EMAIL_SEND_TIMEOUT_MS,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
};

const deliverEmail = async (payload: OtpEmailPayload): Promise<void> => {
  const subject = payload.type === 'email_verify'
    ? 'Verify your BookReader account'
    : 'Reset your BookReader password';
  const message = {
    to: payload.email,
    subject,
    html: emailHtml(payload),
  };

  if (config.email.resendApiKey) {
    if (!config.email.resendFrom) {
      throw new EmailDeliveryError('EMAIL_FROM_NOT_CONFIGURED', false);
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: config.email.resendFrom, ...message }),
        signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new EmailDeliveryError(code || 'EMAIL_NETWORK_ERROR', true);
    }

    if (!response.ok) {
      let providerMessage = response.statusText;
      try {
        const providerError = await response.json() as { message?: unknown };
        if (typeof providerError.message === 'string') {
            providerMessage = safeDiagnosticText(providerError.message, [payload.otp, payload.email]);
        }
      } catch {
        providerMessage = response.statusText || 'Provider returned a non-JSON error';
      }
      console.error('[OTP] Resend rejected email', {
        httpStatus: response.status,
        providerMessage: safeDiagnosticText(providerMessage, [payload.otp, payload.email]),
      });
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new EmailDeliveryError(`EMAIL_PROVIDER_HTTP_${response.status}`, retryable);
    }
    return;
  }

  try {
    smtpTransporter ??= createTransporter();
    const result = await smtpTransporter.sendMail({ from: config.email.from, ...message });
    if (!result.accepted?.length) {
      throw new EmailDeliveryError('SMTP_RECIPIENT_NOT_ACCEPTED', false);
    }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    const deliveryError = logSmtpDiagnostic(
      '[OTP] SMTP transport diagnostic',
      error,
      [payload.otp, payload.email]
    );
    const providerResponseCode = Number.isInteger(deliveryError.responseCode)
      ? deliveryError.responseCode
      : undefined;
    const cause = deliveryError.cause instanceof Error
      ? deliveryError.cause as DiagnosticError
      : undefined;
    const errorText = `${deliveryError.message} ${cause?.message || ''} ${cause?.code || ''}`;
    const permanentConfigurationFailure = /CERT_|ERR_TLS_|ERR_SSL_|ERR_OSSL_|certificate.*(?:invalid|expired|match)|self[- ]signed|unable to verify|unable to get local issuer|wrong version number|tlsv\d alert|ssl routines|\bENOTFOUND\b/i
      .test(errorText);
    const transientSocketCodes = new Set([
      'ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET',
      'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
    ]);
    const rootCode = cause?.code || deliveryError.code;
    const retryable = !permanentConfigurationFailure && (
      providerResponseCode !== undefined
        ? providerResponseCode >= 400 && providerResponseCode < 500
        : rootCode !== undefined && transientSocketCodes.has(rootCode)
    );
    const code = deliveryError.code && /^[A-Z0-9_]+$/.test(deliveryError.code)
      ? deliveryError.code
      : 'SMTP_DELIVERY_ERROR';
    throw new EmailDeliveryError(code, retryable, providerResponseCode);
  }
};

export const queueOtpEmail = async (
  email: string,
  name: string,
  type: 'email_verify' | 'password_reset'
): Promise<{ resendAfterSeconds: number }> => {
  const normalizedEmail = email.toLowerCase();
  console.info('[OTP] Email send requested', { type });
  assertEmailConfiguration();

  await reserveOtpSend(normalizedEmail, type);

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 10);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.otp.expiryMinutes * 60 * 1000);
  const challengeId = crypto.randomUUID();

  await OTPRecord.updateMany(
    { identifier: normalizedEmail, type, isUsed: false },
    { $set: { isUsed: true } }
  );
  await OTPRecord.findOneAndUpdate(
    { identifier: normalizedEmail, type },
    {
      $set: {
        otpHash,
        expiresAt,
        attempts: 0,
        isUsed: false,
        challengeId,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after', sort: { updatedAt: -1 } }
  );
  console.info('[OTP] Challenge saved', { type, challengeId });

  const job = await EmailJob.create({
    type,
    identifier: normalizedEmail,
    challengeId,
    encryptedPayload: encryptPayload({ email: normalizedEmail, name, otp, type }),
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
  });
  console.info('[OTP] Email job created', { jobId: job.id });

  return { resendAfterSeconds: config.otp.resendCooldownSeconds };
};

export type OTPVerificationResult = 'valid' | 'invalid' | 'expired' | 'too_many_attempts';

export const verifyOTP = async (
  identifier: string,
  otp: string,
  type: OTPType
): Promise<OTPVerificationResult> => {
  const normalizedIdentifier = identifier.toLowerCase();
  const now = new Date();
  const record = await OTPRecord.findOne({
    identifier: normalizedIdentifier,
    type,
    isUsed: false,
    expiresAt: { $gt: now },
  }).select('+otpHash').sort({ updatedAt: -1 });

  if (!record) {
    const previousChallenge = await OTPRecord.findOne({
      identifier: normalizedIdentifier,
      type,
    }).sort({ updatedAt: -1 });
    return previousChallenge && previousChallenge.attempts >= config.otp.verifyMaxAttempts
      ? previousChallenge.expiresAt > now ? 'too_many_attempts' : 'expired'
      : 'expired';
  }

  const attempt = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      attempts: { $lt: config.otp.verifyMaxAttempts },
      expiresAt: { $gt: now },
    },
    { $inc: { attempts: 1 } }
  );
  if (attempt.modifiedCount !== 1) return 'too_many_attempts';

  if (!await bcrypt.compare(otp, record.otpHash)) return 'invalid';

  const consumed = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    },
    { $set: { isUsed: true } }
  );
  return consumed.modifiedCount === 1 ? 'valid' : 'expired';
};

const claimNextEmailJob = async () => {
  const now = new Date();
  return EmailJob.findOneAndUpdate(
    {
      nextAttemptAt: { $lte: now },
      $or: [
        { status: 'queued' },
        { status: 'processing', lockedUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        lockedUntil: new Date(now.getTime() + EMAIL_JOB_LOCK_MS),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { nextAttemptAt: 1 } }
  ).select('+encryptedPayload');
};

type EmailJobProcessingResult =
  | { status: 'sent' | 'retrying' | 'empty' }
  | { status: 'failed'; errorCode: string };

const processNextEmailJob = async (): Promise<EmailJobProcessingResult> => {
  const job = await claimNextEmailJob();
  if (!job) return { status: 'empty' };

  const activeChallenge = await OTPRecord.findOne({
    identifier: job.identifier,
    type: job.type,
    challengeId: job.challengeId,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).select('expiresAt').lean();

  if (!activeChallenge) {
    await EmailJob.updateOne(
      { _id: job._id },
      { $set: { status: 'failed', lastErrorCode: 'OTP_CHALLENGE_EXPIRED' }, $unset: { lockedUntil: 1 } }
    );
    console.info('[OTP] Email job skipped because its challenge is no longer active', { jobId: job.id });
    return { status: 'failed', errorCode: 'OTP_CHALLENGE_EXPIRED' };
  }

  const provider = config.email.resendApiKey ? 'resend' : 'smtp';
  console.info('[OTP] Email sending started', {
    jobId: job.id,
    type: job.type,
    provider,
    attempt: job.attempts,
  });
  try {
    await deliverEmail(decryptPayload(job.encryptedPayload));
    await EmailJob.updateOne(
      { _id: job._id },
      { $set: { status: 'sent' }, $unset: { lockedUntil: 1, lastErrorCode: 1 } }
    );
    console.info('[OTP] Email provider accepted message', { jobId: job.id, provider });
    return { status: 'sent' };
  } catch (error) {
    const deliveryError = error instanceof EmailDeliveryError
      ? error
      : new EmailDeliveryError('EMAIL_JOB_ERROR', false);
    const delayMs = Math.min(5_000 * (2 ** Math.max(0, job.attempts - 1)), 60_000);
    const nextAttemptAt = new Date(Date.now() + delayMs);
    const shouldRetry = deliveryError.retryable && Boolean(
      activeChallenge && nextAttemptAt < activeChallenge.expiresAt
    );

    await EmailJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: shouldRetry ? 'queued' : 'failed',
          lastErrorCode: deliveryError.code.slice(0, 100),
          nextAttemptAt: shouldRetry ? nextAttemptAt : job.nextAttemptAt,
        },
        $unset: { lockedUntil: 1 },
      }
    );

    console.error('[OTP] Email sending failed', {
      jobId: job.id,
      errorCode: deliveryError.code,
      ...(deliveryError.providerResponseCode !== undefined && {
        providerResponseCode: deliveryError.providerResponseCode,
      }),
      retryable: deliveryError.retryable,
      attempt: job.attempts,
    });
    if (shouldRetry) {
      console.warn('[OTP] Retry attempt scheduled', {
        jobId: job.id,
        attempt: job.attempts + 1,
        delayMs,
      });
      return { status: 'retrying' };
    }
    return { status: 'failed', errorCode: deliveryError.code };
  }
};

export const startEmailWorker = (): void => {
  const drainQueue = async (): Promise<void> => {
    if (workerBusy || !getEmailConfigurationStatus().configured) return;
    workerBusy = true;
    try {
      for (let processed = 0; processed < 10; processed += 1) {
        const result = await processNextEmailJob();
        if (result.status === 'empty') break;
      }
    } catch (error) {
      console.error('[OTP] Email worker error:', error instanceof Error ? error.name : 'unknown error');
    } finally {
      workerBusy = false;
    }
  };

  const timer = setInterval(() => { void drainQueue(); }, EMAIL_JOB_POLL_MS);
  timer.unref();
  void drainQueue();
};

export const initializeEmailService = async (): Promise<void> => {
  const status = getEmailConfigurationStatus();
  console.info('[OTP] Email provider configuration', {
    provider: status.provider,
    configured: status.configured,
    ...(status.provider === 'smtp' && {
      host: status.smtp.host || undefined,
      port: status.smtp.port,
      secure: status.smtp.secure,
    }),
  });

  if (!status.configured) {
    console.error('[OTP] Email provider configuration is invalid', {
      provider: status.provider,
      errors: status.errors,
    });
    return;
  }
  if (status.provider !== 'smtp') return;

  try {
    smtpTransporter ??= createTransporter();
    await smtpTransporter.verify();
    console.info('[OTP] SMTP connection verified', {
      host: status.smtp.host,
      port: status.smtp.port,
      secure: status.smtp.secure,
    });
  } catch (error) {
    logSmtpDiagnostic('[OTP] SMTP startup verification failed', error);
  }
};
