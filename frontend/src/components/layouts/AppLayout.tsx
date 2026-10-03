import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen, LayoutDashboard, Library, BookMarked,
  BookOpenCheck, User, LogOut, Menu, X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authService, userService } from '../../services/auth.service';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library',   icon: Library,         label: 'My Library' },
  { to: '/vocabulary',icon: BookMarked,       label: 'Vocabulary' },
  { to: '/dictionary',icon: BookOpenCheck,    label: 'Dictionary' },
];

const THEME_OPTIONS: { key: 'light' | 'sepia' | 'dark'; label: string; dot: string }[] = [
  { key: 'light', label: 'Light',  dot: '#faf8f4' },
  { key: 'sepia', label: 'Sepia',  dot: '#f2e8d8' },
  { key: 'dark',  label: 'Dark',   dot: '#18140f' },
];

const AppLayout: React.FC = () => {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try { await authService.logout(); } catch {}
    logout();
    navigate('/login');
    toast.success('See you next time!');
  };

  const setTheme = async (next: 'light' | 'sepia' | 'dark') => {
    document.documentElement.setAttribute('data-theme', next);
    updateUser({ theme: next });
    try { await userService.updatePreferences({ theme: next }); } catch {}
  };

  const currentTheme = user?.theme || 'light';
  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const renderSidebar = () => (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        overflowY: 'auto',
        zIndex: 50,
        transition: 'transform 0.24s cubic-bezier(0.22,1,0.36,1)',
      }}
      className="sidebar"
    >
      {/* Brand */}
      <div style={{
        padding: '22px 20px 18px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div className="app-brand">
          <div className="app-brand-mark">
            <BookOpen size={19} />
          </div>
          <span className="app-brand-name">
            BookLingo
          </span>
        </div>

        {/* Mobile close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="btn btn-ghost btn-icon btn-sm hide-desktop"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" style={{ flex: '1 1 auto', minHeight: 0, padding: '14px 10px', overflowY: 'auto' }}>
        <p style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 8,
          paddingLeft: 11,
        }}>
          Menu
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="sidebar-footer">
        {/* Theme switcher */}
        <div className="sidebar-theme">
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 500, marginBottom: 8 }}>
            Theme
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {THEME_OPTIONS.map(({ key, label, dot }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                title={label}
                style={{
                  width: 24, height: 24,
                  borderRadius: '50%',
                  background: dot,
                  border: `2px solid ${currentTheme === key ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                  flexShrink: 0,
                  outline: 'none',
                }}
                aria-label={`Switch to ${label} theme`}
              />
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* Profile link */}
        <NavLink
          to="/profile"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => `nav-item sidebar-profile${isActive ? ' active' : ''}`}
        >
          <User size={15} />
          Profile
        </NavLink>

        {/* User info */}
        <div className="sidebar-user-info" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 'var(--r-md)',
          background: 'var(--paper-warm)',
        }}>
          <div style={{
            width: 30, height: 30,
            borderRadius: 8,
            background: 'var(--accent-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600,
            color: 'var(--accent)',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="btn btn-ghost sidebar-logout"
          style={{
            width: '100%', justifyContent: 'flex-start', gap: 10,
            fontSize: 13.5,
            color: '#b94040',
          }}
          aria-label="Logout"
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* Mobile top bar */}
      <header
        className="hide-desktop"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 52,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={18} color="var(--accent)" />
          <span style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
            BookLingo
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="btn btn-ghost btn-icon"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(30, 20, 10, 0.45)',
            zIndex: 65,
            backdropFilter: 'blur(2px)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Desktop sidebar */}
      <div
        className="hide-mobile"
        style={{ width: 'var(--sidebar-w)', flexShrink: 0 }}
      >
        {renderSidebar()}
      </div>

      {/* Mobile sidebar (drawer) */}
      <div
        className="hide-desktop"
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          width: 'var(--sidebar-w)',
          zIndex: 70,
          pointerEvents: mobileOpen ? 'auto' : 'none',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.24s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {renderSidebar()}
      </div>

      {/* Main content */}
      <main className="app-main">
        {/* Mobile top padding */}
        <div className="hide-desktop" style={{ height: 52 }} />
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
