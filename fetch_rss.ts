/**
 * Build-time RSS pre-fetch script.
 * Runs during `vercel build` to populate cached_posts.json so that
 * the serverless function has articles ready on cold start.
 *
 * Usage: tsx fetch_rss.ts
 */
import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type CachedPost = {
  id: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  excerpt: string;
  content: string;
  rawHtml: string;
  publishedAt: string;
  fetchedAt: string;
  acks: number;
  ackedBy: string[];
  comments: unknown[];
  tags: string[];
};

const parser = new Parser({
  timeout: 8000,
  headers: { "User-Agent": "Agentium-RSS-Build/1.0" },
  customFields: { item: [["content:encoded", "contentEncoded"]] },
});

function loadSources() {
  const raw = fs.readFileSync(path.join(__dirname, "rss_sources.json"), "utf-8");
  return JSON.parse(raw) as Array<{ name: string; url: string; htmlUrl: string }>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function guessTags(title: string, content: string): string[] {
  const text = (title + " " + content).toLowerCase();
  const tagMap: Record<string, string[]> = {
    ai: ["artificial intelligence", "machine learning", "llm", "gpt", "claude", "gemini", "openai", "neural", "deep learning"],
    security: ["security", "vulnerability", "exploit", "hack", "breach", "malware", "ransomware", "cve"],
    web: ["javascript", "typescript", "react", "nextjs", "css", "html", "frontend", "browser"],
    systems: ["linux", "kernel", "rust", "c++", "assembly", "memory", "performance", "operating system"],
    cloud: ["aws", "kubernetes", "docker", "devops", "infrastructure", "cloud", "terraform"],
    apple: ["apple", "ios", "macos", "iphone", "ipad", "swift", "xcode"],
    "open-source": ["open source", "github", "git", "open-source", "foss"],
    design: ["design", "ux", "ui", "figma", "typography", "accessibility"],
    database: ["database", "sql", "postgres", "redis", "mongodb", "sqlite"],
    networking: ["tcp", "http", "dns", "protocol", "network", "api"],
  };
  return Object.entries(tagMap)
    .filter(([, kws]) => kws.some((kw) => text.includes(kw)))
    .map(([tag]) => tag)
    .slice(0, 4);
}

async function fetchOne(source: { name: string; url: string; htmlUrl?: string }) {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.map((item) => {
      const rawHtml = (item as any).contentEncoded || item.content || item.summary || "";
      const plainText = item.contentSnippet || stripHtml(rawHtml);
      return {
        sourceUrl: item.link || source.htmlUrl || source.url,
        sourceName: feed.title || source.name,
        title: item.title || "Untitled",
        rawHtml,
        rawContent: plainText,
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

async function main() {
  console.log("[fetch_rss] Starting build-time RSS prefetch…");
  const sources = loadSources();
  console.log(`[fetch_rss] ${sources.length} sources to fetch`);

  const allItems: Array<{ sourceUrl: string; sourceName: string; title: string; rawHtml: string; rawContent: string; publishedAt: string }> = [];

  for (let i = 0; i < sources.length; i += 8) {
    const batch = sources.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(fetchOne));
    for (const r of results) {
      if (r.status === "fulfilled") allItems.push(...r.value);
    }
    process.stdout.write(`\r[fetch_rss] ${Math.min(i + 8, sources.length)}/${sources.length} sources done`);
  }
  console.log();

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const MIN_CONTENT_LENGTH = 300;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const now = new Date().toISOString();

  const filtered = allItems.filter((item) => {
    if (!item.title || item.title === "Untitled") return false;
    if (stripHtml(item.rawContent).length < MIN_CONTENT_LENGTH) return false;
    const pub = new Date(item.publishedAt).getTime();
    return !isNaN(pub) && pub >= cutoff;
  });

  const seen = new Set<string>();
  const deduped = filtered
    .filter((item) => { if (seen.has(item.sourceUrl)) return false; seen.add(item.sourceUrl); return true; })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const posts: CachedPost[] = deduped.map((item, idx) => {
    const cleanContent = item.rawContent || stripHtml(item.rawHtml);
    const excerpt = cleanContent.length > 400 ? cleanContent.slice(0, 397) + "..." : cleanContent;
    return {
      id: `p-${Date.now()}-${idx}`,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      title: item.title,
      excerpt,
      content: cleanContent,
      rawHtml: item.rawHtml,
      publishedAt: item.publishedAt,
      fetchedAt: now,
      acks: 0,
      ackedBy: [],
      comments: [],
      tags: guessTags(item.title, cleanContent),
    };
  });

  const outPath = path.join(__dirname, "cached_posts.json");
  fs.writeFileSync(outPath, JSON.stringify({ fetchedAt: now, posts }, null, 2));
  console.log(`[fetch_rss] Done — ${posts.length} articles saved to cached_posts.json`);
}

main().catch((e) => {
  console.error("[fetch_rss] Failed:", e);
  process.exit(1);
});
