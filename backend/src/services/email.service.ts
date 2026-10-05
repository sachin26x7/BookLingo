import crypto from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import bcrypt from 'bcryptjs';

import { config } from '../config';
import { EmailJob } from '../models/EmailJob';
import { OTPRecord, type OTPType } from '../models/OTPRecord';
import { OTPThrottleState } from '../models/OTPThrottleState';

/**
 * Email / OTP timing configuration
 */
const EMAIL_SEND_TIMEOUT_MS = 10_000;
const EMAIL_DNS_TIMEOUT_MS = 5_000;

const EMAIL_JOB_LOCK_MS = 30_000;
const EMAIL_JOB_POLL_MS = 1_000;

/**
 * How long the API request waits for the email to be successfully
 * accepted by Resend/SMTP before leaving the job for the background worker.
 */
const EMAIL_JOB_RESULT_WAIT_MS = 12_000;
const EMAIL_JOB_RESULT_POLL_MS = 250;

/**
 * Maximum number of attempts we allow while the current HTTP request
 * is waiting. The background worker can continue afterward.
 */
const EMAIL_REQUEST_MAX_ATTEMPTS = 3;

/**
 * Initial retry delay used by the persistent queue.
 */
const EMAIL_RETRY_BASE_DELAY_MS = 5_000;

/**
 * Maximum retry delay.
 */
const EMAIL_RETRY_MAX_DELAY_MS = 60_000;

/**
 * OTP email payload
 */
interface OtpEmailPayload {
  email: string;
  name: string;
  otp: string;
  type: 'email_verify' | 'password_reset';
}

/**
 * Encrypted email payload
 */
interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * OTP rate-limit error
 */
