import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../store/authStore';

const LoginPage: React.FC = () => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await authService.login(email, password);
      if (data.success && data.data) {
        login(data.data.user, data.data.accessToken);
        document.documentElement.setAttribute('data-theme', data.data.user.theme || 'light');
        toast.success(`Welcome back, ${data.data.user.name.split(' ')[0]}!`);
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.';
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        toast.error('Please verify your email first.');
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-enter auth-form-content">
      {/* Heading */}
      <div style={{ marginBottom: 30 }}>
        <h1 style={{
          fontFamily: "'Lora', serif",
          fontSize: 26, fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 6,
          letterSpacing: '-0.3px',
        }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Sign in to continue your reading journey
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Email */}
        <div>
          <label className="label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {/* Password */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="label" htmlFor="login-password" style={{ marginBottom: 0 }}>
              Password
            </label>
            <Link
              to="/forgot-password"
              style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', opacity: 0.85 }}
            >
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              className="input"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 12, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4, display: 'flex',
              }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !email || !password}
          className="btn btn-primary"
          style={{ marginTop: 6, padding: '11px 20px', fontSize: 14.5 }}
        >
          {isLoading && <Loader2 size={16} className="spin" />}
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
      </div>

      <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
          Create one
        </Link>
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.85s linear infinite; }`}</style>
    </div>
  );
};

export default LoginPage;
