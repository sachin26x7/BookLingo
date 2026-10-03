import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Bookmark,
  Maximize2, Minimize2, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { booksService, progressService, readerService } from '../../services/books.service';
import { aiService, vocabularyService } from '../../services/vocabulary.service';
import { useReaderStore } from '../../store/readerStore';
import { useAuthStore } from '../../store/authStore';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../constants/languages';
import type { Book } from '../../types';
import WordPopup from '../../components/reader/WordPopup';

pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ─────────────────────────────────────────────── */
const THEME_OPTIONS: {
  key: 'light' | 'sepia' | 'dark';
  bg: string;
  text: string;
  border: string;
  dot: string;
}[] = [
  { key: 'light', bg: '#ffffff',  text: '#1e1a14', border: '#e8e0d5', dot: '#ffffff' },
  { key: 'sepia', bg: '#f2e8d8',  text: '#2e1f0a', border: '#d8c5a8', dot: '#f2e8d8' },
  { key: 'dark',  bg: '#18140f',  text: '#ede8de', border: '#342e24', dot: '#18140f' },
];

const ReaderPage: React.FC = () => {
  const { bookId }    = useParams<{ bookId: string }>();
  const navigate      = useNavigate();
  const { user, accessToken } = useAuthStore();
  const {
    currentPage, settings,
    popupVisible, selectedWord, explanation, isExplaining,
    setCurrentBook, setCurrentPage, setTotalPages, setSettings,
    showWordPopup, setExplanation, setIsExplaining, hidePopup,
    bookmarks, setBookmarks, addBookmark, removeBookmark,
  } = useReaderStore();

  const [book, setBook]           = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [numPages, setNumPages]   = useState(0);
  const [inputPage, setInputPage] = useState('1');
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme]         = useState<'light' | 'sepia' | 'dark'>(user?.theme ?? 'light');
  const [meaningLanguage, setMeaningLanguage] = useState<SupportedLanguage>(
    () => SUPPORTED_LANGUAGES.find((language) => language === user?.preferredLanguage) || 'Hindi'
  );
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [sessionStart] = useState(Date.now());

  const pageRef        = useRef<HTMLDivElement>(null);
  const progressTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fontPanelRef   = useRef<HTMLDivElement>(null);

  const pdfUrl = bookId ? booksService.getFileUrl(bookId) : '';
  const tc     = THEME_OPTIONS.find((t) => t.key === theme) ?? THEME_OPTIONS[0];

  /* ── Load book ── */
  useEffect(() => {
    if (!bookId) return;
    (async () => {
      try {
        const { data } = await booksService.getOne(bookId);
        setBook(data.data.book);
        setCurrentBook(data.data.book);
        if (data.data.progress?.currentPage) {
          setCurrentPage(data.data.progress.currentPage);
          setInputPage(String(data.data.progress.currentPage));
        }
        const bkRes = await readerService.getBookmarks(bookId);
        setBookmarks(bkRes.data.data || []);
      } catch {
        toast.error('Failed to load book');
        navigate('/library');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [bookId]);

  /* ── Apply theme ── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    return () => {
      document.documentElement.setAttribute('data-theme', user?.theme ?? 'light');
    };
  }, [theme]);

  /* ── Save progress ── */
  useEffect(() => {
    if (!bookId || !numPages) return;
    clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      const minutes = Math.round((Date.now() - sessionStart) / 60000);
      progressService
        .updateProgress(bookId, { currentPage, totalPages: numPages, timeSpentMinutes: minutes > 0 ? 1 : 0 })
        .catch(() => {});
    }, 2000);
    setInputPage(String(currentPage));
  }, [currentPage, numPages, bookId]);

  /* ── Update total pages ── */
  useEffect(() => {
    if (numPages > 0 && bookId) {
      setTotalPages(numPages);
      booksService.updateMetadata(bookId, { totalPages: numPages }).catch(() => {});
    }
  }, [numPages]);

  /* ── Close font panel on outside click ── */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (fontPanelRef.current && !fontPanelRef.current.contains(e.target as Node)) {
        setShowFontPanel(false);
      }
    };
    if (showFontPanel) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFontPanel]);

  /* ── Word selection ── */
  const handleTextSelection = useCallback((_event: MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selected = sel.toString().trim();
    if (selected.length < 2 || selected.length > 200) return;

    const range    = sel.getRangeAt(0);
    const fullText = range.startContainer.textContent || '';
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()) || [];
    const sentenceIndex = sentences.findIndex((part) => part.includes(selected));
    const sentence = sentenceIndex >= 0 ? sentences[sentenceIndex] : selected;
    const rect      = range.getBoundingClientRect();

    showWordPopup({
      word: selected,
      sentence,
      paragraph: fullText.substring(0, 500),
      previousSentence: sentenceIndex > 0 ? sentences[sentenceIndex - 1] : undefined,
      nextSentence: sentenceIndex >= 0 ? sentences[sentenceIndex + 1] : undefined,
      position: { x: rect.left + rect.width / 2, y: rect.top - 10 },
    });
  }, [showWordPopup]);

  /* ── AI explanation ── */
  useEffect(() => {
    if (!selectedWord || !popupVisible) return;
    let active = true;
    (async () => {
      setIsExplaining(true);
      try {
        const { data } = await aiService.explainWord({
          word: selectedWord.word,
          sentence: selectedWord.sentence,
          paragraph: selectedWord.paragraph,
          previousSentence: selectedWord.previousSentence,
          nextSentence: selectedWord.nextSentence,
          targetLanguage: meaningLanguage,
          userLevel: user?.proficiencyLevel || 'intermediate',
        });
        if (active) setExplanation(data.data || null);
      } catch {
        if (active) {
          toast.error('Could not load explanation');
          setExplanation(null);
        }
      } finally {
        if (active) setIsExplaining(false);
      }
    })();
    return () => { active = false; };
  }, [selectedWord, popupVisible, meaningLanguage, user?.proficiencyLevel, setExplanation, setIsExplaining]);

  /* ── Save word ── */
  const saveWord = async () => {
    if (!explanation || !book || !selectedWord) return;
    try {
      await vocabularyService.saveWord({
        bookId: book._id, bookTitle: book.title,
        word: explanation.word, sentence: selectedWord.sentence,
        paragraph: selectedWord.paragraph, pageNumber: currentPage,
        contextualMeaning: explanation.contextualMeaning,
        simpleExplanation: explanation.simpleExplanation,
        translation: explanation.translation,
        targetLanguage: meaningLanguage,
        partOfSpeech: explanation.partOfSpeech,
        pronunciation: explanation.pronunciation,
        synonyms: explanation.synonyms,
        exampleSentence: explanation.exampleSentence,
      });
      toast.success(`"${explanation.word}" saved`);
      hidePopup();
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast('Already in your vocabulary', { icon: 'ℹ️' });
      } else {
        toast.error('Failed to save');
      }
    }
  };

  /* ── Bookmark toggle ── */
  const toggleBookmark = async () => {
    if (!bookId) return;
    const existing = bookmarks.find((b) => b.pageNumber === currentPage);
    if (existing) {
      await readerService.deleteBookmark(existing._id);
      removeBookmark(existing._id);
      toast.success('Bookmark removed');
    } else {
      const { data } = await readerService.createBookmark({ bookId, pageNumber: currentPage });
      addBookmark(data.data);
      toast.success(`Page ${currentPage} bookmarked`);
    }
  };

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, numPages));
    setCurrentPage(clamped);
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isBookmarked  = bookmarks.some((b) => b.pageNumber === currentPage);
  const progressPct   = numPages > 0 ? (currentPage / numPages) * 100 : 0;

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div style={{
        height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: tc.bg, flexDirection: 'column', gap: 12,
      }}>
        <Loader2 size={32} color="var(--accent)" className="spin" />
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Opening book…</p>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: tc.bg,
      color: tc.text,
      transition: 'background 0.3s ease, color 0.3s ease',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ══ TOOLBAR ══════════════════════════════════ */}
      {!focusMode && (
        <header
          aria-label="Reader toolbar"
          style={{
            height: 52,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 16px',
            borderBottom: `1px solid ${tc.border}`,
            flexShrink: 0,
            zIndex: 20,
            background: tc.bg,
          }}
        >
          {/* Back */}
          <button
            onClick={() => navigate('/library')}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Back to library"
            style={{ color: tc.text, opacity: 0.65, flexShrink: 0 }}
          >
            <ArrowLeft size={16} />
          </button>

          {/* Book title + progress */}
          <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
            <span style={{
              fontSize: 13.5, fontWeight: 500, fontFamily: "'Lora', serif",
              color: tc.text, display: 'block',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {book?.title}
            </span>
          </div>

          {/* ── Page navigation ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Previous page"
              style={{ color: tc.text }}
            >
              <ChevronLeft size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <input
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const p = parseInt(inputPage);
                    if (!isNaN(p)) goToPage(p);
                  }
                }}
                onBlur={() => {
                  const p = parseInt(inputPage);
                  if (!isNaN(p)) goToPage(p);
                }}
                aria-label="Page number"
                style={{
                  width: 40, textAlign: 'center',
                  padding: '2px 4px',
                  background: 'transparent',
                  border: `1px solid ${tc.border}`,
                  borderRadius: 5,
                  color: tc.text,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <span style={{ color: tc.text, opacity: 0.5 }}>/ {numPages}</span>
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Next page"
              style={{ color: tc.text }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Spacer */}
          <div style={{ width: 1, height: 20, background: tc.border, margin: '0 4px' }} />

          {/* ── Zoom ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setSettings({ zoom: Math.max(0.5, settings.zoom - 0.1) })}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Zoom out"
              style={{ color: tc.text }}
            >
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: 12, color: tc.text, opacity: 0.7, minWidth: 34, textAlign: 'center' }}>
              {Math.round(settings.zoom * 100)}%
            </span>
            <button
              onClick={() => setSettings({ zoom: Math.min(2.5, settings.zoom + 0.1) })}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Zoom in"
              style={{ color: tc.text }}
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: tc.border, margin: '0 4px' }} />

          {/* ── Theme dots ── */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            {THEME_OPTIONS.map(({ key, dot }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                aria-label={`${key} theme`}
                style={{
                  width: 18, height: 18,
                  borderRadius: '50%',
                  background: dot,
                  border: `2px solid ${theme === key ? 'var(--accent)' : tc.border}`,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: tc.border, margin: '0 4px' }} />

          {/* ── Bookmark ── */}
          <button
            onClick={toggleBookmark}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark page'}
            style={{ color: isBookmarked ? 'var(--accent)' : tc.text }}
          >
            <Bookmark size={15} fill={isBookmarked ? 'var(--accent)' : 'none'} />
          </button>

          {/* ── Focus mode ── */}
          <button
            onClick={() => setFocusMode(true)}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Enter focus mode"
            title="Focus mode"
            style={{ color: tc.text }}
          >
            <Maximize2 size={14} />
          </button>
        </header>
      )}

      {/* Focus mode floating controls */}
      {focusMode && (
        <div style={{
          position: 'fixed',
          top: 16, right: 16,
          display: 'flex',
          gap: 6,
          zIndex: 100,
          animation: 'page-in 0.18s ease forwards',
        }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{
              width: 36, height: 36,
              borderRadius: 8,
              background: 'rgba(30,20,10,0.55)',
              border: 'none',
              color: '#f0ead8',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{
            padding: '0 14px',
            borderRadius: 8,
            background: 'rgba(30,20,10,0.55)',
            color: '#f0ead8',
            fontSize: 13,
            display: 'flex', alignItems: 'center',
            backdropFilter: 'blur(6px)',
            gap: 4,
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currentPage}</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ opacity: 0.5 }}>{numPages}</span>
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            style={{
              width: 36, height: 36,
              borderRadius: 8,
              background: 'rgba(30,20,10,0.55)',
              border: 'none',
              color: '#f0ead8',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={() => setFocusMode(false)}
            style={{
              width: 36, height: 36,
              borderRadius: 8,
              background: 'rgba(30,20,10,0.55)',
              border: 'none',
              color: '#f0ead8',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
            aria-label="Exit focus mode"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      )}

      {/* ══ PDF VIEWPORT ═════════════════════════════ */}
      <div
        ref={pageRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: focusMode ? '52px 24px' : '32px 24px',
          background: tc.bg,
          position: 'relative',
        }}
        onMouseUp={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-word-popup]')) return;
          handleTextSelection(event.nativeEvent);
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: settings.zoom * 760,
          userSelect: 'text',
        }}>
          <Document
            file={pdfUrl}
            options={accessToken ? {
              httpHeaders: { Authorization: `Bearer ${accessToken}` },
            } : undefined}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => {
              console.error(err);
              toast.error('Failed to load PDF');
            }}
            loading={
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 60, gap: 12,
              }}>
                <Loader2 size={28} color="var(--accent)" className="spin" />
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading PDF…</p>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={settings.zoom}
              renderTextLayer
              renderAnnotationLayer
              canvasBackground={theme === 'dark' ? '#ffffff' : tc.bg}
              className="page-fade"
            />
          </Document>
        </div>

        {/* Word popup */}
        {popupVisible && selectedWord && (
          <WordPopup
            word={selectedWord.word}
            position={selectedWord.position}
            explanation={explanation}
            isLoading={isExplaining}
            targetLanguage={meaningLanguage}
            languages={SUPPORTED_LANGUAGES}
            onTargetLanguageChange={setMeaningLanguage}
            onClose={hidePopup}
            onSave={saveWord}
          />
        )}
      </div>

      {/* ══ READING PROGRESS BAR ═════════════════════ */}
      {numPages > 0 && (
        <div style={{
          height: 2,
          background: tc.border,
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'var(--accent)',
            transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
          }} />
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes page-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-page {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .spin { animation: spin 0.85s linear infinite; }
        .page-fade { animation: fade-page 0.18s ease forwards; }
        .react-pdf__Page { display: flex; justify-content: center; }
        .react-pdf__Page canvas {
          max-width: 100%;
          height: auto !important;
          border-radius: 2px;
          box-shadow: 0 2px 24px rgba(30,20,10,0.10);
        }
        [data-theme="dark"] .react-pdf__Page canvas {
          box-shadow: 0 2px 24px rgba(0,0,0,0.4);
        }
      `}</style>
    </div>
  );
};

export default ReaderPage;
