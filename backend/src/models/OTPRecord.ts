import mongoose, { Schema } from 'mongoose';

export type OTPType = 'email_verify' | 'mobile_verify' | 'password_reset' | 'login';

export interface IOTPRecord {
  identifier: string;
  otpHash: string;
  type: OTPType;
  expiresAt: Date;
  attempts: number;
  isUsed: boolean;
  createdAt: Date;
}

const OTPRecordSchema = new Schema<IOTPRecord>(
  {
    identifier: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true, select: false },
    type: {
      type: String,
      enum: ['email_verify', 'mobile_verify', 'password_reset', 'login'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OTPRecordSchema.index({ identifier: 1, type: 1 });
OTPRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const OTPRecord = mongoose.model<IOTPRecord>('OTPRecord', OTPRecordSchema);
