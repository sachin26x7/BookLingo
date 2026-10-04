import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  Bookmark,
  BookOpen,
  Languages,
  Sparkles,
} from 'lucide-react';
import './LandingPage.css';

const LandingPage: React.FC = () => (
  <main className="landing-page">
    <header className="landing-header">
      <Link className="landing-brand" to="/" aria-label="BookLingo home">
        <span className="landing-brand-mark"><BookOpen size={20} strokeWidth={1.8} /></span>
        <span>BookLingo</span>
      </Link>

      <nav className="landing-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#features">Why BookLingo</a>
      </nav>

      <div className="landing-header-actions">
        <Link className="landing-login" to="/login">Sign in</Link>
        <Link className="landing-button landing-button-small" to="/register">
          Get started <ArrowRight size={15} />
        </Link>
      </div>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <div className="landing-eyebrow"><span /> A better way to read in English</div>
        <h1 id="landing-title">Fall into the story.<br /><em>Not the dictionary.</em></h1>
        <p className="landing-intro">
          Read the PDFs you love, understand new words in context, and grow your vocabulary
          one page at a time.
        </p>
        <div className="landing-hero-actions">
          <Link className="landing-button" to="/register">
            Start reading free <ArrowRight size={17} />
          </Link>
          <a className="landing-text-link" href="#how-it-works">
            Take a look <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="landing-trust-note">
          <span className="landing-trust-icon"><BookOpen size={15} /></span>
          Bring your own PDF. Keep your place. Learn as you go.
        </div>
      </div>

      <div className="landing-hero-art" aria-label="A preview of BookLingo's contextual reading tools">
        <div className="landing-art-glow" />
        <div className="landing-orbit landing-orbit-one" />
        <div className="landing-orbit landing-orbit-two" />
        <div className="landing-book-shadow" />
        <div className="landing-book-scene">
          <div className="landing-book">
            <div className="landing-book-pages">
              <span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="landing-book-cover">
              <div className="landing-book-topline"><span>BOOKLINGO READER</span><BookOpen size={16} /></div>
              <div className="landing-book-page-label">A page from your next chapter</div>
              <div className="landing-book-text">
                <span>The garden was quiet in the</span>
                <span>pale <b>glimmer</b> of morning,</span>
                <span>each leaf holding a small</span>
                <span>bright secret of its own.</span>
              </div>
              <div className="landing-book-underline" />
              <div className="landing-book-page-number">24 <span>—</span> A NEW BEGINNING</div>
            </div>
            <div className="landing-book-spine" />
          </div>
        </div>

        <div className="landing-word-card">
          <span className="landing-word-kicker"><Sparkles size={13} /> WORD IN CONTEXT</span>
          <strong>glimmer <AudioLines size={15} /></strong>
          <span className="landing-word-phonetic">/ˈɡlimər/ · noun</span>
          <p>a faint, wavering light</p>
          <div className="landing-word-translation"><Languages size={13} /> चमक · a soft little shine</div>
        </div>
        <div className="landing-saved-note"><Bookmark size={14} fill="currentColor" /> Saved to your vocabulary</div>
        <span className="landing-art-caption">READ · DISCOVER · REMEMBER</span>
      </div>
    </section>

    <section className="landing-how" id="how-it-works" aria-labelledby="landing-how-title">
      <div className="landing-section-heading">
        <span className="landing-section-kicker">YOUR READING, REIMAGINED</span>
        <h2 id="landing-how-title">Every new word has a place in the story.</h2>
        <p>No tab-hopping. No losing your flow. Just a little more understanding with every page.</p>
      </div>
      <div className="landing-steps">
        <article className="landing-step">
          <span className="landing-step-number">01</span>
          <div className="landing-step-icon"><BookOpen size={20} /></div>
          <h3>Bring your book</h3>
          <p>Upload a PDF and settle into a calm, comfortable reading space.</p>
        </article>
        <article className="landing-step">
          <span className="landing-step-number">02</span>
          <div className="landing-step-icon"><Sparkles size={20} /></div>
          <h3>Find the meaning</h3>
          <p>Select a word to explore its meaning, pronunciation, and translation in context.</p>
        </article>
        <article className="landing-step">
          <span className="landing-step-number">03</span>
          <div className="landing-step-icon"><Bookmark size={20} /></div>
          <h3>Make it yours</h3>
          <p>Save useful words to your personal vocabulary and revisit them as you learn.</p>
        </article>
      </div>
    </section>

    <section className="landing-about" id="features" aria-labelledby="landing-about-title">
      <div className="landing-about-mark"><Languages size={23} /></div>
      <div>
        <span className="landing-section-kicker">MADE FOR CURIOUS READERS</span>
        <h2 id="landing-about-title">A reading companion, not another distraction.</h2>
        <p>
          BookLingo brings your book, contextual explanations, translations, pronunciation,
          and saved vocabulary together—so you can build confidence without leaving the page.
        </p>
      </div>
      <Link className="landing-about-link" to="/register" aria-label="Create a BookLingo account">
        <ArrowRight size={20} />
      </Link>
    </section>

    <footer className="landing-footer">
      <Link className="landing-brand landing-footer-brand" to="/">
        <span className="landing-brand-mark"><BookOpen size={17} strokeWidth={1.8} /></span>
        <span>BookLingo</span>
      </Link>
      <span>A quieter way to grow through reading.</span>
      <Link to="/login">Already have an account? Sign in <ArrowRight size={13} /></Link>
    </footer>
  </main>
);

export default LandingPage;
