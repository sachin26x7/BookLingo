import React, { useState } from 'react';
import { Search, Volume2, Loader2, Bookmark, Languages, X, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiService, vocabularyService } from '../../services/vocabulary.service';
import type { WordExplanation } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { speakText } from '../../utils/speech';

/* ─── Reusable label ────────────────────────────── */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{
    fontSize: 10.5, fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    marginBottom: 6,
  }}>
    {children}
  </p>
);

const DictionaryPage: React.FC = () => {
  const { user } = useAuthStore();
  const [word, setWord]             = useState('');
  const [sentence, setSentence]     = useState('');
  const [targetLang, setTargetLang] = useState(user?.preferredLanguage || 'Hindi');
  const [result, setResult]         = useState<WordExplanation | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isSaving, setIsSaving]     = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const { data } = await aiService.explainWord({
        word: word.trim(),
        sentence: sentence.trim() || word.trim(),
        targetLanguage: targetLang,
        userLevel: user?.proficiencyLevel || 'intermediate',
      });
      setResult(data.data || null);
    } catch {
      toast.error('Could not fetch explanation');
    } finally {
      setIsLoading(false);
    }
  };

  const speak = () => {
    if (result?.word) speakText(result.word);
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      await vocabularyService.saveWord({
        bookId: '000000000000000000000000',
        bookTitle: 'Dictionary',
        word: result.word,
        sentence: sentence || result.word,
        paragraph: '',
        pageNumber: 0,
        contextualMeaning: result.contextualMeaning,
        simpleExplanation: result.simpleExplanation,
        translation: result.translation,
        targetLanguage: targetLang,
        partOfSpeech: result.partOfSpeech,
        pronunciation: result.pronunciation,
        synonyms: result.synonyms,
        exampleSentence: result.exampleSentence,
      });
      toast.success(`"${result.word}" saved to vocabulary`);
    } catch (err: any) {
      if (err.response?.status === 409) toast('Already in your vocabulary', { icon: 'ℹ️' });
      else toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => { setWord(''); setSentence(''); setResult(null); };

  return (
    <div style={{ padding: '36px 40px', maxWidth: 740 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Lora', serif",
          fontSize: 24, fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 5, letterSpacing: '-0.3px',
        }}>
          Dictionary
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          AI-powered context-aware word explanations in your language
        </p>
      </div>

      {/* ── Search form ── */}
      <form
        onSubmit={handleSearch}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}
      >
        {/* Word + language row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none',
            }} />
            <input
              className="input"
              placeholder="Enter a word or phrase…"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              style={{ paddingLeft: 36, fontSize: 15 }}
              required
              aria-label="Word to look up"
            />
          </div>

          <select
            className="input"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{ width: 128 }}
            aria-label="Target language"
          >
            {SUPPORTED_LANGUAGES.map((language) => <option key={language}>{language}</option>)}
          </select>
        </div>

        {/* Context sentence */}
        <input
          className="input"
          placeholder="Optional: paste sentence for context-aware meaning…"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          aria-label="Context sentence"
        />

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={isLoading || !word.trim()}
            className="btn btn-primary"
            style={{ padding: '9px 24px' }}
          >
            {isLoading
              ? <Loader2 size={15} className="spin" />
              : <Search size={15} />}
            {isLoading ? 'Analysing…' : 'Look up'}
          </button>
          {(word || result) && (
            <button
              type="button"
              onClick={reset}
              className="btn btn-ghost btn-sm"
              style={{ gap: 5 }}
              aria-label="Clear search"
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </form>

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--accent-light)',
                animation: `dot-bounce 1s ease ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Analysing context…</p>
          <style>{`
            @keyframes dot-bounce {
              0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
              40%            { transform: translateY(-7px); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* ── Result ── */}
      {result && !isLoading && (
        <div className="page-enter">

          {/* Word header card */}
          <div className="card" style={{ padding: '24px 28px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                {/* Word + pos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <h2 style={{
                    fontFamily: "'Lora', serif",
                    fontSize: 30, fontWeight: 700,
                    color: 'var(--text-primary)',
                    lineHeight: 1.1,
                  }}>
                    {result.word}
                  </h2>
                  {result.partOfSpeech && (
                    <span style={{
                      fontSize: 12, padding: '3px 9px', borderRadius: 99,
                      background: 'var(--accent-faint)', color: 'var(--accent)',
                      fontWeight: 500, fontStyle: 'italic',
                    }}>
                      {result.partOfSpeech}
                    </span>
                  )}
                </div>

                {/* Pronunciation */}
                {result.pronunciation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14, color: 'var(--text-muted)',
                      letterSpacing: '0.03em',
                    }}>
                      {result.pronunciation}
                    </span>
                    <button
                      onClick={speak}
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label="Hear pronunciation"
                      title="Pronounce"
                    >
                      <Volume2 size={14} color="var(--accent)" />
                    </button>
                  </div>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn btn-primary btn-sm"
                aria-label="Save to vocabulary"
              >
                {isSaving ? <Loader2 size={13} className="spin" /> : <Bookmark size={13} />}
                Save word
              </button>
            </div>

            {/* Contextual meaning */}
            <div style={{
              background: 'var(--accent-faint)',
              borderRadius: 'var(--r-md)',
              padding: '13px 16px',
              borderLeft: '3px solid var(--accent)',
              marginBottom: result.simpleExplanation ? 14 : 0,
            }}>
              <SectionLabel>{sentence ? 'Contextual Meaning' : 'Meaning'}</SectionLabel>
              <p style={{ fontSize: 15.5, color: 'var(--text-primary)', lineHeight: 1.6, fontWeight: 500 }}>
                {result.contextualMeaning}
              </p>
            </div>

            {/* Simple explanation */}
            {result.simpleExplanation && (
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.simpleExplanation}
              </p>
            )}
          </div>

          {/* Translation + Synonyms grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: result.synonyms?.length ? '1fr 1fr' : '1fr',
            gap: 14,
            marginBottom: 14,
          }}>
            {/* Translation */}
            {result.translation && (
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SectionLabel>Translation</SectionLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Languages size={12} color="var(--text-muted)" />
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{targetLang}</span>
                  </div>
                </div>
                <p style={{
                  fontSize: 22, fontWeight: 700,
                  fontFamily: "'Lora', serif",
                  color: 'var(--text-primary)', lineHeight: 1.2,
                }}>
                  {result.translation}
                </p>
              </div>
            )}

            {/* Synonyms */}
            {result.synonyms && result.synonyms.length > 0 && (
              <div className="card" style={{ padding: '20px 22px' }}>
                <SectionLabel>Synonyms</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.synonyms.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setWord(s); setSentence(''); setResult(null); }}
                      style={{
                        fontSize: 13, padding: '5px 12px',
                        background: 'var(--cream)', border: '1px solid var(--border)',
                        borderRadius: 99, cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'background 0.14s, color 0.14s',
                        fontFamily: "'Inter', sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--cream-dark)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--ink)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--cream)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                      }}
                      aria-label={`Look up ${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Example sentence */}
          {result.exampleSentence && (
            <div className="card" style={{ padding: '20px 24px', marginBottom: 14 }}>
              <SectionLabel>Example</SectionLabel>
              <blockquote style={{
                borderLeft: '2px solid var(--parchment)',
                paddingLeft: 16, margin: 0,
                fontSize: 14.5, color: 'var(--text-secondary)',
                fontStyle: 'italic', lineHeight: 1.7,
                fontFamily: "'Lora', serif",
              }}>
                "{result.exampleSentence}"
              </blockquote>
            </div>
          )}

          {/* Lookup another */}
          <button
            onClick={reset}
            className="btn btn-ghost btn-sm"
            style={{ gap: 6, marginTop: 4 }}
          >
            <RotateCcw size={13} />
            Look up another word
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.85s linear infinite; }`}</style>
    </div>
  );
};

export default DictionaryPage;
