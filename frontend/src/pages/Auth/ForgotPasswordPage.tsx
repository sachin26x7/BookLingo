import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
      toast.success('Reset code sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="page-enter" style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: 'var(--accent-faint)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <Mail size={24} color="var(--accent)" />
        </div>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: 22, marginBottom: 8, color: 'var(--text-primary)' }}>Check your inbox</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>We sent a password reset code to {email}</p>
        <button className="btn btn-primary" onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}>
          Enter reset code
        </button>
        <p style={{ marginTop: 16, fontSize: 14 }}>
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <h1 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
        Forgot password?
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
        Enter your email and we'll send you a reset code.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Email address</label>
          <input className="input" type="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" disabled={isLoading || !email} className="btn btn-primary" style={{ padding: '12px 20px' }}>
          {isLoading ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
          {isLoading ? 'Sending...' : 'Send reset code'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to login</Link>
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ForgotPasswordPage;