export class OtpRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Too many OTP requests. Try again in ${retryAfterSeconds} seconds.`,
    );

    this.name = 'OtpRateLimitError';
  }
}

/**
 * Email delivery error
 */
export class EmailDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly providerResponseCode?: number,
  ) {
    super(code);

    this.name = 'EmailDeliveryError';
  }
}

/**
 * Reusable transporter.
 *
 * Nodemailer connection pooling means we don't need to create a new
 * SMTP connection for every OTP.
 */
let smtpTransporter: Transporter | null = null;

/**
 * Prevents overlapping queue drains inside the same Node process.
 *
 * MongoDB locking still protects us when multiple Node processes/instances
 * are running.
 */
let workerBusy = false;

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
const generateOTP = (): string => {
  return crypto
    .randomInt(0, 1_000_000)
    .toString()
    .padStart(6, '0');
};

/**
 * Escape user-controlled values before inserting them into HTML.
 */
const escapeHtml = (value: string): string => {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
};

/**
 * Encrypt OTP email payload before putting it into MongoDB.
 */
const encryptPayload = (payload: OtpEmailPayload): string => {
  const key = crypto
    .createHash('sha256')
    .update('booklingo:otp-email-queue:v1:')
    .update(config.email.queueEncryptionSecret)
    .digest();

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    key,
    iv,
  );

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

/**
 * Decrypt OTP email payload.
 */
const decryptPayload = (value: string): OtpEmailPayload => {
  const encrypted = JSON.parse(value) as EncryptedPayload;

  const key = crypto
    .createHash('sha256')
    .update('booklingo:otp-email-queue:v1:')
    .update(config.email.queueEncryptionSecret)
    .digest();

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encrypted.iv, 'base64'),
  );

  decipher.setAuthTag(
    Buffer.from(encrypted.tag, 'base64'),
  );

  const plaintext = Buffer.concat([
    decipher.update(
      Buffer.from(encrypted.ciphertext, 'base64'),
    ),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext) as OtpEmailPayload;
};

/**
 * Reserve an OTP send slot.
 *
 * Important:
 * This limits OTP REQUESTS, not successful email deliveries.
 * This is intentional because otherwise a user could spam the email
 * provider whenever delivery fails.
 */
const reserveOtpSend = async (
  identifier: string,
  type: OTPType,
): Promise<void> => {
  const now = new Date();

  const windowMs =
    config.otp.windowMinutes * 60 * 1000;

  const windowStart = new Date(
    now.getTime() - windowMs,
  );

  const cooldownStart = new Date(
    now.getTime() -
      config.otp.resendCooldownSeconds * 1000,
  );

  const stateId = crypto
    .createHash('sha256')
    .update(`${type}:${identifier.toLowerCase()}`)
    .digest('hex');

  /**
   * We retry a few times because two requests may race to create/reset
   * the same throttle document.
   */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allowed = await OTPThrottleState.findOneAndUpdate(
      {
        _id: stateId,

        windowStartedAt: {
          $gt: windowStart,
        },

        lastSentAt: {
          $lte: cooldownStart,
        },

        sendCount: {
          $lt: config.otp.maxAttempts,
        },
      },
      {
        $inc: {
          sendCount: 1,
        },

        $set: {
          lastSentAt: now,
          expiresAt: new Date(
            now.getTime() + windowMs,
          ),
        },
      },
      {
        returnDocument: 'after',
      },
    ).lean();

    if (allowed) {
      return;
    }

    /**
     * Existing rate-limit window expired.
     * Start a new window.
     */
    const reset = await OTPThrottleState.findOneAndUpdate(
      {
        _id: stateId,

        windowStartedAt: {
          $lte: windowStart,
        },
      },
      {
        $set: {
          sendCount: 1,
          windowStartedAt: now,
          lastSentAt: now,
          expiresAt: new Date(
            now.getTime() + windowMs,
          ),
        },
      },
      {
        returnDocument: 'after',
      },
    ).lean();

    if (reset) {
      return;
    }

    /**
     * First request for this identifier.
     */
    try {
      await OTPThrottleState.create({
        _id: stateId,
        sendCount: 1,
        windowStartedAt: now,
        lastSentAt: now,
        expiresAt: new Date(
          now.getTime() + windowMs,
        ),
      });

      return;
    } catch (error) {
      /**
       * Another concurrent request created the document.
       * Try again.
       */
      if (
        (error as { code?: number }).code !== 11000
      ) {
        throw error;
      }
    }
  }

  const state = await OTPThrottleState.findById(
    stateId,
  ).lean();

  const retryAt = state
    ? state.sendCount >= config.otp.maxAttempts
      ? new Date(
          state.windowStartedAt.getTime() +
            config.otp.windowMinutes * 60 * 1000,
        )
      : new Date(
          state.lastSentAt.getTime() +
            config.otp.resendCooldownSeconds * 1000,
        )
    : new Date(
        now.getTime() +
          config.otp.resendCooldownSeconds * 1000,
      );

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (retryAt.getTime() - Date.now()) / 1000,
    ),
  );

  throw new OtpRateLimitError(
    retryAfterSeconds,
  );
};

/**
 * OTP email HTML.
 */
const emailHtml = (
  payload: OtpEmailPayload,
): string => {
  const verification =
    payload.type === 'email_verify';

  const title = verification
    ? 'Welcome to BookReader'
    : 'Password Reset';

  const intro = verification
    ? 'verify your email to start reading.'
    : 'use this code to reset your password.';

  return `
    <div
      style="
        font-family: Georgia, serif;
        max-width: 480px;
        margin: 0 auto;
        padding: 40px 20px;
        background: #faf8f5;
        color: #2d2d2d;
      "
    >
      <h1
        style="
          font-size: 24px;
          color: #5c4a32;
          margin-bottom: 8px;
        "
      >
        ${title}
      </h1>

      <p
        style="
          color: #6b6b6b;
          margin-bottom: 32px;
        "
      >
        Hello ${escapeHtml(payload.name)}, ${intro}
      </p>

      <div
        style="
          background: #fff;
          border: 1px solid #e8e0d5;
          border-radius: 12px;
          padding: 32px;
          text-align: center;
        "
      >
        <p
          style="
            color: #6b6b6b;
            font-size: 14px;
            margin-bottom: 16px;
          "
        >
          Your code is:
        </p>

        <div
          style="
            font-size: 40px;
            font-weight: bold;
            letter-spacing: 12px;
            color: #5c4a32;
            font-family: monospace;
          "
        >
          ${escapeHtml(payload.otp)}
        </div>

        <p
          style="
            color: #999;
            font-size: 13px;
            margin-top: 16px;
          "
        >
          Expires in ${config.otp.expiryMinutes} minutes
        </p>
      </div>

      ${
        verification
          ? `
            <p
              style="
                color: #aaa;
                font-size: 12px;
                margin-top: 24px;
                text-align: center;
              "
            >
              If you did not create an account,
              you can safely ignore this email.
            </p>
          `
          : ''
      }
    </div>
  `;
};

/**
 * Create SMTP transporter.
 */
const createTransporter = (): Transporter => {
  if (
    !config.email.user ||
    !config.email.pass
  ) {
    throw new EmailDeliveryError(
      'EMAIL_NOT_CONFIGURED',
      false,
    );
  }

  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,

    secure: config.email.port === 465,

    pool: true,

    maxConnections: 3,
    maxMessages: 100,

    connectionTimeout:
      EMAIL_SEND_TIMEOUT_MS,

    greetingTimeout:
      EMAIL_SEND_TIMEOUT_MS,

    dnsTimeout:
      EMAIL_DNS_TIMEOUT_MS,

    socketTimeout:
      EMAIL_SEND_TIMEOUT_MS,

    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
};

/**
 * Determine whether an SMTP response code is transient.
 *
 * SMTP 4xx errors are generally temporary.
 * SMTP 5xx errors are generally permanent.
 */
const isRetryableSmtpResponse = (
  responseCode?: number,
): boolean => {
  if (!responseCode) {
    return false;
  }

  return (
    responseCode >= 400 &&
    responseCode < 500
  );
};

/**
 * Send the actual email through Resend or SMTP.
 */
const deliverEmail = async (
  payload: OtpEmailPayload,
): Promise<void> => {
  const subject =
    payload.type === 'email_verify'
      ? 'Verify your BookReader account'
      : 'Reset your BookReader password';

  const message = {
    to: payload.email,
    subject,
    html: emailHtml(payload),
  };

  /**
   * Resend
   */
  if (config.email.resendApiKey) {
    if (!config.email.resendFrom) {
      throw new EmailDeliveryError(
        'EMAIL_FROM_NOT_CONFIGURED',
        false,
      );
    }

    let response: Response;

    try {
      response = await fetch(
        'https://api.resend.com/emails',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${config.email.resendApiKey}`,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            from: config.email.resendFrom,
            ...message,
          }),

          signal: AbortSignal.timeout(
            EMAIL_SEND_TIMEOUT_MS,
          ),
        },
      );
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error
          ? String(
              (error as NodeJS.ErrnoException).code ||
                '',
            )
          : '';

      throw new EmailDeliveryError(
        code || 'EMAIL_NETWORK_ERROR',
        true,
      );
    }

    if (!response.ok) {
      let providerMessage =
        response.statusText ||
        'Resend returned an error';

      try {
        const providerError =
          (await response.json()) as {
            message?: unknown;
          };

        if (
          typeof providerError.message ===
          'string'
        ) {
          providerMessage =
            providerError.message
              /**
               * Remove email addresses from logs.
               */
              .replace(
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
                '[recipient]',
              )
              .slice(0, 300);
        }
      } catch {
        /**
         * Keep statusText if response isn't JSON.
         */
      }

      console.error(
        '[OTP] Resend rejected email',
        {
          httpStatus: response.status,
          providerMessage,
        },
      );

      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      throw new EmailDeliveryError(
        `EMAIL_PROVIDER_HTTP_${response.status}`,
        retryable,
      );
    }

    return;
  }

  /**
   * SMTP
   */
  try {
    smtpTransporter ??= createTransporter();

    await smtpTransporter.sendMail({
      from: config.email.from,
      ...message,
    });
  } catch (error) {
    if (
      error instanceof EmailDeliveryError
    ) {
      throw error;
    }

    const deliveryError =
      error as NodeJS.ErrnoException & {
        responseCode?: number;
        response?: string;
      };

    const providerResponseCode =
      Number.isInteger(
        deliveryError.responseCode,
      )
        ? deliveryError.responseCode
        : undefined;

    const retryableCodes = new Set([
      'ECONNECTION',
      'ECONNRESET',
      'ETIMEDOUT',
      'ESOCKET',
      'EAI_AGAIN',
      'ENETUNREACH',
      'EHOSTUNREACH',
    ]);

    const retryable =
      Boolean(
        deliveryError.code &&
          retryableCodes.has(
            deliveryError.code,
          ),
      ) ||
      isRetryableSmtpResponse(
        providerResponseCode,
      );

    const code =
      deliveryError.code &&
      /^[A-Z0-9_]+$/.test(
        deliveryError.code,
      )
        ? deliveryError.code
        : 'SMTP_DELIVERY_ERROR';

    throw new EmailDeliveryError(
      code,
      retryable,
      providerResponseCode,
    );
  }
};

