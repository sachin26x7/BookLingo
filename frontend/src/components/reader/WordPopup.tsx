import React, { useEffect, useRef, useState } from 'react';
import { X, Bookmark, Volume2, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { WordExplanation } from '../../types';
import toast from 'react-hot-toast';
import { speakText } from '../../utils/speech';
import type { SupportedLanguage } from '../../constants/languages';

interface WordPopupProps {
  word: string;
  position: { x: number; y: number };
  explanation: WordExplanation | null;
  isLoading: boolean;
  targetLanguage: SupportedLanguage;
  languages: readonly SupportedLanguage[];
  onTargetLanguageChange: (language: SupportedLanguage) => void;
  onClose: () => void;
  onSave: () => void;
}

/** Compact "mini" view shown first; "More" expands full detail */
const WordPopup: React.FC<WordPopupProps> = ({
  word, position, explanation, isLoading, targetLanguage, languages,
  onTargetLanguageChange, onClose, onSave,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const isMobile = window.innerWidth < 768;

  /* ── Close on outside click / Escape ── */
  useEffect(() => {
    const onMousedown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mousedown', onMousedown);
      document.removeEventListener('keydown', onKeydown);
    };
  }, [onClose]);

  /* ── Position logic: keep within viewport, prefer above selection ── */
  const getPosition = () => {
    const W = 320;
    const PAD = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = position.x - W / 2;
    let top  = position.y - (expanded ? 460 : 220) - 10;

    left = Math.max(PAD, Math.min(left, vw - W - PAD));
    if (top < 60) top = position.y + 26;   // flip below
    top = Math.max(8, Math.min(top, vh - 80));

    return { left, top };
  };

  const speak = () => {
    speakText(explanation?.word || word);
  };

  const copy = async () => {
    const text = explanation?.word || word;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) {
        toast.error('Could not copy this word');
        return;
      }
    }
    toast.success('Copied', { duration: 1500 });
  };

  /* ─────── Mobile bottom sheet ─────── */
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          data-word-popup
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(30,20,10,0.35)',
            zIndex: 900,
          }}
          aria-hidden="true"
        />
        <div
          ref={popupRef}
          data-word-popup
          className="sheet-enter"
          role="dialog"
          aria-modal="true"
          aria-label={`Word explanation: ${word}`}
          style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            background: 'var(--bg-card)',
            borderRadius: '18px 18px 0 0',
            boxShadow: '0 -8px 40px rgba(30,20,10,0.18)',
            zIndex: 901,
            maxHeight: '80vh',
            overflowY: 'auto',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
            <div style={{ width: 36, height: 3, background: 'var(--parchment)', borderRadius: 99 }} />
          </div>

          <PopupBody
            word={word}
            explanation={explanation}
            isLoading={isLoading}
            targetLanguage={targetLanguage}
            languages={languages}
            onTargetLanguageChange={onTargetLanguageChange}
            expanded={expanded}
            setExpanded={setExpanded}
            onClose={onClose}
            onSave={onSave}
            onSpeak={speak}
            onCopy={copy}
          />
        </div>
      </>
    );
  }

  /* ─────── Desktop floating popup ─────── */
  const { left, top } = getPosition();

  return (
    <div
      ref={popupRef}
      data-word-popup
      className="popup-enter popup-scroll"
      role="dialog"
      aria-modal="true"
      aria-label={`Word explanation: ${word}`}
      style={{
        position: 'fixed',
        left, top,
        width: 320,
        maxHeight: '78vh',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-popup)',
        zIndex: 1000,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <PopupBody
        word={word}
        explanation={explanation}
        isLoading={isLoading}
        targetLanguage={targetLanguage}
        languages={languages}
        onTargetLanguageChange={onTargetLanguageChange}
        expanded={expanded}
        setExpanded={setExpanded}
        onClose={onClose}
        onSave={onSave}
        onSpeak={speak}
        onCopy={copy}
      />
    </div>
  );
};

/* ─────── Shared inner content ─────── */
interface BodyProps {
  word: string;
  explanation: WordExplanation | null;
  isLoading: boolean;
  targetLanguage: SupportedLanguage;
  languages: readonly SupportedLanguage[];
  onTargetLanguageChange: (language: SupportedLanguage) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onSpeak: () => void;
  onCopy: () => void;
}

