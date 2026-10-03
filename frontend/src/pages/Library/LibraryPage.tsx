import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Upload, BookOpen, Search, Trash2, Play, X, FileText } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { booksService } from '../../services/books.service';
import { useReaderStore } from '../../store/readerStore';
import type { Book } from '../../types';

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/* ─── Book spine color from title ──────────────── */
const spineColor = (title: string) => {
  const PALETTE = [
    { bg: '#eddec8', text: '#7a5535' },
    { bg: '#d0dac8', text: '#4a6640' },
    { bg: '#cdd5e0', text: '#3d5070' },
    { bg: '#e8d8d8', text: '#8a4040' },
    { bg: '#ddd0e8', text: '#6a4080' },
    { bg: '#d8e4d0', text: '#405840' },
  ];
  const idx = title.charCodeAt(0) % PALETTE.length;
  return PALETTE[idx];
};

const LibraryPage: React.FC = () => {
  const [books, setBooks]               = useState<Book[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [isUploading, setIsUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [search, setSearch]             = useState('');
  const [showModal, setShowModal]       = useState(false);
  const [uploadTitle, setUploadTitle]   = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [pendingFile, setPendingFile]   = useState<File | null>(null);

  const loadBooks = async () => {
    try {
      const { data } = await booksService.getAll();
      setBooks(data.data?.books || []);
    } catch {
      toast.error('Failed to load library');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadBooks(); }, []);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setPendingFile(file);
    setUploadTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '));
    setShowModal(true);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    noClick: true,
  });

  const handleUpload = async () => {
    if (!pendingFile) return;
    setIsUploading(true);
    setShowModal(false);
    const interval = setInterval(() => setUploadProgress((p) => Math.min(p + 12, 90)), 180);
    try {
      await booksService.upload(pendingFile, uploadTitle, uploadAuthor);
      clearInterval(interval);
      setUploadProgress(100);
      toast.success('Book added to your library');
      await loadBooks();
      window.dispatchEvent(new Event('library-books-changed'));
    } catch (err: any) {
      const message = err.response?.data?.message || 'Upload failed';
      if (err.response?.status === 409) toast(message, { icon: 'ℹ️' });
      else toast.error(message);
    } finally {
      clearInterval(interval);
      setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 600);
      setPendingFile(null); setUploadTitle(''); setUploadAuthor('');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete "${title}" and its reading history? Saved words will be kept.`)) return;
    try {
      await booksService.delete(id);
      useReaderStore.getState().clearBookState(id);
      await loadBooks();
      window.dispatchEvent(new Event('library-books-changed'));
      toast.success('Book and reading history deleted. Saved words were kept.');
    } catch { toast.error('Could not delete book'); }
  };

  const filtered = books.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    (b.author || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div {...getRootProps()} className={`library-page${isDragActive ? ' is-drag-active' : ''}`}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(122, 85, 53, 0.08)',
          border: '2px dashed var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'var(--accent-faint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Upload size={32} color="var(--accent)" />
            </div>
            <p style={{ fontFamily: "'Lora', serif", fontSize: 20, color: 'var(--accent)', fontWeight: 600 }}>
              Drop your PDF here
            </p>
          </div>
        </div>
      )}

      {/* Upload progress toast-like banner */}
      {isUploading && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '14px 20px',
          boxShadow: 'var(--shadow-lg)', zIndex: 300, width: 'min(360px, calc(100vw - 32px))',
          animation: 'library-progress-in 0.2s ease forwards',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }}>
              Uploading…
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{uploadProgress}%</span>
          </div>
          <div className="progress-track" style={{ height: 4 }}>
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="library-header">
        <div>
          <h1 style={{
            fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 5, letterSpacing: '-0.3px',
          }}>
            My Library
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {books.length} book{books.length !== 1 ? 's' : ''} · Drop a PDF anywhere to add
          </p>
        </div>

        <div className="library-header-actions">
          {/* Search */}
          <div className="library-search">
            <Search size={14} style={{
              position: 'absolute', left: 11, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
              pointerEvents: 'none',
            }} />
            <input
              className="input"
              placeholder="Search library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
              aria-label="Search books"
            />
          </div>

          {/* Upload button */}
          <label className="btn btn-primary library-upload-trigger">
            <Upload size={14} />
            Upload PDF
            <input
              type="file"
              accept=".pdf"
              className="library-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDrop([file]);
                e.target.value = '';
              }}
              aria-label="Upload PDF file"
            />
          </label>
        </div>
      </div>

      {/* ── Book grid ── */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 230, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyLibrary hasSearch={!!search} onFileSelect={onDrop} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {filtered.map((book) => (
            <BookCard key={book._id} book={book} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* ── Upload modal ── */}
      {showModal && (
        createPortal(
          <UploadModal
            file={pendingFile}
            title={uploadTitle}
            author={uploadAuthor}
            onChangeTitle={setUploadTitle}
            onChangeAuthor={setUploadAuthor}
            onCancel={() => { setShowModal(false); setPendingFile(null); }}
            onConfirm={handleUpload}
          />,
          document.body
        )
      )}

      <style>{`
        @keyframes library-progress-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

/* ─── Book card ─────────────────────────────────── */
const BookCard: React.FC<{
  book: Book;
  onDelete: (id: string, title: string) => void;
}> = ({ book, onDelete }) => {
  const { bg, text } = spineColor(book.title);
  const progress = book.progress?.progressPercent ?? 0;
  const hasProgress = !!book.progress;

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden',
        transition: 'box-shadow 0.16s ease, transform 0.16s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = 'var(--shadow-md)';
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = '';
        el.style.transform = '';
      }}
    >
      {/* Book cover */}
      <div style={{
        height: 130,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Spine detail */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 6, background: `${text}30`,
        }} />

        <BookOpen size={30} color={text} style={{ opacity: 0.7 }} />

        {/* Delete button */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(book._id, book.title); }}
          title="Remove book from library"
          aria-label={`Remove ${book.title} from library. Saved words and notes will be kept.`}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 26, height: 26, borderRadius: 6,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(30,20,10,0.12)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6a4930',
            transition: 'background 0.15s',
            opacity: 1,
          }}
          className="book-delete-btn"
        >
          <Trash2 size={12} />
        </button>

        {/* Progress badge */}
        {hasProgress && progress > 0 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            fontSize: 10.5, fontWeight: 600,
            background: 'rgba(30,20,10,0.45)',
            color: 'rgba(255,255,255,0.9)',
            padding: '2px 7px', borderRadius: 99,
            backdropFilter: 'blur(4px)',
          }}>
            {Math.round(progress)}%
          </div>
        )}
      </div>

      {/* Progress strip */}
      {hasProgress && (
        <div style={{ height: 2, background: 'var(--cream)' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: text,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <h3
          style={{
            fontSize: 13, fontWeight: 600,
            fontFamily: "'Lora', serif",
            color: 'var(--text-primary)',
            marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={book.title}
        >
          {book.title}
        </h3>

        {book.author && (
          <p style={{
            fontSize: 11.5, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 6,
          }}>
            {book.author}
          </p>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <FileText size={10} />
            {formatSize(book.fileSize)}
          </span>

          <Link
            to={`/reader/${book._id}`}
            className="btn btn-sm"
            style={{
              background: bg, color: text, padding: '4px 10px',
              border: `1px solid ${text}30`,
              fontSize: 11.5, fontWeight: 600,
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={hasProgress ? `Continue reading ${book.title}` : `Read ${book.title}`}
          >
            <Play size={10} fill={text} />
            {hasProgress ? 'Continue' : 'Read'}
          </Link>
        </div>
      </div>
    </div>
  );
};

/* ─── Empty library ─────────────────────────────── */
const EmptyLibrary: React.FC<{
  hasSearch: boolean;
  onFileSelect: (files: File[]) => void;
}> = ({ hasSearch, onFileSelect }) => hasSearch ? (
  <div className="library-no-results">
    <Search size={22} aria-hidden="true" />
    <h2>No books match your search</h2>
    <p>Try different keywords or clear your search.</p>
  </div>
) : (
  <section className="library-empty-upload" aria-labelledby="empty-library-title">
    <div className="library-empty-icon" aria-hidden="true">
      <FileText size={28} />
      <span>PDF</span>
    </div>
    <p className="library-upload-eyebrow">YOUR SHELF STARTS HERE</p>
    <h2 id="empty-library-title">Bring your next book in.</h2>
    <p className="library-upload-description">
      Drop a PDF anywhere in this window, or choose a file to add it to your library.
    </p>
    <label className="btn btn-primary library-empty-trigger">
      <Upload size={15} />
      Choose a PDF
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="library-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelect([file]);
          event.target.value = '';
        }}
        aria-label="Choose a PDF to upload"
      />
    </label>
    <p className="library-upload-hint">PDF files only</p>
  </section>
);

/* ─── Upload modal ──────────────────────────────── */
const UploadModal: React.FC<{
  file: File | null;
  title: string;
  author: string;
  onChangeTitle: (v: string) => void;
  onChangeAuthor: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ file, title, author, onChangeTitle, onChangeAuthor, onCancel, onConfirm }) => (
  <div className="library-modal-backdrop"
    onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
  >
    <div
      className="card popup-enter library-upload-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <h3
          id="upload-modal-title"
          style={{ fontFamily: "'Lora', serif", fontSize: 18, color: 'var(--text-primary)' }}
        >
          Add to library
        </h3>
        <button onClick={onCancel} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      {/* File info */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'var(--bg-secondary)',
        borderRadius: 'var(--r-md)', marginBottom: 20,
      }}>
        <FileText size={16} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file?.name}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {formatSize(file?.size || 0)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label" htmlFor="upload-title">Book title</label>
          <input
            id="upload-title"
            className="input"
            placeholder="Enter title"
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="upload-author">Author <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></label>
          <input
            id="upload-author"
            className="input"
            placeholder="Author name"
            value={author}
            onChange={(e) => onChangeAuthor(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }}>
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!title.trim()}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          <Upload size={13} />
          Upload
        </button>
      </div>
    </div>
  </div>
);

export default LibraryPage;