/**
 * Queue an OTP email.
 *
 * The OTP is stored first and the email is placed into MongoDB.
 * We then attempt delivery immediately.
 *
 * If the provider temporarily fails, the request waits for the
 * persistent worker to retry instead of immediately telling the
 * frontend that the OTP failed.
 */
export const queueOtpEmail = async (
  email: string,
  name: string,
  type:
    | 'email_verify'
    | 'password_reset',
): Promise<{
  resendAfterSeconds: number;
}> => {
  const normalizedEmail =
    email.trim().toLowerCase();

  console.info(
    '[OTP] Email send requested',
    {
      type,
    },
  );

  /**
   * Validate email configuration before consuming
   * an OTP request slot.
   */
  if (
    config.email.resendApiKey
      ? !config.email.resendFrom
      : !config.email.user ||
        !config.email.pass
  ) {
    throw new EmailDeliveryError(
      config.email.resendApiKey
        ? 'RESEND_FROM_NOT_CONFIGURED'
        : 'EMAIL_NOT_CONFIGURED',
      false,
    );
  }

  /**
   * Rate-limit the request.
   */
  await reserveOtpSend(
    normalizedEmail,
    type,
  );

  /**
   * Generate and hash OTP.
   */
  const otp = generateOTP();

  const otpHash = await bcrypt.hash(
    otp,
    10,
  );

  const now = new Date();

  const expiresAt = new Date(
    now.getTime() +
      config.otp.expiryMinutes * 60 * 1000,
  );

  const challengeId =
    crypto.randomUUID();

  /**
   * Invalidate previous OTPs.
   *
   * This guarantees that only the newest challenge
   * can be verified.
   */
  await OTPRecord.updateMany(
    {
      identifier: normalizedEmail,
      type,
      isUsed: false,
    },
    {
      $set: {
        isUsed: true,
      },
    },
  );

  /**
   * Store the newest OTP challenge.
   */
  await OTPRecord.findOneAndUpdate(
    {
      identifier: normalizedEmail,
      type,
    },
    {
      $set: {
        otpHash,
        expiresAt,
        attempts: 0,
        isUsed: false,
        challengeId,
        updatedAt: now,
      },

      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      sort: {
        updatedAt: -1,
      },
    },
  );

  console.info(
    '[OTP] Challenge saved',
    {
      type,
      challengeId,
    },
  );

  /**
   * Create persistent email job.
   */
  const job = await EmailJob.create({
    type,
    identifier: normalizedEmail,
    challengeId,

    encryptedPayload: encryptPayload({
      email: normalizedEmail,
      name,
      otp,
      type,
    }),

    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
  });

  console.info(
    '[OTP] Email job created',
    {
      jobId: job.id,
    },
  );

  /**
   * Try the job immediately.
   */
  let deliveryResult =
    await processNextEmailJob(
      job.id,
    );

  /**
   * If the first attempt succeeded,
   * we're done.
   */
  if (
    deliveryResult.status === 'sent'
  ) {
    return {
      resendAfterSeconds:
        config.otp.resendCooldownSeconds,
    };
  }

  /**
   * If the first attempt permanently failed,
   * don't make the frontend wait.
   */
  if (
    deliveryResult.status === 'failed'
  ) {
    throw new EmailDeliveryError(
      deliveryResult.errorCode,
      false,
    );
  }

  /**
   * The job is either queued for retry or was
   * temporarily unavailable.
   *
   * IMPORTANT:
   * We continue waiting instead of immediately
   * returning "OTP failed".
   */
  const deadline =
    Date.now() +
    EMAIL_JOB_RESULT_WAIT_MS;

  while (
    Date.now() < deadline
  ) {
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          EMAIL_JOB_RESULT_POLL_MS,
        ),
    );

    const currentJob =
      await EmailJob.findById(
        job.id,
      )
        .select(
          'status lastErrorCode nextAttemptAt attempts',
        )
        .lean();

    if (!currentJob) {
      throw new EmailDeliveryError(
        'EMAIL_JOB_MISSING',
        false,
      );
    }

    if (
      currentJob.status === 'sent'
    ) {
      deliveryResult = {
        status: 'sent',
      };

      break;
    }

    if (
      currentJob.status === 'failed'
    ) {
      deliveryResult = {
        status: 'failed',
        errorCode:
          currentJob.lastErrorCode ||
          'EMAIL_DELIVERY_FAILED',
      };

      break;
    }

    /**
     * queued / processing:
     *
     * Keep waiting.
     *
     * The background worker will claim the job
     * when nextAttemptAt becomes available.
     */
  }

  /**
   * Successful delivery.
   */
  if (
    deliveryResult.status === 'sent'
  ) {
    return {
      resendAfterSeconds:
        config.otp.resendCooldownSeconds,
    };
  }

  /**
   * Permanent failure.
   */
  if (
    deliveryResult.status === 'failed'
  ) {
    throw new EmailDeliveryError(
      deliveryResult.errorCode,
      false,
    );
  }

  /**
   * The email is still queued after the request
   * timeout.
   *
   * We intentionally DO NOT invalidate the OTP.
   *
   * The persistent worker will continue trying while
   * the OTP challenge remains valid.
   *
   * Returning success here tells the frontend that the
   * request was accepted, rather than causing it to
   * immediately request another OTP and invalidate this one.
   */
  console.warn(
    '[OTP] Email still queued after request wait',
    {
      jobId: job.id,
      type,
    },
  );

  return {
    resendAfterSeconds:
      config.otp.resendCooldownSeconds,
  };
};

