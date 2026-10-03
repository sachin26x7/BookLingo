import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';

const LEVELS = [
  { value: 'beginner',     label: 'Beginner'     },
  { value: 'elementary',   label: 'Elementary'   },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced'     },
  { value: 'proficient',   label: 'Proficient'   },
];

const PW_RULES: { key: keyof typeof PW_CHECKS_INIT; label: string }[] = [
  { key: 'length',    label: '8+ characters' },
  { key: 'uppercase', label: 'Uppercase'     },
  { key: 'lowercase', label: 'Lowercase'     },
  { key: 'number',    label: 'Number'        },
];

const PW_CHECKS_INIT = { length: false, uppercase: false, lowercase: false, number: false };

const RegisterPage: React.FC = () => {
  const [form, setForm] = useState({
    name:              '',
    email:             '',
    password:          '',
    preferredLanguage: 'Hindi',
    proficiencyLevel:  'intermediate',
  });
  const [showPw, setShowPw]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const pwChecks = {
    length:    form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    lowercase: /[a-z]/.test(form.password),
    number:    /\d/.test(form.password),
  };
  const pwStrong = Object.values(pwChecks).every(Boolean);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwStrong) { toast.error('Please meet all password requirements'); return; }
    setIsLoading(true);
    try {
      await authService.register(form);
      toast.success('If registration can be completed, check your email for next steps.');
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-enter auth-form-content">
      <div style={{ marginBottom: 26 }}>
        <h1 style={{
          fontFamily: "'Lora', serif",
          fontSize: 26, fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 5, letterSpacing: '-0.3px',
        }}>
          Create your account
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Start your smarter reading journey today
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name */}
        <div>
          <label className="label" htmlFor="reg-name">Full name</label>
          <input
            id="reg-name"
            className="input"
            type="text"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            autoComplete="name"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="label" htmlFor="reg-email">Email address</label>
          <input
            id="reg-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="label" htmlFor="reg-password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="reg-password"
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
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

          {/* Password strength indicators */}
          {form.password && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {PW_RULES.map(({ key, label }) => {
                const ok = pwChecks[key];
                return (
                  <span
                    key={key}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 99,
                      display: 'flex', alignItems: 'center', gap: 3,
                      background: ok ? '#d1fae5' : 'var(--cream)',
                      color: ok ? '#15803d' : 'var(--text-muted)',
                      transition: 'background 0.2s, color 0.2s',
                    }}
                  >
                    {ok && <Check size={10} />}
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !form.name || !form.email || !pwStrong}
          className="btn btn-primary"
          style={{ marginTop: 4, padding: '11px 20px', fontSize: 14.5 }}
        >
          {isLoading && <Loader2 size={16} className="spin" />}
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.85s linear infinite; }`}</style>
    </div>
  );
};

export default RegisterPage;
