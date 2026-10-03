import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const BrandMark: React.FC = () => (
  <Link to="/" className="auth-brand" aria-label="BookLingo home">
    <span className="auth-brand-icon"><BookOpen size={19} strokeWidth={1.8} /></span>
    <span>BookLingo</span>
  </Link>
);

const AuthLayout: React.FC = () => {
  const isRegisterPage = useLocation().pathname === '/register';

  return (
  <div className="auth-shell" data-auth-page={isRegisterPage ? 'register' : 'login'}>
    <section className="auth-visual" aria-label={isRegisterPage ? 'Books ready for a new reader' : 'A sunlit library'}>
      <div className="auth-visual-image" aria-hidden="true" />
      <div className="auth-visual-grain" aria-hidden="true" />
      <div className="auth-visual-top"><BrandMark /></div>
      <div className="auth-visual-copy">
        <span className="auth-visual-kicker">{isRegisterPage ? 'A NEW CHAPTER' : 'THE READING ROOM'}</span>
        <h2>{isRegisterPage ? <>Make room<br />for new stories.</> : <>Open a book.<br />Follow the thread.</>}</h2>
        <span className="auth-visual-rule" aria-hidden="true" />
        <p>{isRegisterPage ? 'Your next favorite word is waiting.' : 'Make a little space for a new story.'}</p>
      </div>
      <div className="auth-visual-foot">
        <span>BOOKLINGO</span>
        <span>READ AT YOUR OWN PACE</span>
      </div>
    </section>

    <main className="auth-main">
      <header className="auth-mobile-header"><BrandMark /></header>
      <div className="auth-form-wrap">
        <Outlet />
      </div>
      <div className="auth-main-foot" aria-hidden="true">A QUIETER PLACE TO READ</div>
    </main>
  </div>
  );
};

export default AuthLayout;