/**
 * OTP verification result.
 */
export type OTPVerificationResult =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'too_many_attempts';

/**
 * Verify OTP.
 */
export const verifyOTP = async (
  identifier: string,
  otp: string,
  type: OTPType,
): Promise<OTPVerificationResult> => {
  const normalizedIdentifier =
    identifier.trim().toLowerCase();

  const normalizedOtp =
    otp.trim();

  const now = new Date();

  /**
   * Find the newest active OTP.
   */
  const record =
    await OTPRecord.findOne({
      identifier: normalizedIdentifier,
      type,

      isUsed: false,

      expiresAt: {
        $gt: now,
      },
    })
      .select('+otpHash')
      .sort({
        updatedAt: -1,
      });

  /**
   * No active OTP.
   */
  if (!record) {
    const previousChallenge =
      await OTPRecord.findOne({
        identifier:
          normalizedIdentifier,
        type,
      }).sort({
        updatedAt: -1,
      });

    if (
      previousChallenge &&
      previousChallenge.attempts >=
        config.otp.verifyMaxAttempts
    ) {
      return previousChallenge.expiresAt >
        now
        ? 'too_many_attempts'
        : 'expired';
    }

    return 'expired';
  }

  /**
   * Atomically reserve one verification attempt.
   *
   * This prevents multiple simultaneous requests from
   * exceeding the verification limit.
   */
  const attempt =
    await OTPRecord.updateOne(
      {
        _id: record._id,

        challengeId:
          record.challengeId,

        isUsed: false,

        attempts: {
          $lt:
            config.otp
              .verifyMaxAttempts,
        },

        expiresAt: {
          $gt: now,
        },
      },
      {
        $inc: {
          attempts: 1,
        },
      },
    );

  if (
    attempt.modifiedCount !== 1
  ) {
    return 'too_many_attempts';
  }

  /**
   * Compare the submitted OTP with the hash.
   */
  const matches =
    await bcrypt.compare(
      normalizedOtp,
      record.otpHash,
    );

  if (!matches) {
    return 'invalid';
  }

  /**
   * Consume OTP atomically.
   *
   * This prevents the same OTP from being used twice.
   */
  const consumed =
    await OTPRecord.updateOne(
      {
        _id: record._id,

        challengeId:
          record.challengeId,

        isUsed: false,

        expiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          isUsed: true,
        },
      },
    );

  return consumed.modifiedCount === 1
    ? 'valid'
    : 'expired';
};

