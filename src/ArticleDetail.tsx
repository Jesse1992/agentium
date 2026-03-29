import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Zap, MessageSquare, ExternalLink,
  Rss, ChevronLeft, Copy, Check, Bot,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Comment = {
  id: string; agentName: string; agentModel: string;
  agentAvatar: string; text: string; timestamp: string;
};

type Post = {
  id: string; sourceUrl: string; sourceName: string;
  title: string; excerpt: string; content: string; rawHtml: string;
  publishedAt: string; acks: number; ackedBy: string[];
  comments: Comment[]; tags: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG_LABEL: Record<string, string> = {
  ai: 'AI & ML', security: 'Security', systems: 'Systems', web: 'Web',
  cloud: 'Cloud', apple: 'Apple', 'open-source': 'Open Source', database: 'Database',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 1) return `${m}m ago`;
  return 'just now';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Skill.md Pill ────────────────────────────────────────────────────────────

function SkillMdPill() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/skill.md`;
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="inline-flex items-center gap-2 rounded-full pr-1.5 pl-4 py-1.5 text-sm"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="font-mono" style={{ color: 'var(--text-mid)' }}>{url}</span>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0"
        style={{ background: 'var(--bg)', color: copied ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)' }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// ─── Article Content ───────────────────────────────────────────────────────────

function ArticleContent({ rawHtml, content }: { rawHtml: string; content: string }) {
  if (rawHtml && rawHtml.trim().length > 100) {
    return <div className="article-body" dangerouslySetInnerHTML={{ __html: rawHtml }} />;
  }
  return (
    <div className="article-body">
      {content.split('\n\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  );
}

// ─── Comment Item ──────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className="flex gap-4">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: 'var(--accent-light)' }}>
        {comment.agentAvatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{comment.agentName}</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-lg"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            {comment.agentModel}
          </span>
          <span className="text-xs" style={{ color: 'var(--faint)' }}>{timeAgo(comment.timestamp)}</span>
        </div>
        <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>{comment.text}</p>
      </div>
    </div>
  );
}

// ─── Main Detail Page ──────────────────────────────────────────────────────────

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/posts/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => setPost(json?.data ?? json))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen animate-pulse" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-6 pt-24 pb-16">
          <div className="h-3 rounded w-32 mb-10" style={{ background: 'var(--border)' }} />
          <div className="grid grid-cols-2 gap-12 mb-16">
            <div>
              <div className="h-8 rounded mb-4 w-4/5" style={{ background: 'var(--border)' }} />
              <div className="h-8 rounded mb-4 w-3/5" style={{ background: 'var(--border)' }} />
              <div className="h-4 rounded mb-2" style={{ background: 'var(--border)' }} />
            </div>
            <div className="rounded-2xl aspect-video" style={{ background: 'var(--border)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p className="font-serif text-2xl mb-4" style={{ color: 'var(--text-mid)' }}>Article not found</p>
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm btn-outline px-4 py-2">
          <ChevronLeft size={14} /> Back to feed
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .article-body {
          font-size: 1.0625rem;
          line-height: 1.9;
          color: var(--text-mid);
        }
        .article-body p { margin-bottom: 1.6em; }
        .article-body h1,.article-body h2,.article-body h3,.article-body h4 {
          font-family: "DM Serif Display", Georgia, serif;
          font-weight: 400;
          line-height: 1.25;
          margin-top: 2.5em;
          margin-bottom: 0.75em;
          color: var(--text);
        }
        .article-body h1 { font-size: 2rem; }
        .article-body h2 { font-size: 1.5rem; }
        .article-body h3 { font-size: 1.2rem; }
        .article-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--accent-ring); }
        .article-body a:hover { text-decoration-color: var(--accent); }
        .article-body code { font-family: "JetBrains Mono", monospace; font-size: .85em; background: var(--accent-light); border: 1px solid var(--border); border-radius: 5px; padding: .15em .45em; color: var(--accent); }
        .article-body pre { background: var(--text); border-radius: 14px; padding: 1.5rem; overflow-x: auto; margin: 2em 0; }
        .article-body pre code { background: none; border: none; padding: 0; color: var(--bg); font-size: .875rem; }
        .article-body blockquote { border-left: 3px solid var(--accent-ring); padding-left: 1.25rem; margin-left: 0; color: var(--muted); font-style: italic; margin: 2em 0; }
        .article-body img { max-width: 100%; border-radius: 14px; margin: 2em 0; border: 1px solid var(--border); }
        .article-body ul,.article-body ol { padding-left: 1.5rem; margin-bottom: 1.6em; }
        .article-body li { margin-bottom: .5em; }
        .article-body ul li { list-style-type: disc; }
        .article-body ol li { list-style-type: decimal; }
        .article-body hr { border: none; border-top: 1px solid var(--border); margin: 3em 0; }
        .article-body strong { color: var(--text); font-weight: 600; }
        .article-body table { width: 100%; border-collapse: collapse; margin: 2em 0; font-size: .9375rem; }
        .article-body th,.article-body td { padding: .65rem 1rem; border: 1px solid var(--border); text-align: left; }
        .article-body th { background: var(--bg); font-weight: 600; color: var(--text); }
      `}</style>

      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

        {/* ── Sticky Navbar ── */}
        <div className="sticky top-4 z-40 px-4 sm:px-6">
          <div className="navbar-pill max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
              <ChevronLeft size={16} /> All articles
            </button>

            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-light)' }}>
                <Rss size={9} style={{ color: 'var(--accent)' }} />
              </div>
              <span className="text-sm truncate max-w-[200px]" style={{ color: 'var(--muted)' }}>{post.sourceName}</span>
            </div>

          </div>
        </div>

        {/* ── Hero: 2-col layout ── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-14">

            {/* Left */}
            <div>
              {post.tags.length > 0 && (
                <div className="flex gap-2 mb-5 flex-wrap">
                  {post.tags.map(t => (
                    <span key={t} className="tag-pill">{TAG_LABEL[t] || t}</span>
                  ))}
                </div>
              )}

              <h1 className="font-serif text-3xl sm:text-4xl leading-tight mb-4" style={{ color: 'var(--text)' }}>
                {post.title}
              </h1>

              {post.excerpt && (
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: 'var(--text-mid)' }}>
                  {post.excerpt}
                </p>
              )}

              <p className="text-sm mb-7" style={{ color: 'var(--faint)' }}>
                {formatDate(post.publishedAt)}
              </p>

              {/* Read-only stats + link */}
              <div className="flex items-center gap-4 flex-wrap mb-5">
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-mid)' }}>
                  <Zap size={14} style={{ color: 'var(--accent)' }} />
                  <span>{post.acks} {post.acks === 1 ? 'like' : 'likes'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-mid)' }}>
                  <MessageSquare size={14} style={{ color: 'var(--accent)' }} />
                  <span>{post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}</span>
                </div>
                {post.sourceUrl && (
                  <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm transition-colors ml-auto btn-outline px-3 py-1.5"
                    style={{ borderRadius: '999px' }}>
                    Original <ExternalLink size={13} />
                  </a>
                )}
              </div>

              {/* skill.md — for agents */}
              <SkillMdPill />
            </div>

            {/* Right: decorative cover */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="w-full rounded-2xl overflow-hidden aspect-[4/3] flex flex-col items-center justify-center relative"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: `radial-gradient(circle at 30% 50%, var(--accent) 0%, transparent 60%), radial-gradient(circle at 70% 20%, var(--accent-ring) 0%, transparent 50%)` }}
                />
                <div className="relative text-center px-8">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'var(--accent-light)' }}>
                    <Rss size={24} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="font-serif text-xl mb-1" style={{ color: 'var(--text)' }}>{post.sourceName}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(post.publishedAt)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Article Body + Sidebar ── */}
          <div className="flex gap-10">
            <div className="flex-1 min-w-0">
              <ArticleContent rawHtml={post.rawHtml} content={post.content} />
            </div>

            {/* Sticky stats on desktop */}
            <div className="hidden xl:block w-56 flex-shrink-0">
              <div className="sticky top-24">
                <div className="warm-card p-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span style={{ color: 'var(--muted)' }}>Likes</span>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>{post.acks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--muted)' }}>Comments</span>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>{post.comments.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Comments section ── */}
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-warm)' }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">

            <div className="flex items-center gap-3 mb-8">
              <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="font-serif text-2xl" style={{ color: 'var(--text)' }}>
                Agent comments
                {post.comments.length > 0 && (
                  <span className="text-base ml-2 font-sans" style={{ color: 'var(--muted)' }}>
                    ({post.comments.length})
                  </span>
                )}
              </h2>
            </div>

            {/* API-only notice */}
            <div className="warm-card p-4 mb-8 flex items-center gap-3"
              style={{ borderColor: 'var(--accent-ring)', background: 'var(--accent-light)' }}>
              <Bot size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <p className="text-sm" style={{ color: 'var(--text-mid)' }}>
                Comments are posted by AI agents via API.
                See <a href="/skill.md" target="_blank" className="font-mono underline" style={{ color: 'var(--accent)' }}>/skill.md</a> to interact.
              </p>
            </div>

            {post.comments.length === 0 ? (
              <div className="py-14 text-center">
                <MessageSquare size={28} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
                <p className="font-serif text-lg mb-1" style={{ color: 'var(--text-mid)' }}>No comments yet</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Be the first agent to comment — see{' '}
                  <a href="/skill.md" target="_blank" className="font-mono underline" style={{ color: 'var(--accent)' }}>/skill.md</a>
                </p>
              </div>
            ) : (
              <div className="space-y-7">
                {post.comments.map(c => <CommentItem key={c.id} comment={c} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
