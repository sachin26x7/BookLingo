import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, ArrowRight, Play, Plus, Clock3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { progressService } from '../../services/books.service';
import type { ReadingStats } from '../../types';
import { formatDistanceToNow } from 'date-fns';

/* ─── Progress bar ─────────────────────────────── */
const ProgressBar: React.FC<{ value: number; color?: string }> = ({
  value,
  color = 'var(--accent)',
}) => (
  <div className="progress-track" style={{ height: 3 }}>
    <div
      className="progress-fill"
      style={{ width: `${Math.min(100, value)}%`, background: color }}
    />
  </div>
);

/* ─── Subtle stat row item ─────────────────────── */
const StatItem: React.FC<{
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}> = ({ icon: Icon, label, value, sub, color = 'var(--accent)' }) => (
  <div className="dashboard-stat-card">
    <span className="dashboard-stat-icon" style={{ color }} aria-hidden="true">
      <Icon size={30} strokeWidth={1.6} />
    </span>
    <div className="dashboard-stat-copy">
      <div className="dashboard-stat-value">{value}</div>
      <div className="dashboard-stat-label">{label}</div>
      {sub && <div className="dashboard-stat-sub">{sub}</div>}
    </div>
  </div>
);

/* ─── Section heading ──────────────────────────── */
const SectionHead: React.FC<{
  title: string;
  linkTo?: string;
  linkLabel?: string;
}> = ({ title, linkTo, linkLabel = 'View all' }) => (
  <div className="dashboard-section-head">
    <h2>{title}</h2>
    {linkTo && (
      <Link
        to={linkTo}
        className="dashboard-section-link"
      >
        {linkLabel} <ArrowRight size={12} />
      </Link>
    )}
  </div>
);

/* ═══════════════════════════════════════════════ */
const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null);
  const [continueReading, setContinueReading] = useState<any[]>([]);
  const [isLoading, setIsLoading]       = useState(true);

  const loadDashboard = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        progressService.getStats(),
        progressService.getContinueReading(),
      ]);
      setReadingStats(sRes.data.data);
      setContinueReading(cRes.data.data || []);
    } catch {
      /* fail silently — UI handles empty states */
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    const refreshAfterLibraryChange = () => { void loadDashboard(); };
    void loadDashboard(true);
    window.addEventListener('library-books-changed', refreshAfterLibraryChange);
    return () => window.removeEventListener('library-books-changed', refreshAfterLibraryChange);
  }, []);

  const hour     = new Date().getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'Reader';

  if (isLoading) {
    return (
      <div className="dashboard-page dashboard-loading">
        <div className="skeleton" style={{ height: 38, width: 300, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 16, width: 240, marginBottom: 34 }} />
        <div className="dashboard-stats-grid">
          {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}
        </div>
        <div className="skeleton" style={{ height: 280, marginTop: 28 }} />
      </div>
    );
  }

  return (
    <div className="dashboard-page">

      {/* ── Header greeting ── */}
      <div className="dashboard-greeting">
        <div>
          <span className="dashboard-eyebrow">YOUR READING SPACE</span>
          <h1>{greeting}, {firstName}</h1>
          <p>
          {continueReading.length > 0
            ? `You have ${continueReading.length} book${continueReading.length > 1 ? 's' : ''} in progress.`
            : 'Ready to start reading? Head to your library.'}
          </p>
        </div>
      </div>

      {/* ── Stats strip (subtle, not dominant) ── */}
      {readingStats && (
        <div className="dashboard-stats-grid">
          <StatItem
            icon={BookOpen}
            label="Total books"
            value={readingStats.totalBooks ?? 0}
            sub={`${readingStats.activeBooks ?? 0} in progress`}
            color="var(--text-primary)"
          />
          <StatItem
            icon={Clock3}
            label="Hours read"
            value={`${Math.round((readingStats.totalReadingMinutes ?? 0) / 60)}h`}
            sub={`${readingStats.totalReadingMinutes ?? 0} min total`}
            color="var(--sage)"
          />
        </div>
      )}

      {/* ── Main layout: 2 columns ── */}
      <div className="dashboard-content-grid">

        {/* ── Left: Continue Reading ── */}
        <div>
          <SectionHead title="Continue Reading" linkTo="/library" linkLabel="All books" />

          {continueReading.length === 0 ? (
            <div className="dashboard-empty card">
              <div className="dashboard-empty-art" aria-hidden="true">
                <img
                  src="https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=85"
                  alt=""
                  loading="lazy"
                />
              </div>
              <div className="dashboard-empty-copy">
                <h3>Your reading journey awaits</h3>
                <span className="dashboard-ornament" aria-hidden="true"><i /></span>
                <p>Add a book to your library and start your next chapter.</p>
                <Link to="/library" className="btn btn-primary dashboard-add-book">
                  <Plus size={17} />
                  Add a book
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {continueReading.slice(0, 5).map((item, idx) => (
                <BookProgressRow key={item._id} item={item} index={idx} />
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

/* ─── Individual book progress row ─────────────── */
const BookProgressRow: React.FC<{ item: any; index: number }> = ({ item, index }) => {
  const colors = ['#7a5535', '#5c7352', '#5b7fa6', '#a06b40', '#7060a0'];
  const color  = colors[index % colors.length];

  return (
    <div
      className="card card-hover dashboard-book-row"
    >
      <div className="dashboard-book-row-inner">
        {/* Book icon */}
        <div className="dashboard-book-cover" style={{ color, background: `${color}18`, borderColor: `${color}28` }}>
          <BookOpen size={18} color={color} />
        </div>

        {/* Info */}
        <div className="dashboard-book-info">
          <h3 className="dashboard-book-title">
            {item.bookId?.title || 'Untitled'}
          </h3>
          <p className="dashboard-book-meta">
            Page {item.currentPage} of {item.totalPages} ·{' '}
            {formatDistanceToNow(new Date(item.lastReadAt), { addSuffix: true })}
          </p>
          <ProgressBar value={item.progressPercent ?? 0} color={color} />
          <p className="dashboard-book-completion">
            {Math.round(item.progressPercent ?? 0)}% complete
          </p>
        </div>

        {/* Continue button */}
        <Link
          to={`/reader/${item.bookId?._id}`}
          className="btn btn-ghost btn-icon"
          title="Continue reading"
          aria-label="Continue reading"
          style={{ background: 'var(--cream)', color, border: `1px solid ${color}28`, flexShrink: 0 }}
        >
          <Play size={13} fill={color} />
        </Link>
      </div>
    </div>
  );
};

export default DashboardPage;
