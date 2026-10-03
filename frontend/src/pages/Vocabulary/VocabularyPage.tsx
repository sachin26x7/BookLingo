import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, BookMarked, Trash2, ChevronDown, ChevronUp,
  Volume2, RotateCcw, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { vocabularyService } from '../../services/vocabulary.service';
import type { SavedWord, VocabStats, ReviewStatus } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { speakText } from '../../utils/speech';

/* ─── Status config ─────────────────────────────── */
type StatusInfo = { label: string; color: string; bg: string };
const STATUS_MAP: Record<ReviewStatus, StatusInfo> = {
  new:      { label: 'New',      color: '#2563eb', bg: '#dbeafe' },
  review:   { label: 'Review',   color: '#b45309', bg: '#fef3c7' },
  familiar: { label: 'Familiar', color: '#16a34a', bg: '#dcfce7' },
  learned:  { label: 'Learned',  color: '#5c7352', bg: '#d0dac8' },
};

const FILTER_TABS: { key: '' | ReviewStatus; label: string }[] = [
  { key: '',         label: 'All'       },
  { key: 'new',      label: 'New'       },
  { key: 'review',   label: 'Review'    },
  { key: 'familiar', label: 'Familiar'  },
  { key: 'learned',  label: 'Learned'   },
];