const PopupBody: React.FC<BodyProps> = ({
  word, explanation, isLoading, expanded, setExpanded,
  targetLanguage, languages, onTargetLanguageChange,
  onClose, onSave, onSpeak, onCopy,
}) => (
  <div>
    {/* ── Header ── */}
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '14px 16px 10px',
      borderBottom: '1px solid var(--border-light)',
      position: 'sticky', top: 0,
      background: 'var(--bg-card)',
      zIndex: 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
          <h3 style={{
            fontFamily: "'Lora', serif",
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}>
            {explanation?.word || word}
          </h3>
          {explanation?.partOfSpeech && (
            <span style={{
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 99,
              background: 'var(--accent-faint)',
              color: 'var(--accent)',
              fontStyle: 'italic',
              fontWeight: 500,
            }}>
              {explanation.partOfSpeech}
            </span>
          )}
        </div>
        {explanation?.pronunciation && (
          <span style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.03em',
          }}>
            {explanation.pronunciation}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 8 }}>
        {explanation?.word && (
          <>
            <button
              onClick={onSpeak}
              className="btn btn-ghost btn-icon btn-sm"
              title="Pronounce"
              aria-label="Hear pronunciation"
            >
              <Volume2 size={13} />
            </button>
            <button
              onClick={onCopy}
              className="btn btn-ghost btn-icon btn-sm"
              title="Copy word"
              aria-label="Copy word"
            >
              <Copy size={13} />
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>
    </div>

    {/* ── Body ── */}
    <div style={{ padding: '12px 16px 0' }}>
      <label className="label" htmlFor="word-meaning-language">Meaning language</label>
      <select
        id="word-meaning-language"
        className="input"
        value={targetLanguage}
        onChange={(event) => onTargetLanguageChange(event.target.value as SupportedLanguage)}
        aria-label="Meaning language"
      >
        {languages.map((language) => <option key={language} value={language}>{language}</option>)}
      </select>
    </div>

    <div style={{ padding: '12px 16px 16px' }}>
      {isLoading ? (
        <LoadingState />
      ) : explanation ? (
        <ExplanationContent
          explanation={explanation}
          expanded={expanded}
          targetLanguage={targetLanguage}
          setExpanded={setExpanded}
          onSave={onSave}
        />
      ) : (
        <div style={{
          textAlign: 'center', padding: '20px 0',
          color: 'var(--text-muted)', fontSize: 13.5,
        }}>
          Could not load explanation. Please try again.
        </div>
      )}
    </div>
  </div>
);

/* ─────── Loading skeleton ─────── */
const LoadingState = () => (
  <div>
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 0 8px',
    }}>
      {/* Animated dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 7, height: 7,
            borderRadius: '50%',
            background: 'var(--accent-light)',
            animation: `dot-bounce 1s ease ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        Analysing context…
      </p>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <div className="skeleton" style={{ height: 14, width: '90%' }} />
      <div className="skeleton" style={{ height: 14, width: '70%' }} />
      <div className="skeleton" style={{ height: 14, width: '80%' }} />
    </div>
    <style>{`
      @keyframes dot-bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
        40% { transform: translateY(-6px); opacity: 1; }
      }
    `}</style>
  </div>
);

/* ─────── Explanation content ─────── */
const ExplanationContent: React.FC<{
  explanation: WordExplanation;
  expanded: boolean;
  targetLanguage: string;
  setExpanded: (v: boolean) => void;
  onSave: () => void;
}> = ({ explanation, expanded, targetLanguage, setExpanded, onSave }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

    {/* Contextual meaning — always visible */}
    <div style={{
      background: 'var(--accent-faint)',
      borderRadius: 'var(--r-md)',
      padding: '10px 13px',
      borderLeft: '3px solid var(--accent)',
    }}>
      <p style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: 'var(--accent)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 5,
      }}>
        In this context
      </p>
      <p style={{
        fontSize: 13.5,
        color: 'var(--text-primary)',
        lineHeight: 1.55,
        fontWeight: 500,
      }}>
        {explanation.contextualMeaning}
      </p>
    </div>

    {/* Translation — always visible */}
    {explanation.translation && (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--r-md)',
        padding: '9px 13px',
      }}>
        <div>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 2 }}>
            Meaning in {targetLanguage}
          </p>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Lora', serif" }}>
            {explanation.translation}
          </p>
        </div>
      </div>
    )}

    {/* ── Compact action row ── */}
    <div style={{ display: 'flex', gap: 7 }}>
      <button
        onClick={onSave}
        className="btn btn-primary btn-sm"
        style={{ flex: 1 }}
        aria-label="Save word to vocabulary"
      >
        <Bookmark size={13} />
        Save Word
      </button>
      <button
        onClick={() => setExpanded(!expanded)}
        className="btn btn-secondary btn-sm"
        aria-expanded={expanded}
        aria-label={expanded ? 'Show less' : 'Show more'}
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? 'Less' : 'More'}
      </button>
    </div>

    {/* ── Expanded detail ── */}
    {expanded && (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        paddingTop: 10,
        borderTop: '1px solid var(--border-light)',
        animation: 'expand-in 0.16s ease forwards',
      }}>

        {/* Simple explanation */}
        {explanation.simpleExplanation && (
          <Section label="Simple English">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {explanation.simpleExplanation}
            </p>
          </Section>
        )}

        {/* Part of speech */}
        {explanation.partOfSpeech && (
          <Section label="Part of Speech">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {explanation.partOfSpeech}
            </p>
          </Section>
        )}

        {/* Synonyms */}
        {explanation.synonyms && explanation.synonyms.length > 0 && (
          <Section label="Synonyms">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {explanation.synonyms.map((s) => (
                <span key={s} style={{
                  fontSize: 12, padding: '3px 9px',
                  background: 'var(--cream)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                  color: 'var(--text-secondary)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Example */}
        {explanation.exampleSentence && (
          <Section label="Example sentence">
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
              "{explanation.exampleSentence}"
            </p>
          </Section>
        )}

      </div>
    )}

    <style>{`
      @keyframes expand-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  </div>
);

/* Label + children section */
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p style={{
      fontSize: 10.5,
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 5,
    }}>
      {label}
    </p>
    {children}
  </div>
);

export default WordPopup;