/**
 * Claim the next available email job.
 *
 * MongoDB performs the claim atomically.
 *
 * This is important when Render runs multiple Node
 * processes/instances because two workers should not
 * send the same email simultaneously.
 */
const claimNextEmailJob = async (
  jobId?: string,
) => {
  const now = new Date();

  return EmailJob.findOneAndUpdate(
    {
      ...(jobId
        ? {
            _id: jobId,
          }
        : {}),

      nextAttemptAt: {
        $lte: now,
      },

      $or: [
        {
          status: 'queued',
        },

        {
          status: 'processing',

          lockedUntil: {
            $lte: now,
          },
        },
      ],
    },

    {
      $set: {
        status: 'processing',

        lockedUntil: new Date(
          now.getTime() +
            EMAIL_JOB_LOCK_MS,
        ),
      },

      $inc: {
        attempts: 1,
      },
    },

    {
      returnDocument: 'after',

      sort: {
        nextAttemptAt: 1,
      },
    },
  ).select(
    '+encryptedPayload',
  );
};

/**
 * Email job processing result.
 */
type EmailJobProcessingResult =
  | {
      status:
        | 'sent'
        | 'retrying'
        | 'empty';
    }
  | {
      status: 'failed';
      errorCode: string;
    };

/**
 * Process one email job.
 */
