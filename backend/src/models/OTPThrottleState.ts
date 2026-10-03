import mongoose, { Schema } from 'mongoose';

export interface IOTPThrottleState {
  _id: string;
  sendCount: number;
  windowStartedAt: Date;
  lastSentAt: Date;
  expiresAt: Date;
}

const OTPThrottleStateSchema = new Schema<IOTPThrottleState>({
  _id: { type: String, required: true },
  sendCount: { type: Number, required: true },
  windowStartedAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

OTPThrottleStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OTPThrottleState = mongoose.model<IOTPThrottleState>('OTPThrottleState', OTPThrottleStateSchema);