/* ═══════════════════════════════════════════════ */
const VocabularyPage: React.FC = () => {
  const [words, setWords]       = useState<SavedWord[]>([]);
  const [stats, setStats]       = useState<VocabStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | ReviewStatus>('');
  const [sortBy, setSortBy]     = useState('newest');
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wRes, sRes] = await Promise.all([
        vocabularyService.getAll({
          page,
          limit: 18,
          status: activeFilter || undefined,
          sort: sortBy,
          search: submittedSearch || undefined,
        }),
        vocabularyService.getStats(),
      ]);
      setWords(wRes.data.data?.words || []);
      setTotalPages(wRes.data.data?.pagination.pages || 1);
      setStats(sRes.data.data);
    } catch {
      toast.error('Failed to load vocabulary');
    } finally {
      setIsLoading(false);
    }
  }, [page, activeFilter, sortBy, submittedSearch]);

  useEffect(() => { loadData(); }, [loadData]);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this word?')) return;
    await vocabularyService.delete(id);
    setWords((prev) => prev.filter((w) => w._id !== id));
    toast.success('Word removed');
  };

  const handleReview = async (id: string, status: ReviewStatus) => {
    await vocabularyService.update(id, { reviewStatus: status });
    setWords((prev) => prev.map((w) => w._id === id ? { ...w, reviewStatus: status } : w));
  };

  return (
    <div style={{ padding: '36px 40px', maxWidth: 920 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Lora', serif",
          fontSize: 24, fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 5,
          letterSpacing: '-0.3px',
        }}>
          Vocabulary
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {stats?.total ?? 0} words saved · {stats?.learned ?? 0} learned
          {stats && stats.review > 0 && (
            <span style={{
              marginLeft: 10,
              fontSize: 12.5,
              padding: '2px 9px',
              borderRadius: 99,
              background: '#fef3c7',
              color: '#b45309',
              fontWeight: 500,
            }}>
              {stats.review} to review
            </span>
          )}
        </p>
      </div>

      {/* ── Filter tabs ── */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
        overflowX: 'auto',
      }}>
        {FILTER_TABS.map(({ key, label }) => {
          const count = key === ''
            ? stats?.total
            : key === 'new' ? stats?.new
            : key === 'review' ? stats?.review
            : key === 'familiar' ? stats?.familiar
            : stats?.learned;

          return (
            <button
              key={key}
              onClick={() => { setActiveFilter(key); setPage(1); }}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13.5,
                fontWeight: activeFilter === key ? 600 : 400,
                color: activeFilter === key ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeFilter === key ? 'var(--accent)' : 'transparent'}`,
                transition: 'color 0.14s, border-color 0.14s',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  background: activeFilter === key ? 'var(--accent-faint)' : 'var(--cream)',
                  color: activeFilter === key ? 'var(--accent)' : 'var(--ink-faint)',
                  padding: '1px 6px', borderRadius: 99,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search & Sort row ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={14}
              style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none',
              }}
            />
            <input
              className="input"
              placeholder="Search words…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
              aria-label="Search vocabulary"
            />
          </div>
          {search && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => { setSearch(''); setPage(1); setSubmittedSearch(''); }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>

        <select
          className="input"
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          style={{ width: 140 }}
          aria-label="Sort words"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="alphabetical">A → Z</option>
        </select>
      </div>

      {/* ── Word list ── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
          ))}
        </div>
      ) : words.length === 0 ? (
        <EmptyState search={search} filter={activeFilter} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {words.map((word) => (
            <WordCard
              key={word._id}
              word={word}
              onDelete={handleDelete}
              onReview={handleReview}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center',
          alignItems: 'center', gap: 10, marginTop: 32,
        }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="btn btn-secondary btn-sm"
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="btn btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Empty state ───────────────────────────────── */
const EmptyState: React.FC<{ search: string; filter: string }> = ({ search, filter }) => (
  <div style={{ textAlign: 'center', padding: '64px 40px' }}>
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: 'var(--accent-faint)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 18px',
    }}>
      <BookMarked size={26} color="var(--accent)" />
    </div>
    <h3 style={{
      fontFamily: "'Lora', serif", fontSize: 17,
      color: 'var(--text-primary)', marginBottom: 8,
    }}>
      {search ? `No results for "${search}"` : filter ? `No ${filter} words yet` : 'Your vocabulary is empty'}
    </h3>
    <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {!search && 'Select words while reading to build your personal dictionary.'}
    </p>
  </div>
);

/* ─── Word card ─────────────────────────────────── */
const WordCard: React.FC<{
  word: SavedWord;
  onDelete: (id: string) => void;
  onReview: (id: string, status: ReviewStatus) => void;
}> = ({ word, onDelete, onReview }) => {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_MAP[word.reviewStatus];

  const speak = () => {
    speakText(word.word);
  };

  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      {/* ── Top row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Word + metadata row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <h3 style={{
              fontFamily: "'Lora', serif",
              fontSize: 18, fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>
              {word.word}
            </h3>
            {word.partOfSpeech && (
              <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' }}>
                {word.partOfSpeech}
              </span>
            )}
            {word.pronunciation && (
              <span style={{
                fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-muted)', letterSpacing: '0.02em',
              }}>
                {word.pronunciation}
              </span>
            )}
          </div>

          {/* Meaning */}
          {word.translation && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>
                {word.translation}
              </p>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{word.targetLanguage}</span>
            </div>
          )}
          {word.contextualMeaning && (
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 4 }}>
              {word.translation ? `In context: ${word.contextualMeaning}` : word.contextualMeaning}
            </p>
          )}

          {/* Metadata: book + page + date */}
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 5 }}>
            {word.bookTitle} · p.{word.pageNumber} ·{' '}
            {formatDistanceToNow(new Date(word.savedAt), { addSuffix: true })}
          </p>
        </div>

        {/* Right actions */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'flex-end', gap: 6, flexShrink: 0,
        }}>
          {/* Status badge */}
          <span style={{
            fontSize: 11.5, padding: '3px 9px', borderRadius: 99,
            background: status.bg, color: status.color, fontWeight: 500,
          }}>
            {status.label}
          </span>

          {/* Icon row */}
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              onClick={speak}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Pronounce ${word.word}`}
              title="Pronounce"
            >
              <Volume2 size={13} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="btn btn-ghost btn-icon btn-sm"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse' : 'Expand details'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              onClick={() => onDelete(word._id)}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Delete ${word.word}`}
              style={{ color: '#b94040' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: '1px solid var(--border-light)',
          animation: 'expand-in 0.16s ease forwards',
        }}>

          {/* Original sentence */}
          <div style={{ marginBottom: 14 }}>
            <Label>Original context</Label>
            <blockquote style={{
              borderLeft: '2px solid var(--accent-light)',
              paddingLeft: 12,
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              lineHeight: 1.65,
              margin: 0,
            }}>
              {word.sentence}
              <cite style={{
                display: 'block',
                fontSize: 11, color: 'var(--ink-faint)',
                marginTop: 4, fontStyle: 'normal',
              }}>
                — {word.bookTitle}, page {word.pageNumber}
              </cite>
            </blockquote>
          </div>

          {/* Simple explanation */}
          {word.simpleExplanation && (
            <div style={{ marginBottom: 14 }}>
              <Label>Explanation</Label>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                {word.simpleExplanation}
              </p>
            </div>
          )}

          {/* Synonyms */}
          {word.synonyms?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Label>Synonyms</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {word.synonyms.map((s) => (
                  <span key={s} style={{
                    fontSize: 12, padding: '3px 9px',
                    background: 'var(--cream)', border: '1px solid var(--border)',
                    borderRadius: 99, color: 'var(--text-secondary)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Example */}
          {word.exampleSentence && (
            <div style={{ marginBottom: 14 }}>
              <Label>Example</Label>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.65 }}>
                "{word.exampleSentence}"
              </p>
            </div>
          )}

          {/* Mark as */}
          <div>
            <Label>Mark as</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(STATUS_MAP) as ReviewStatus[]).map((s) => {
                const info = STATUS_MAP[s];
                const active = word.reviewStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => onReview(word._id, s)}
                    className="btn btn-sm"
                    aria-pressed={active}
                    style={{
                      background: active ? info.bg : 'var(--cream)',
                      color: active ? info.color : 'var(--text-muted)',
                      border: `1px solid ${active ? info.color + '50' : 'var(--border)'}`,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {active && <RotateCcw size={11} />}
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>
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
};

/* Shared label */
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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

export default VocabularyPage;