const processNextEmailJob = async (
  jobId?: string,
): Promise<EmailJobProcessingResult> => {
  const job =
    await claimNextEmailJob(
      jobId,
    );

  if (!job) {
    return {
      status: 'empty',
    };
  }

  /**
   * Check whether this job's OTP challenge is
   * still the active challenge.
   *
   * If the user requested another OTP, this old
   * email must never be delivered.
   */
  const activeChallenge =
    await OTPRecord.findOne({
      identifier: job.identifier,
      type: job.type,
      challengeId: job.challengeId,

      isUsed: false,

      expiresAt: {
        $gt: new Date(),
      },
    })
      .select(
        'expiresAt',
      )
      .lean();

  if (!activeChallenge) {
    await EmailJob.updateOne(
      {
        _id: job._id,
      },
      {
        $set: {
          status: 'failed',
          lastErrorCode:
            'OTP_CHALLENGE_EXPIRED',
        },

        $unset: {
          lockedUntil: 1,
        },
      },
    );

    console.info(
      '[OTP] Email job skipped because its challenge is no longer active',
      {
        jobId: job.id,
      },
    );

    return {
      status: 'failed',
      errorCode:
        'OTP_CHALLENGE_EXPIRED',
    };
  }

  const provider =
    config.email.resendApiKey
      ? 'resend'
      : 'smtp';

  console.info(
    '[OTP] Email sending started',
    {
      jobId: job.id,
      type: job.type,
      provider,
      attempt: job.attempts,
    },
  );

  try {
    const payload =
      decryptPayload(
        job.encryptedPayload,
      );

    /**
     * Extra safety check:
     *
     * Never send an OTP email if the encrypted payload
     * doesn't match the job.
     */
    if (
      payload.email !== job.identifier ||
      payload.type !== job.type
    ) {
      throw new EmailDeliveryError(
        'EMAIL_JOB_PAYLOAD_MISMATCH',
        false,
      );
    }

    await deliverEmail(
      payload,
    );

    /**
     * Provider accepted the email.
     */
    await EmailJob.updateOne(
      {
        _id: job._id,
      },
      {
        $set: {
          status: 'sent',
        },

        $unset: {
          lockedUntil: 1,
          lastErrorCode: 1,
        },
      },
    );

    console.info(
      '[OTP] Email provider accepted message',
      {
        jobId: job.id,
        provider,
      },
    );

    return {
      status: 'sent',
    };
  } catch (error) {
    const deliveryError =
      error instanceof
      EmailDeliveryError
        ? error
        : new EmailDeliveryError(
            'EMAIL_JOB_ERROR',
            false,
          );

    /**
     * Exponential backoff.
     *
     * attempts = 1 -> 5 sec
     * attempts = 2 -> 10 sec
     * attempts = 3 -> 20 sec
     * ...
     */
    const exponent =
      Math.max(
        0,
        job.attempts - 1,
      );

    const delayMs =
      Math.min(
        EMAIL_RETRY_BASE_DELAY_MS *
          2 ** exponent,
        EMAIL_RETRY_MAX_DELAY_MS,
      );

    const nextAttemptAt =
      new Date(
        Date.now() + delayMs,
      );

    /**
     * Retry only when:
     *
     * 1. provider/network says retryable
     * 2. OTP is still valid when the retry happens
     */
    const shouldRetry =
      deliveryError.retryable &&
      nextAttemptAt <
        activeChallenge.expiresAt;

    await EmailJob.updateOne(
      {
        _id: job._id,
      },
      {
        $set: {
          status: shouldRetry
            ? 'queued'
            : 'failed',

          lastErrorCode:
            deliveryError.code.slice(
              0,
              100,
            ),

          nextAttemptAt:
            shouldRetry
              ? nextAttemptAt
              : job.nextAttemptAt,
        },

        $unset: {
          lockedUntil: 1,
        },
      },
    );

    console.error(
      '[OTP] Email sending failed',
      {
        jobId: job.id,

        errorCode:
          deliveryError.code,

        ...(deliveryError.providerResponseCode !==
          undefined && {
          providerResponseCode:
            deliveryError.providerResponseCode,
        }),

        retryable:
          deliveryError.retryable,

        retryScheduled:
          shouldRetry,

        attempt:
          job.attempts,
      },
    );

    if (shouldRetry) {
      console.warn(
        '[OTP] Retry attempt scheduled',
        {
          jobId: job.id,

          attempt:
            job.attempts + 1,

          delayMs,

          nextAttemptAt:
            nextAttemptAt.toISOString(),
        },
      );

      return {
        status: 'retrying',
      };
    }

    return {
      status: 'failed',
      errorCode:
        deliveryError.code,
    };
  }
};

/**
 * Background email worker.
 *
 * It continuously drains queued jobs.
 */
export const startEmailWorker =
  (): void => {
    const drainQueue =
      async (): Promise<void> => {
        if (workerBusy) {
          return;
        }

        workerBusy = true;

        try {
          /**
           * Process a small batch so one request/process
           * doesn't monopolize the event loop.
           */
          for (
            let processed = 0;
            processed < 10;
            processed += 1
          ) {
            const result =
              await processNextEmailJob();

            if (
              result.status === 'empty'
            ) {
              break;
            }
          }
        } catch (error) {
          console.error(
            '[OTP] Email worker error:',
            error instanceof Error
              ? error.message
              : 'unknown error',
          );
        } finally {
          workerBusy = false;
        }
      };

    /**
     * Process immediately on startup.
     */
    void drainQueue();

    /**
     * Continue checking the MongoDB queue.
     */
    const timer =
      setInterval(
        () => {
          void drainQueue();
        },
        EMAIL_JOB_POLL_MS,
      );

    /**
     * Don't keep the Node process alive only because
     * of this timer.
     */
    timer.unref();
  };