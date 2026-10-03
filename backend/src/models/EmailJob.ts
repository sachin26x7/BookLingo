import mongoose, { Schema } from 'mongoose';
import type { OTPType } from './OTPRecord';

export type EmailJobStatus = 'queued' | 'processing' | 'sent' | 'failed';

export interface IEmailJob {
  type: OTPType;
  identifier: string;
  challengeId: string;
  encryptedPayload: string;
  status: EmailJobStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil?: Date;
  lastErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailJobSchema = new Schema<IEmailJob>(
  {
    type: { type: String, required: true },
    identifier: { type: String, required: true },
    challengeId: { type: String, required: true },
    encryptedPayload: { type: String, required: true, select: false },
    status: { type: String, enum: ['queued', 'processing', 'sent', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true },
    lockedUntil: Date,
    lastErrorCode: String,
  },
  { timestamps: true }
);

EmailJobSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });
EmailJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const EmailJob = mongoose.model<IEmailJob>('EmailJob', EmailJobSchema);
