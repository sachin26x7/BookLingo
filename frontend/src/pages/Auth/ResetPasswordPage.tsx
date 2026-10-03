import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';

const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authService.resetPassword(email, otp, newPassword);
      toast.success('Password reset successfully!');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-enter">
      <h1 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
        Reset password
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
        Enter the code sent to {email} and your new password.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Reset code</label>
          <input className="input" type="text" placeholder="6-digit code" inputMode="numeric"
            maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
        </div>

        <div>
          <label className="label">New password</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 characters" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required minLength={8}
              style={{ paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isLoading || otp.length !== 6 || newPassword.length < 8}
          className="btn btn-primary" style={{ padding: '12px 20px' }}>
          {isLoading ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
          {isLoading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to login</Link>
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ResetPasswordPage;
