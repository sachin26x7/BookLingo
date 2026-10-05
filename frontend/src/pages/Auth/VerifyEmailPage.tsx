import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const [isLoading, setIsLoading] = useState(Boolean(token && email));
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(() => {
    const state = location.state as { resendAfterSeconds?: number } | null;
    return state?.resendAfterSeconds ?? 0;
  });
  const navigate = useNavigate();
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (!token || !email || verificationStarted.current) return;
    verificationStarted.current = true;
    let active = true;
    authService.verifyEmail(email, token)
      .then(() => {
        if (!active) return;
        toast.success('Email verified! Please log in.');
        navigate('/login');
      })
      .catch((err: any) => {
        if (active) toast.error(err.response?.data?.message || 'This verification link is invalid or expired.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [email, navigate, token]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const resend = async () => {
    if (isResending || countdown > 0 || !email) return;
    setIsResending(true);
    try {
      const response = await authService.resendVerification(email);
      toast.success('A new verification link is being sent.');
      setCountdown(response.data.resendAfterSeconds ?? 15);
    } catch (err: any) {
      const retryAfterSeconds = err.response?.data?.retryAfterSeconds;
      if (typeof retryAfterSeconds === 'number') setCountdown(retryAfterSeconds);
      toast.error(err.response?.data?.message || 'Failed to resend verification email');
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
        We sent a verification link to
      </p>
      <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 500, marginBottom: 32 }}>
        {email}
      </p>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', marginBottom: 24 }}>
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
          Verifying your email...
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
          Didn't receive the email?
        </p>
        <button
          onClick={resend}
          disabled={isResending || countdown > 0}
          className="btn btn-secondary"
          style={{ gap: 8 }}
        >
          <RefreshCw size={14} />
          {countdown > 0 ? `Resend in ${countdown}s` : isResending ? 'Sending...' : 'Resend link'}
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
