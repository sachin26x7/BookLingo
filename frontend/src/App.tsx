import React, { useEffect } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { authService, userService } from './services/auth.service';

// Layouts
import AuthLayout from './components/layouts/AuthLayout';
import AppLayout from './components/layouts/AppLayout';

// Pages
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import VerifyEmailPage from './pages/Auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/Auth/ResetPasswordPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import LibraryPage from './pages/Library/LibraryPage';
import ReaderPage from './pages/Reader/ReaderPage';
import VocabularyPage from './pages/Vocabulary/VocabularyPage';
import DictionaryPage from './pages/Dictionary/DictionaryPage';
import ProfilePage from './pages/Profile/ProfilePage';

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{
            width: 36,
            height: 36,
            border: '3px solid var(--cream)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

let sessionRestorePromise: Promise<void> | null = null;

const App: React.FC = () => {
  const { isAuthenticated, setLoading } = useAuthStore();

  // Apply theme from user preferences
  useEffect(() => {
    const stored = localStorage.getItem('auth-store');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const theme = data?.state?.user?.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch {}
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    if (!sessionRestorePromise) {
      sessionRestorePromise = (async () => {
        try {
          const { data } = await authService.refreshToken();
          useAuthStore.getState().setAccessToken(data.data.accessToken);

          try {
            const profile = await userService.getProfile();
            if (profile.data.success && profile.data.data) {
              useAuthStore.getState().setUser(profile.data.data);
            }
          } catch {
            // Keep the refreshed session if the profile request is temporarily unavailable.
          }
        } catch {
          useAuthStore.getState().logout();
        } finally {
          useAuthStore.getState().setLoading(false);
          sessionRestorePromise = null;
        }
      })();
    }
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: 'var(--sage)', secondary: 'white' },
          },
          error: {
            iconTheme: { primary: '#e05252', secondary: 'white' },
          },
        }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
        </Route>

        {/* Protected app routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Reader is full-screen */}
        <Route path="/reader/:bookId" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
