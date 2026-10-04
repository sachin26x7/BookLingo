import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const email = searchParams.get('email') || '';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(() => {
    const state = location.state as { resendAfterSeconds?: number } | null;
    return state?.resendAfterSeconds ?? 0;
  });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (isLoading || !/^[0-9]?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d !== '') && !isLoading) submitOtp(newOtp.join(''));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isLoading) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    text.split('').forEach((char, i) => { newOtp[i] = char; });
    setOtp(newOtp);
    if (text.length === 6 && !isLoading) submitOtp(text);
  };

  const submitOtp = async (otpString: string) => {
    if (isLoading || otpString.length !== 6 || !email) return;
    setIsLoading(true);
    try {
      await authService.verifyEmail(email, otpString);
      toast.success('Email verified! Please log in.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    if (isResending || countdown > 0 || !email) return;
    setIsResending(true);
    try {
      const response = await authService.resendVerification(email);
      toast.success('A new verification code is being sent.');
      setCountdown(response.data.resendAfterSeconds ?? 60);
    } catch (err: any) {
      const retryAfterSeconds = err.response?.data?.retryAfterSeconds;
      if (typeof retryAfterSeconds === 'number') setCountdown(retryAfterSeconds);
      toast.error(err.response?.data?.message || 'Failed to resend');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="page-enter" style={{ textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56,
        background: 'var(--accent-faint)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <Mail size={24} color="var(--accent)" />
      </div>

      <h1 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
        Check your email
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 4 }}>
        We sent a 6-digit code to
      </p>
      <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 500, marginBottom: 32 }}>
        {email}
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            style={{
              width: 52, height: 56,
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 600,
              fontFamily: 'monospace',
              border: '2px solid ' + (digit ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 10,
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'all 0.15s',
            }}
          />
        ))}
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', marginBottom: 24 }}>
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
          Verifying...
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
          Didn't receive the code?
        </p>
        <button
          onClick={resend}
          disabled={isResending || countdown > 0}
          className="btn btn-secondary"
          style={{ gap: 8 }}
        >
          <RefreshCw size={14} />
          {countdown > 0 ? `Resend in ${countdown}s` : isResending ? 'Sending...' : 'Resend code'}
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to login</Link>
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default VerifyEmailPage;
