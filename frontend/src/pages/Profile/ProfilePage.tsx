import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { userService, authService } from '../../services/auth.service';
import type { User } from '../../types';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';

const LEVELS = [
  { value: 'beginner', label: 'Beginner', desc: 'Just starting to learn' },
  { value: 'elementary', label: 'Elementary', desc: 'Basic vocabulary' },
  { value: 'intermediate', label: 'Intermediate', desc: 'Can read most texts' },
  { value: 'advanced', label: 'Advanced', desc: 'Complex texts' },
  { value: 'proficient', label: 'Proficient', desc: 'Near-native level' },
];

const ProfilePage: React.FC = () => {
  const { user, updateUser, setAccessToken } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [language, setLanguage] = useState(user?.preferredLanguage || 'Hindi');
  const [level, setLevel] = useState<User['proficiencyLevel']>(user?.proficiencyLevel || 'intermediate');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isSavingPw, setIsSavingPw] = useState(false);

  const [fontSize, setFontSize] = useState(user?.readingPreferences?.fontSize || 16);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await userService.updateProfile({ name, preferredLanguage: language, proficiencyLevel: level });
      updateUser({ name, preferredLanguage: language, proficiencyLevel: level });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveFontSize = async () => {
    if (!user) return;
    const readingPreferences = { ...user.readingPreferences, fontSize };
    try {
      await userService.updatePreferences({ readingPreferences });
      updateUser({ readingPreferences });
      toast.success('Reading preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setIsSavingPw(true);
    try {
      const { data } = await authService.changePassword(currentPw, newPw);
      if (data.data?.accessToken) setAccessToken(data.data.accessToken);
      toast.success('Password changed successfully');
      setCurrentPw('');
      setNewPw('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setIsSavingPw(false);
    }
  };

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div style={{ padding: '32px 40px', maxWidth: 680 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Profile & Settings
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Manage your account and reading preferences</p>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-warm) 100%)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 700, color: 'white',
          fontFamily: "'Lora', serif",
        }}>
          {initials}
        </div>
        <div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            {user?.name}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{user?.email}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {user?.isEmailVerified && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#d1fae5', color: '#047857', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={10} /> Verified
              </span>
            )}
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-faint)', color: 'var(--accent)' }}>
              {user?.proficiencyLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Profile settings */}
      <section style={{ marginBottom: 36 }}>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Personal Information
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Full name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={user?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">Translation language</label>
              <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {SUPPORTED_LANGUAGES.map((language) => <option key={language}>{language}</option>)}
              </select>
            </div>
            <div>
              <label className="label">English proficiency</label>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value as User['proficiencyLevel'])}>
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <button onClick={handleSaveProfile} disabled={isSavingProfile} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            {isSavingProfile ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={16} />}
            {isSavingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </section>

      {/* Reading preferences */}
      <section style={{ marginBottom: 36 }}>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Reading Preferences
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label className="label">Font size: {fontSize}px</label>
            <input
              type="range" min={12} max={24} step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Small (12px)</span><span>Large (24px)</span>
            </div>
          </div>
          <button onClick={handleSaveFontSize} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            Save reading preferences
          </button>
        </div>
      </section>

      {/* Change password */}
      <section>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Change Password
        </h3>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Current password</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPw ? 'text' : 'password'} value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)} placeholder="Current password" style={{ paddingRight: 44 }} required />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">New password</label>
            <input className="input" type={showPw ? 'text' : 'password'} value={newPw}
              onChange={(e) => setNewPw(e.target.value)} placeholder="Minimum 8 characters" required minLength={8} />
          </div>
          <button type="submit" disabled={isSavingPw || !currentPw || newPw.length < 8}
            className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            {isSavingPw ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Lock size={16} />}
            {isSavingPw ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ProfilePage;
