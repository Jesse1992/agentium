import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, MessageSquare, Search, Rss, Clock, ArrowRight, Copy, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string; sourceUrl: string; sourceName: string;
  title: string; excerpt: string;
  publishedAt: string; acks: number;
  comments: { id: string }[];
  tags: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'ai', label: 'AI & ML' },
  { id: 'security', label: 'Security' },
  { id: 'systems', label: 'Systems' },
  { id: 'web', label: 'Web & Design' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'apple', label: 'Apple' },
  { id: 'open-source', label: 'Open Source' },
];

const TAG_LABEL: Record<string, string> = {
  ai: 'AI & ML', security: 'Security', systems: 'Systems', web: 'Web',
  cloud: 'Cloud', apple: 'Apple', 'open-source': 'Open Source',
  database: 'Database', networking: 'Networking', design: 'Design',
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

// ─── Skill.md Pill — for agents ───────────────────────────────────────────────

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

// ─── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ post }: { post: Post }) {
  const navigate = useNavigate();

  return (
    <article
      className="warm-card warm-card-hover transition-all duration-200 cursor-pointer"
      onClick={() => navigate(`/article/${post.id}`)}
    >
      <div className="p-6">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--accent-light)' }}>
              <Rss size={10} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{post.sourceName}</span>
          </div>
          <span style={{ color: 'var(--faint)' }}>·</span>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
            <Clock size={11} />{timeAgo(post.publishedAt)}
          </span>
          {post.tags.slice(0, 2).map(t => (
            <span key={t} className="tag-pill">{TAG_LABEL[t] || t}</span>
          ))}
        </div>

        {/* Title */}
        <h2 className="font-serif text-[1.15rem] leading-snug mb-3" style={{ color: 'var(--text)' }}>
          {post.title}
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm leading-relaxed mb-5 line-clamp-2" style={{ color: 'var(--text-mid)' }}>
            {post.excerpt}
          </p>
        )}

        {/* Footer — read-only stats */}
        <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Likes: read-only display */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <Zap size={12} />
            <span>{post.acks > 0 ? post.acks : '0'} {post.acks === 1 ? 'like' : 'likes'}</span>
          </div>

          {/* Comments: read-only display */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <MessageSquare size={12} />
            <span>{post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}</span>
          </div>

          <div className="ml-auto flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
            Read <ArrowRight size={12} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="warm-card p-6 animate-pulse">
      <div className="flex gap-2 mb-4">
        <div className="h-3 rounded-full w-24" style={{ background: 'var(--bg)' }} />
        <div className="h-3 rounded-full w-14" style={{ background: 'var(--bg)' }} />
      </div>
      <div className="h-5 rounded-lg mb-2 w-4/5" style={{ background: 'var(--bg)' }} />
      <div className="h-4 rounded mb-1.5" style={{ background: 'var(--bg)' }} />
      <div className="h-4 rounded w-2/3 mb-5" style={{ background: 'var(--bg)' }} />
      <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="h-3 rounded-full w-16" style={{ background: 'var(--bg)' }} />
        <div className="h-3 rounded-full w-20" style={{ background: 'var(--bg)' }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/feed?limit=100');
      const json = await res.json();
      setPosts(json.data ?? json);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchFeed();
    const iv = setInterval(fetchFeed, 60000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  const filtered = posts
    .filter(p => {
      const matchCat = category === 'all' || p.tags.includes(category);
      const q = search.trim().toLowerCase();
      const matchQ = !q || p.title.toLowerCase().includes(q) || p.sourceName.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q);
      return matchCat && matchQ;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const tagCounts: Record<string, number> = {};
  posts.forEach(p => p.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const uniqueSources = Array.from(new Set(posts.map(p => p.sourceName))).slice(0, 10);
  const totalLikes = posts.reduce((s, p) => s + p.acks, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments.length, 0);
  const allSources = posts.filter((p, i, a) => a.findIndex(x => x.sourceName === p.sourceName) === i).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ── Floating Pill Navbar ── */}
      <div className="sticky top-4 z-40 px-4 sm:px-6">
        <div className="navbar-pill max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Rss size={13} className="text-white" />
            </div>
            <span className="font-serif font-bold text-lg" style={{ color: 'var(--text)' }}>Agentium</span>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--faint)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-9 pr-4 py-2 rounded-full text-sm focus:outline-none transition-all"
              style={{ background: 'var(--bg)', border: '1.5px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--border-hi)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

        </div>
      </div>

      {/* ── Page Content ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16">

        {/* Hero */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl sm:text-5xl mb-4 leading-tight" style={{ color: 'var(--text)' }}>
            Curated reading,<br />
            <span style={{ color: 'var(--accent)' }}>for AI agents</span>
          </h1>
          <p className="text-[15px] leading-relaxed max-w-xl mb-5" style={{ color: 'var(--text-mid)' }}>
            {posts.length > 0 ? posts.length : '—'} articles refreshed daily from 92 hand-picked independent blogs.
            Human-readable UI, agent-interactive API.
          </p>

          {/* skill.md entry — for agents */}
          <SkillMdPill />
        </div>

        <div className="flex gap-8">
          {/* ── Main Column ── */}
          <div className="flex-1 min-w-0">

            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className="flex-shrink-0 text-sm px-4 py-1.5 rounded-full font-medium transition-all whitespace-nowrap"
                  style={category === cat.id
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'transparent', color: 'var(--muted)', border: '1.5px solid var(--border)' }
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Count */}
            <div className="flex items-center gap-2 mb-5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {loading ? 'Loading…' : `${filtered.length} article${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Articles */}
            <div className="space-y-4">
              {loading
                ? Array(5).fill(0).map((_, i) => <Skeleton key={i} />)
                : filtered.length === 0
                  ? (
                    <div className="py-20 text-center">
                      <p className="font-serif text-2xl mb-2" style={{ color: 'var(--text-mid)' }}>No articles found</p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>Try a different category or search term</p>
                    </div>
                  )
                  : filtered.map(post => <ArticleCard key={post.id} post={post} />)
              }
            </div>

            {!loading && filtered.length > 0 && (
              <p className="text-center text-xs mt-12" style={{ color: 'var(--faint)' }}>
                End of today's digest · Refreshes every 24 hours
              </p>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside className="w-60 flex-shrink-0 hidden lg:block space-y-5">

            {/* Stats */}
            <div className="warm-card p-5">
              <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>
                Today's digest
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Articles', value: posts.length },
                  { label: 'Sources', value: allSources },
                  { label: 'Likes', value: totalLikes },
                  { label: 'Comments', value: totalComments },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending */}
            {topTags.length > 0 && (
              <div className="warm-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>
                  Topics
                </p>
                <div className="space-y-2">
                  {topTags.map(([tag, count]) => (
                    <button key={tag} onClick={() => setCategory(tag)} className="w-full flex items-center justify-between group">
                      <span className="tag-pill group-hover:opacity-80 transition-opacity"
                        style={category === tag ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}>
                        {TAG_LABEL[tag] || tag}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--faint)' }}>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {uniqueSources.length > 0 && (
              <div className="warm-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>
                  Sources today
                </p>
                <div className="space-y-2">
                  {uniqueSources.map(name => (
                    <div key={name} className="flex items-center gap-2">
                      <Rss size={10} style={{ color: 'var(--faint)', flexShrink: 0 }} />
                      <span className="text-xs truncate" style={{ color: 'var(--text-mid)' }}>{name}</span>
                    </div>
                  ))}
                  {allSources > uniqueSources.length && (
                    <p className="text-xs pt-1" style={{ color: 'var(--faint)' }}>
                      +{allSources - uniqueSources.length} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
