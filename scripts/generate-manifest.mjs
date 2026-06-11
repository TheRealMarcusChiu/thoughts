#!/usr/bin/env node
/**
 * Regenerates articles/manifest.js (the listing) plus a sibling index.js body
 * file next to each article, by scanning articles/ recursively. Each article
 * lives in a single date-named folder and is named index.md:
 * articles/<YYYY-MM-DD>/index.md
 *
 *   node scripts/generate-manifest.mjs
 *
 * For every articles/<YYYY-MM-DD>/index.md file it reads the
 * YAML-ish frontmatter (the block between the first pair of `---` lines):
 * YAML-ish frontmatter (the block between the first pair of `---` lines):
 *
 *   ---
 *   title: "Unworthy Love"
 *   date: 2026-02-03        # optional — see below
 *   tags: [Faith, Reflection]
 *   draft: false            # posts with draft: true are skipped
 *   ---
 *
 * Output is a JS file that assigns a lightweight array to window.ARTICLES (no
 * article bodies) so the site can load it via <script src> and filter/sort
 * without fetch() — works on any static host, including file://:
 *
 *   { "slug", "path", "title", "date", "tags", "img" }
 *
 * Each article's body (frontmatter stripped) is also written to a sibling
 * index.js — e.g. articles/2026-02-03/index.js — which registers itself onto
 * window.ARTICLE_CONTENT[path]. The article page loads just the one it needs
 * via <script src>, so bodies render from file:// too.
 *
 * Rules:
 *   - draft: true  -> the post is omitted from the manifest entirely.
 *   - slug         -> "<date>--<Title>" with spaces replaced by dashes, then
 *                     URL-escaped. e.g. title "Unworthy Love" in 2026-02-03 ->
 *                     "2026-02-03--Unworthy-Love". Used as ?slug= in URLs.
 *   - date missing -> derived from the folder name,
 *                     e.g. articles/2026-05-18/index.md => "2026-05-18".
 *   - tags missing -> [].
 *   - img          -> cover image, declared in the article's frontmatter via
 *                     an `img:` key. Given as a path relative to the article's
 *                     own folder (e.g. `cover.jpg` or `assets/1.png`) or an
 *                     absolute URL. Empty string when not set.
 *   - results are sorted newest-first by date.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ARTICLES_DIR = 'articles';
const MANIFEST = join(ARTICLES_DIR, 'manifest.js');

const stripFrontmatter = (t) => t.replace(/^\uFEFF?---\s*\n[\s\S]*?\n---\s*\n?/, '').replace(/^\n+/, '');

// Rewrite body-relative resource paths (images/links) so they resolve from the
// site root, since article bodies render on a page that lives at the root.
// e.g. inside articles/2025/01/06/foo.md, ![](assets/1.png) -> articles/2025/01/06/assets/1.png
const isAbsUrl = (u) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|data:|mailto:)/i.test(String(u).trim());
function rewriteRelativePaths(body, baseDir) {
  // Markdown image/link targets: ![alt](url) and [text](url)
  body = body.replace(/(!?\[[^\]]*\]\()([^)\s]+)/g, (m, pre, url) =>
    isAbsUrl(url) ? m : pre + baseDir + '/' + url.replace(/^\.\//, ''));
  // Raw HTML src="" / href="" attributes
  body = body.replace(/\b(src|href)\s*=\s*("|')([^"']+)\2/gi, (m, attr, q, url) =>
    isAbsUrl(url) ? m : attr + '=' + q + baseDir + '/' + url.replace(/^\.\//, '') + q);
  return body;
}

function parseFrontmatter(text) {
  const m = /^\uFEFF?---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    data[key] = val;
  }
  return data;
}

const isTrue = (v) => v === true || v === 'true' || v === 'yes';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (e.name === 'index.md') files.push(full);
  }
  return files;
}

const files = await walk(ARTICLES_DIR);

const posts = [];
let bodyCount = 0;

for (const file of files) {
  const raw = await readFile(file, 'utf8');
  const fm = parseFrontmatter(raw);
  if (isTrue(fm.draft)) continue;

  const rel = relative(ARTICLES_DIR, file).split(sep).join('/');
  const dirRel = rel.split('/').slice(0, -1).join('/');

  let date = fm.date || '';
  if (!date) {
    const m = /(\d{4})-(\d{2})-(\d{2})\//.exec(rel + '/');
    if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
  }

  const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];

  // Slug = "<date>--<Title>" with spaces turned to dashes, then URL-escaped.
  const title = fm.title || dirRel.split('/').pop();
  const slug = encodeURIComponent(date + '--' + title.replace(/ /g, '-'));

  // Cover image is declared in the article's frontmatter (`img:`), as a path
  // relative to the article's own folder (e.g. `cover.jpg` or `assets/1.png`),
  // or an absolute URL. Empty when not set. Stored relative to articles/.
  let img = '';
  if (fm.img) {
    const v = String(fm.img).trim();
    img = isAbsUrl(v) ? v : ((dirRel ? dirRel + '/' : '') + v.replace(/^\.\//, ''));
  }

  posts.push({ slug, path: rel, title: fm.title || slug, date, tags, img });

  // Bundle this article's body into a sibling .js next to the .md so the
  // article page can load just this one body via <script> (works on file://).
  // Relative resource paths are rewritten to resolve from the site root.
  const baseDir = ('articles/' + rel).split('/').slice(0, -1).join('/');
  const body = rewriteRelativePaths(stripFrontmatter(raw), baseDir);
  const bodyOut =
    '// Auto-generated by scripts/generate-manifest.mjs — do not edit by hand.\n' +
    '// Body for: ' + rel + '\n' +
    '(window.ARTICLE_CONTENT = window.ARTICLE_CONTENT || {})[' +
    JSON.stringify(rel) + '] = ' + JSON.stringify(body) + ';\n';
  await writeFile(join(ARTICLES_DIR, rel.replace(/\.md$/, '.js')), bodyOut);
  bodyCount++;
}

posts.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

// Emitted as a JS file (window.ARTICLES) so the site loads it with a <script>
// tag — no fetch() — which works on any static host, including file://.
const out =
  '// Auto-generated by scripts/generate-manifest.mjs — do not edit by hand.\n' +
  'window.ARTICLES = ' + JSON.stringify(posts, null, 2) + ';\n';
await writeFile(MANIFEST, out);
console.log(`Wrote ${posts.length} post(s) to ${MANIFEST}`);
console.log(`Wrote ${bodyCount} article body file(s) (sibling .js next to each .md)`);
