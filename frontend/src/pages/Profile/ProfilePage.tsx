import React, { useState } from 'react';
import { BookOpen, Check, Eye, EyeOff, Loader2, Lock, LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { userService, authService } from '../../services/auth.service';
import type { User } from '../../types';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'proficient', label: 'Proficient' },
];

const ProfilePage: React.FC = () => {
  const { user, updateUser, setAccessToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [language, setLanguage] = useState(user?.preferredLanguage || 'Hindi');
  const [level, setLevel] = useState<User['proficiencyLevel']>(user?.proficiencyLevel || 'intermediate');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    let requestFailed = false;
    try {
      await authService.logout();
    } catch {
      requestFailed = true;
    } finally {
      logout();
      navigate('/');
    }
    if (requestFailed) {
      toast.error('Signed out here, but the server could not end your session.');
    } else {
      toast.success('See you next time!');
    }
  };

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className="profile-page">
      <header className="profile-page-header">
        <div>
          <span className="profile-eyebrow">YOUR ACCOUNT</span>
          <h1>Profile &amp; Settings</h1>
          <p>Manage your account and make your reading experience yours.</p>
        </div>
      </header>

      <section className="profile-identity card" aria-label="Account overview">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-identity-copy">
          <h2>{user?.name || 'Reader'}</h2>
          <p>{user?.email}</p>
          <span className="profile-level">{user?.proficiencyLevel || 'intermediate'} reader</span>
        </div>
        <button
          type="button"
          className="btn btn-danger profile-logout"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? <Loader2 size={16} className="profile-spinner" /> : <LogOut size={16} />}
          {isLoggingOut ? 'Signing out...' : 'Log out'}
        </button>
      </section>

      <section className="profile-section card">
        <div className="profile-section-heading">
          <span className="profile-section-icon"><UserRound size={18} /></span>
          <div>
            <h2>Personal information</h2>
            <p>Keep your profile and learning level up to date.</p>
          </div>
        </div>
        <div className="profile-form-grid">
          <div className="profile-field profile-field-wide">
            <label className="label" htmlFor="profile-name">Full name</label>
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="profile-field profile-field-wide">
            <label className="label" htmlFor="profile-email">Email</label>
            <input id="profile-email" className="input" value={user?.email || ''} disabled />
          </div>
          <div className="profile-field">
            <label className="label" htmlFor="profile-language">Translation language</label>
            <select id="profile-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {SUPPORTED_LANGUAGES.map((supportedLanguage) => <option key={supportedLanguage}>{supportedLanguage}</option>)}
            </select>
          </div>
          <div className="profile-field">
            <label className="label" htmlFor="profile-level">English proficiency</label>
            <select id="profile-level" className="input" value={level} onChange={(e) => setLevel(e.target.value as User['proficiencyLevel'])}>
              {LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <div className="profile-section-actions">
          <button onClick={handleSaveProfile} disabled={isSavingProfile} className="btn btn-primary">
            {isSavingProfile ? <Loader2 size={16} className="profile-spinner" /> : <Check size={16} />}
            {isSavingProfile ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </section>

      <section className="profile-section card">
        <div className="profile-section-heading">
          <span className="profile-section-icon"><BookOpen size={18} /></span>
          <div>
            <h2>Reading preferences</h2>
            <p>Adjust the text size for a more comfortable reading experience.</p>
          </div>
        </div>
        <div className="profile-range-field">
          <label className="label" htmlFor="profile-font-size">Font size <strong>{fontSize}px</strong></label>
          <input
            id="profile-font-size"
            type="range"
            min={12}
            max={24}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <div className="profile-range-labels"><span>Small (12px)</span><span>Large (24px)</span></div>
        </div>
        <div className="profile-section-actions">
          <button onClick={handleSaveFontSize} className="btn btn-secondary">Save reading preferences</button>
        </div>
      </section>

      <section className="profile-section card">
        <div className="profile-section-heading">
          <span className="profile-section-icon"><Lock size={18} /></span>
          <div>
            <h2>Change password</h2>
            <p>Choose a new password with at least 8 characters.</p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="profile-password-form">
          <div className="profile-field profile-field-wide">
            <label className="label" htmlFor="profile-current-password">Current password</label>
            <div className="profile-password-input">
              <input
                id="profile-current-password"
                className="input"
                type={showPw ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="profile-password-toggle"
                aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <div className="profile-field profile-field-wide">
            <label className="label" htmlFor="profile-new-password">New password</label>
            <input
              id="profile-new-password"
              className="input"
              type={showPw ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="profile-section-actions">
            <button type="submit" disabled={isSavingPw || !currentPw || newPw.length < 8} className="btn btn-primary">
              {isSavingPw ? <Loader2 size={16} className="profile-spinner" /> : <Lock size={16} />}
              {isSavingPw ? 'Changing...' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProfilePage;
