# admin.html Local CRUD Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single `admin.html` plus a zero-dependency local Node server that lets the author create, update, and delete articles (`articles/<date>/index.md`) with frontmatter editing, tag management, image/cover uploads, and a raw/rendered editor — while the public site stays 100% static.

**Architecture:** A small `127.0.0.1:8787` Node server (`scripts/admin-server.mjs`, built-in modules only) serves the project directory statically and exposes a JSON/upload API backed by `scripts/lib/article-store.mjs`. `scripts/generate-manifest.mjs` is refactored so its build logic lives in `scripts/lib/manifest.mjs` and is re-run after every mutation. `admin.html` reuses `support.js` (the dc-runtime) for pixel-identical styling and `marked@12` for the rendered preview. A one-shot `scripts/migrate-covers.mjs` moves existing root-level covers into `assets/`.

**Tech Stack:** Node 24 (built-in `http`, `fs/promises`, `path`, `node:test`), the homegrown `dc-runtime` (React under the hood) in `support.js`, `marked@12` via CDN. No new npm dependencies.

---

## File Structure

- **Create** `scripts/lib/manifest.mjs` — build logic extracted from `generate-manifest.mjs`: exports `parseFrontmatter`, `stripFrontmatter`, `rewriteRelativePaths`, `isAbsUrl`, `isTrue`, `walk`, and `regenerate({ articlesDir, publicPrefix })`. One responsibility: turn `articles/` on disk into `manifest.js` + sibling `index.js` bundles.
- **Modify** `scripts/generate-manifest.mjs` — becomes a thin CLI wrapper over `regenerate()`. Same output, same command.
- **Create** `scripts/lib/article-store.mjs` — all article filesystem operations (list/read/save/delete/upload/tags + frontmatter serialization + folder placement). Pure-ish, takes `articlesDir` as an argument so it is testable against a temp dir.
- **Create** `scripts/admin-server.mjs` — thin HTTP layer: static file serving + `/api/*` routes delegating to `article-store`, calling `regenerate()` after mutations. Exports `createAdminServer(root)`; listens only when run directly.
- **Create** `scripts/migrate-covers.mjs` — one-shot, idempotent cover migration.
- **Create** `admin.html` — the UI (one `DCLogic` component, list ⇄ editor views).
- **Create** `scripts/lib/article-store.test.mjs` — `node:test` unit tests for the store.
- **Create** `scripts/lib/admin-server.test.mjs` — `node:test` integration tests for the API.
- **Modify** `README.md` — document the admin tool.

---

## Task 1: Refactor the manifest build into a reusable library (no behavior change)

**Files:**
- Create: `scripts/lib/manifest.mjs`
- Modify: `scripts/generate-manifest.mjs`

- [ ] **Step 1: Establish a clean generated baseline**

Run the existing generator and commit any drift so later diff-checks are meaningful.

Run: `node scripts/generate-manifest.mjs && git add -A articles && git commit -m "chore: regenerate manifest baseline" --allow-empty`
Expected: prints `Wrote N post(s)…` and `Wrote N article body file(s)…`; commit succeeds (possibly empty).

- [ ] **Step 2: Create `scripts/lib/manifest.mjs`**

Copy the existing logic verbatim, parameterized by `articlesDir` (filesystem path) and `publicPrefix` (the URL prefix, always `'articles'`). Defaults reproduce the current behavior exactly.

```javascript
// scripts/lib/manifest.mjs
// Build logic for the static blog: scans an articles directory and writes
// manifest.js (the listing) + a sibling index.js body bundle per article.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const stripFrontmatter = (t) =>
  t.replace(/^\uFEFF?---\s*\n[\s\S]*?\n---\s*\n?/, '').replace(/^\n+/, '');

export const isAbsUrl = (u) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|data:|mailto:)/i.test(String(u).trim());

// Rewrite body-relative resource paths so they resolve from the site root.
export function rewriteRelativePaths(body, baseDir) {
  body = body.replace(/(!?\[[^\]]*\]\()([^)\s]+)/g, (m, pre, url) =>
    isAbsUrl(url) ? m : pre + baseDir + '/' + url.replace(/^\.\//, ''));
  body = body.replace(/\b(src|href)\s*=\s*("|')([^"']+)\2/gi, (m, attr, q, url) =>
    isAbsUrl(url) ? m : attr + '=' + q + baseDir + '/' + url.replace(/^\.\//, '') + q);
  return body;
}

export function parseFrontmatter(text) {
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

export const isTrue = (v) => v === true || v === 'true' || v === 'yes';

export async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (e.name === 'index.md') files.push(full);
  }
  return files;
}

// Regenerate manifest.js + each sibling index.js. Returns counts.
export async function regenerate({ articlesDir = 'articles', publicPrefix = 'articles' } = {}) {
  const files = await walk(articlesDir);
  const posts = [];
  let bodyCount = 0;

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const fm = parseFrontmatter(raw);
    if (isTrue(fm.draft)) continue;

    const rel = relative(articlesDir, file).split(sep).join('/');
    const dirRel = rel.split('/').slice(0, -1).join('/');

    let date = fm.date || '';
    if (!date) {
      const m = /(\d{4})-(\d{2})-(\d{2})\//.exec(rel + '/');
      if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
    }

    const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
    const title = fm.title || dirRel.split('/').pop();
    const slug = encodeURIComponent(date + '--' + title.replace(/ /g, '-'));

    let img = '';
    if (fm.img) {
      const v = String(fm.img).trim();
      img = isAbsUrl(v) ? v : ((dirRel ? dirRel + '/' : '') + v.replace(/^\.\//, ''));
    }

    posts.push({ slug, path: rel, title: fm.title || slug, date, tags, img });

    const baseDir = (publicPrefix + '/' + rel).split('/').slice(0, -1).join('/');
    const body = rewriteRelativePaths(stripFrontmatter(raw), baseDir);
    const bodyOut =
      '// Auto-generated by scripts/generate-manifest.mjs — do not edit by hand.\n' +
      '// Body for: ' + rel + '\n' +
      '(window.ARTICLE_CONTENT = window.ARTICLE_CONTENT || {})[' +
      JSON.stringify(rel) + '] = ' + JSON.stringify(body) + ';\n';
    await writeFile(join(articlesDir, rel.replace(/\.md$/, '.js')), bodyOut);
    bodyCount++;
  }

  posts.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  const out =
    '// Auto-generated by scripts/generate-manifest.mjs — do not edit by hand.\n' +
    'window.ARTICLES = ' + JSON.stringify(posts, null, 2) + ';\n';
  await writeFile(join(articlesDir, 'manifest.js'), out);
  return { posts: posts.length, bodies: bodyCount };
}
```

- [ ] **Step 3: Replace `scripts/generate-manifest.mjs` with a thin CLI wrapper**

Keep the top doc comment if desired; the executable body becomes:

```javascript
#!/usr/bin/env node
// Regenerates articles/manifest.js + each sibling index.js by scanning articles/.
//   node scripts/generate-manifest.mjs
import { regenerate } from './lib/manifest.mjs';

const { posts, bodies } = await regenerate();
console.log(`Wrote ${posts} post(s) to articles/manifest.js`);
console.log(`Wrote ${bodies} article body file(s) (sibling .js next to each .md)`);
```

- [ ] **Step 4: Verify output is byte-identical (the refactor changed nothing)**

Run: `node scripts/generate-manifest.mjs && git diff --quiet -- articles && echo IDENTICAL`
Expected: prints the two `Wrote …` lines, then `IDENTICAL` (empty diff for `articles/`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/manifest.mjs scripts/generate-manifest.mjs
git commit -m "$(printf 'refactor: extract manifest build into scripts/lib/manifest.mjs\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Article store — frontmatter serialization

**Files:**
- Create: `scripts/lib/article-store.mjs`
- Test: `scripts/lib/article-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/article-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFrontmatter, buildMarkdown } from './article-store.mjs';
import { parseFrontmatter, stripFrontmatter } from './manifest.mjs';

test('serializeFrontmatter emits parseable, ordered YAML-ish block', () => {
  const fm = { draft: true, title: 'Hello "World"', tags: ['a', 'b'], img: 'assets/cover.png', date: '2026-06-11' };
  const block = serializeFrontmatter(fm);
  assert.ok(block.startsWith('---\n'));
  assert.ok(block.endsWith('\n---'));
  const parsed = parseFrontmatter(block + '\n\nbody\n');
  assert.equal(parsed.draft, 'true');
  assert.equal(parsed.title, 'Hello "World"');
  assert.deepEqual(parsed.tags, ['a', 'b']);
  assert.equal(parsed.img, 'assets/cover.png');
  assert.equal(parsed.date, '2026-06-11');
});

test('serializeFrontmatter omits img when empty', () => {
  const block = serializeFrontmatter({ draft: false, title: 'T', tags: [], img: '', date: '2026-01-01' });
  assert.ok(!/img:/.test(block));
  assert.match(block, /tags: \[\]/);
});

test('buildMarkdown joins frontmatter and body with a blank line and trailing newline', () => {
  const md = buildMarkdown({ draft: true, title: 'T', tags: [], img: '', date: '2026-01-01' }, '  \n\nBody text\n\n');
  assert.match(md, /---\n\nBody text\n$/);
  assert.equal(stripFrontmatter(md), 'Body text\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: FAIL — cannot find module export `serializeFrontmatter` (module not created yet).

- [ ] **Step 3: Create `scripts/lib/article-store.mjs` with serialization**

```javascript
// scripts/lib/article-store.mjs
// Filesystem operations for articles, on top of scripts/lib/manifest.mjs.
import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, isTrue, isAbsUrl } from './manifest.mjs';

// Build the frontmatter block (no trailing newline). Key order matches the
// existing articles: draft, title, tags, img (optional), date.
export function serializeFrontmatter({ draft, title, tags, img, date }) {
  const t = Array.isArray(tags) ? tags : [];
  const lines = ['---'];
  lines.push('draft: ' + (isTrue(draft) ? 'true' : 'false'));
  lines.push('title: ' + JSON.stringify(String(title || '')));
  lines.push('tags: [' + t.map((x) => JSON.stringify(String(x))).join(', ') + ']');
  if (img) lines.push("img: '" + String(img) + "'");
  lines.push('date: ' + String(date || ''));
  lines.push('---');
  return lines.join('\n');
}

export function buildMarkdown(fm, body) {
  const clean = String(body || '').replace(/^\s*\n+/, '').replace(/\s+$/, '');
  return serializeFrontmatter(fm) + '\n\n' + clean + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/article-store.mjs scripts/lib/article-store.test.mjs
git commit -m "$(printf 'feat: article-store frontmatter serialization\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Article store — folder placement (`dirDate`, `nextFreeDir`)

**Files:**
- Modify: `scripts/lib/article-store.mjs`
- Test: `scripts/lib/article-store.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `scripts/lib/article-store.test.mjs`:

```javascript
import { dirDate, nextFreeDir } from './article-store.mjs';

test('dirDate extracts the YYYY-MM-DD prefix', () => {
  assert.equal(dirDate('2026-05-18'), '2026-05-18');
  assert.equal(dirDate('2026-05-18-2'), '2026-05-18');
  assert.equal(dirDate('nope'), '');
});

test('nextFreeDir returns the base date when free', () => {
  assert.equal(nextFreeDir('2026-05-18', new Set()), '2026-05-18');
});

test('nextFreeDir suffixes when the base (and suffixes) are taken', () => {
  assert.equal(nextFreeDir('2026-05-18', new Set(['2026-05-18'])), '2026-05-18-2');
  assert.equal(nextFreeDir('2026-05-18', new Set(['2026-05-18', '2026-05-18-2'])), '2026-05-18-3');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: FAIL — `dirDate`/`nextFreeDir` not exported.

- [ ] **Step 3: Implement**

Append to `scripts/lib/article-store.mjs`:

```javascript
export function dirDate(dir) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dir || ''));
  return m ? m[1] : '';
}

// Pick the first free folder name for a date: base, then base-2, base-3, …
export function nextFreeDir(date, takenSet) {
  if (!takenSet.has(date)) return date;
  let n = 2;
  while (takenSet.has(date + '-' + n)) n++;
  return date + '-' + n;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/article-store.mjs scripts/lib/article-store.test.mjs
git commit -m "$(printf 'feat: article-store folder placement helpers\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Article store — list, read, tags

**Files:**
- Modify: `scripts/lib/article-store.mjs`
- Test: `scripts/lib/article-store.test.mjs`

- [ ] **Step 1: Add failing tests (fixtures in a temp dir)**

Append to `scripts/lib/article-store.test.mjs`:

```javascript
import { mkdtemp, mkdir as mkdirp, writeFile as wf } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as pj } from 'node:path';
import { listArticles, readArticle, allTags, listDirNames } from './article-store.mjs';

async function fixture() {
  const root = await mkdtemp(pj(tmpdir(), 'admin-store-'));
  const arts = pj(root, 'articles');
  await mkdirp(pj(arts, '2026-05-18'), { recursive: true });
  await wf(pj(arts, '2026-05-18', 'index.md'),
    '---\ndraft: false\ntitle: "Alpha"\ntags: ["x", "y"]\nimg: \'assets/cover.png\'\ndate: 2026-05-18\n---\n\nBody A\n');
  await mkdirp(pj(arts, '2026-05-18-2', 'assets'), { recursive: true });
  await wf(pj(arts, '2026-05-18-2', 'index.md'),
    '---\ndraft: true\ntitle: "Beta"\ntags: ["y", "z"]\ndate: 2026-05-18\n---\n\nBody B\n');
  await wf(pj(arts, '2026-05-18-2', 'assets', '1.png'), 'x');
  return arts;
}

test('listArticles returns all posts incl. drafts, newest first', async () => {
  const arts = await fixture();
  const list = await listArticles(arts);
  assert.equal(list.length, 2);
  const beta = list.find((a) => a.dir === '2026-05-18-2');
  assert.equal(beta.draft, true);
  assert.deepEqual(beta.tags, ['y', 'z']);
  const alpha = list.find((a) => a.dir === '2026-05-18');
  assert.equal(alpha.imgUrl, 'articles/2026-05-18/assets/cover.png');
});

test('readArticle returns raw text and asset filenames', async () => {
  const arts = await fixture();
  const a = await readArticle(arts, '2026-05-18-2');
  assert.match(a.raw, /title: "Beta"/);
  assert.deepEqual(a.assets, ['1.png']);
});

test('allTags returns the sorted union across drafts and non-drafts', async () => {
  const arts = await fixture();
  assert.deepEqual(await allTags(arts), ['x', 'y', 'z']);
});

test('listDirNames returns folder names containing index.md', async () => {
  const arts = await fixture();
  assert.deepEqual((await listDirNames(arts)).sort(), ['2026-05-18', '2026-05-18-2']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: FAIL — `listArticles`/`readArticle`/`allTags`/`listDirNames` not exported.

- [ ] **Step 3: Implement**

Append to `scripts/lib/article-store.mjs`:

```javascript
// Folder names directly under articlesDir that contain an index.md.
export async function listDirNames(articlesDir) {
  let entries;
  try { entries = await readdir(articlesDir, { withFileTypes: true }); }
  catch { return []; }
  const names = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try { await stat(join(articlesDir, e.name, 'index.md')); names.push(e.name); }
    catch { /* no index.md — skip */ }
  }
  return names;
}

function imgUrlFor(dir, img) {
  if (!img) return '';
  return isAbsUrl(img) ? img : 'articles/' + dir + '/' + String(img).replace(/^\.\//, '');
}

export async function listArticles(articlesDir) {
  const dirs = await listDirNames(articlesDir);
  const out = [];
  for (const dir of dirs) {
    const raw = await readFile(join(articlesDir, dir, 'index.md'), 'utf8');
    const fm = parseFrontmatter(raw);
    const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
    out.push({
      dir,
      title: fm.title || dir,
      date: fm.date || dirDate(dir),
      tags,
      draft: isTrue(fm.draft),
      img: fm.img || '',
      imgUrl: imgUrlFor(dir, fm.img || ''),
    });
  }
  out.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  return out;
}

export async function readArticle(articlesDir, dir) {
  const raw = await readFile(join(articlesDir, dir, 'index.md'), 'utf8');
  let assets = [];
  try {
    assets = (await readdir(join(articlesDir, dir, 'assets'), { withFileTypes: true }))
      .filter((e) => e.isFile()).map((e) => e.name);
  } catch { /* no assets dir */ }
  return { dir, raw, assets };
}

export async function allTags(articlesDir) {
  const set = new Set();
  for (const a of await listArticles(articlesDir)) a.tags.forEach((t) => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/article-store.mjs scripts/lib/article-store.test.mjs
git commit -m "$(printf 'feat: article-store list/read/tags\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Article store — save, delete, upload

**Files:**
- Modify: `scripts/lib/article-store.mjs`
- Test: `scripts/lib/article-store.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `scripts/lib/article-store.test.mjs`:

```javascript
import { saveArticle, deleteArticle, saveUpload } from './article-store.mjs';
import { readFile as rf, stat as st } from 'node:fs/promises';

test('saveArticle creates a new folder named by date', async () => {
  const arts = await fixture();
  const dir = await saveArticle(arts, { originalDir: null, date: '2026-07-01', title: 'New', draft: true, tags: ['k'], img: '', body: 'Hi' });
  assert.equal(dir, '2026-07-01');
  const raw = await rf(pj(arts, '2026-07-01', 'index.md'), 'utf8');
  assert.match(raw, /title: "New"/);
  assert.match(raw, /draft: true/);
});

test('saveArticle auto-suffixes when the date folder is taken', async () => {
  const arts = await fixture();
  const dir = await saveArticle(arts, { originalDir: null, date: '2026-05-18', title: 'Third', draft: true, tags: [], img: '', body: 'x' });
  assert.equal(dir, '2026-05-18-3'); // 2026-05-18 and -2 already exist
});

test('saveArticle with unchanged date writes in place', async () => {
  const arts = await fixture();
  const dir = await saveArticle(arts, { originalDir: '2026-05-18', date: '2026-05-18', title: 'Alpha edited', draft: false, tags: ['x'], img: 'assets/cover.png', body: 'B' });
  assert.equal(dir, '2026-05-18');
  const raw = await rf(pj(arts, '2026-05-18', 'index.md'), 'utf8');
  assert.match(raw, /Alpha edited/);
});

test('saveArticle renames the folder when the date changes', async () => {
  const arts = await fixture();
  const dir = await saveArticle(arts, { originalDir: '2026-05-18', date: '2026-09-09', title: 'Alpha', draft: false, tags: [], img: '', body: 'B' });
  assert.equal(dir, '2026-09-09');
  await assert.rejects(() => st(pj(arts, '2026-05-18'))); // old folder gone
  await st(pj(arts, '2026-09-09', 'index.md')); // new folder present
});

test('saveArticle date change onto a taken date auto-suffixes, never overwrites', async () => {
  const arts = await fixture();
  // move the draft (-2) onto 2026-05-18 which is occupied by Alpha
  const dir = await saveArticle(arts, { originalDir: '2026-05-18-2', date: '2026-05-18', title: 'Beta', draft: true, tags: [], img: '', body: 'B' });
  assert.equal(dir, '2026-05-18-2'); // base taken by Alpha → keeps a free suffix
  await st(pj(arts, '2026-05-18', 'index.md')); // Alpha untouched
});

test('deleteArticle removes the whole folder', async () => {
  const arts = await fixture();
  await deleteArticle(arts, '2026-05-18-2');
  await assert.rejects(() => st(pj(arts, '2026-05-18-2')));
});

test('saveUpload writes into assets/ and returns a relative path, de-duping names', async () => {
  const arts = await fixture();
  const p1 = await saveUpload(arts, '2026-05-18', 'My Pic!.png', Buffer.from('a'));
  assert.equal(p1, 'assets/My_Pic_.png');
  const p2 = await saveUpload(arts, '2026-05-18', 'My Pic!.png', Buffer.from('b'));
  assert.equal(p2, 'assets/My_Pic_-2.png');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: FAIL — `saveArticle`/`deleteArticle`/`saveUpload` not exported.

- [ ] **Step 3: Implement**

Append to `scripts/lib/article-store.mjs`:

```javascript
// Create or update an article. Returns the final folder name.
export async function saveArticle(articlesDir, { originalDir, date, title, draft, tags, img, body }) {
  const md = buildMarkdown({ draft, title, tags, img, date }, body);
  const taken = new Set(await listDirNames(articlesDir));

  let targetDir;
  if (!originalDir) {
    targetDir = nextFreeDir(date, taken);
  } else if (dirDate(originalDir) === date) {
    targetDir = originalDir; // date unchanged → write in place
  } else {
    taken.delete(originalDir);
    targetDir = nextFreeDir(date, taken);
  }

  if (originalDir && targetDir !== originalDir) {
    await rename(join(articlesDir, originalDir), join(articlesDir, targetDir));
  }
  await mkdir(join(articlesDir, targetDir), { recursive: true });
  await writeFile(join(articlesDir, targetDir, 'index.md'), md, 'utf8');
  return targetDir;
}

export async function deleteArticle(articlesDir, dir) {
  await rm(join(articlesDir, dir), { recursive: true, force: true });
}

// Save an uploaded image into <dir>/assets/, returning its path relative to the
// article folder (e.g. "assets/diagram.png"). Names are sanitized and de-duped.
export async function saveUpload(articlesDir, dir, filename, buffer) {
  const assetsDir = join(articlesDir, dir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const safe = String(filename || 'image').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '') || 'image';
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';

  let name = base + ext;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await stat(join(assetsDir, name)); name = base + '-' + n++ + ext; }
    catch { break; }
  }
  await writeFile(join(assetsDir, name), buffer);
  return 'assets/' + name;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/lib/article-store.test.mjs`
Expected: PASS (17 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/article-store.mjs scripts/lib/article-store.test.mjs
git commit -m "$(printf 'feat: article-store save/delete/upload\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Admin server — HTTP layer + API

**Files:**
- Create: `scripts/admin-server.mjs`
- Test: `scripts/lib/admin-server.test.mjs`

- [ ] **Step 1: Write the failing integration test**

```javascript
// scripts/lib/admin-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminServer } from '../admin-server.mjs';

async function withServer(run) {
  const root = await mkdtemp(join(tmpdir(), 'admin-srv-'));
  await mkdir(join(root, 'articles', '2026-05-18'), { recursive: true });
  await writeFile(join(root, 'articles', '2026-05-18', 'index.md'),
    '---\ndraft: false\ntitle: "Alpha"\ntags: ["x"]\ndate: 2026-05-18\n---\n\nBody A\n');
  await writeFile(join(root, 'admin.html'), '<!doctype html><title>admin</title>');
  const server = createAdminServer(root);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await run(base, root); } finally { await new Promise((r) => server.close(r)); }
}

test('GET / serves admin.html', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /admin/);
  });
});

test('GET /api/articles lists posts including drafts', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/api/articles');
    const j = await r.json();
    assert.equal(j.articles.length, 1);
    assert.equal(j.articles[0].dir, '2026-05-18');
  });
});

test('POST /api/article creates a post and regenerates the manifest', async () => {
  await withServer(async (base, root) => {
    const r = await fetch(base + '/api/article', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalDir: null, date: '2026-08-01', title: 'Fresh', draft: false, tags: ['n'], img: '', body: 'Hello' }),
    });
    const j = await r.json();
    assert.equal(j.dir, '2026-08-01');
    await stat(join(root, 'articles', '2026-08-01', 'index.md'));
    const manifest = await readFile(join(root, 'articles', 'manifest.js'), 'utf8');
    assert.match(manifest, /Fresh/); // non-draft is in the manifest
  });
});

test('POST /api/upload stores an image and returns its path', async () => {
  await withServer(async (base, root) => {
    const r = await fetch(base + '/api/upload?dir=2026-05-18&name=pic.png', {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('imgdata'),
    });
    const j = await r.json();
    assert.equal(j.path, 'assets/pic.png');
    assert.equal(await readFile(join(root, 'articles', '2026-05-18', 'assets', 'pic.png'), 'utf8'), 'imgdata');
  });
});

test('DELETE /api/article removes the folder', async () => {
  await withServer(async (base, root) => {
    const r = await fetch(base + '/api/article?dir=2026-05-18', { method: 'DELETE' });
    assert.equal((await r.json()).ok, true);
    await assert.rejects(() => stat(join(root, 'articles', '2026-05-18')));
  });
});

test('GET /api/tags returns the tag union', async () => {
  await withServer(async (base) => {
    const j = await (await fetch(base + '/api/tags')).json();
    assert.deepEqual(j.tags, ['x']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/admin-server.test.mjs`
Expected: FAIL — cannot import `createAdminServer` (module not created).

- [ ] **Step 3: Implement `scripts/admin-server.mjs`**

```javascript
#!/usr/bin/env node
// Local-only admin server for the static blog. Serves the project directory and
// exposes a small CRUD/upload API for articles. Never deploy this.
//   node scripts/admin-server.mjs   →   http://127.0.0.1:8787/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regenerate } from './lib/manifest.mjs';
import {
  listArticles, readArticle, saveArticle, deleteArticle, saveUpload, allTags,
} from './lib/article-store.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createAdminServer(root) {
  const articlesDir = join(root, 'articles');

  async function handleApi(req, res, url) {
    const p = url.pathname;
    try {
      if (p === '/api/articles' && req.method === 'GET') {
        return sendJson(res, 200, { articles: await listArticles(articlesDir) });
      }
      if (p === '/api/tags' && req.method === 'GET') {
        return sendJson(res, 200, { tags: await allTags(articlesDir) });
      }
      if (p === '/api/article' && req.method === 'GET') {
        const dir = url.searchParams.get('dir');
        if (!dir) return sendJson(res, 400, { error: 'dir required' });
        return sendJson(res, 200, await readArticle(articlesDir, dir));
      }
      if (p === '/api/article' && req.method === 'POST') {
        const data = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const dir = await saveArticle(articlesDir, data);
        await regenerate({ articlesDir });
        return sendJson(res, 200, { dir });
      }
      if (p === '/api/article' && req.method === 'DELETE') {
        const dir = url.searchParams.get('dir');
        if (!dir) return sendJson(res, 400, { error: 'dir required' });
        await deleteArticle(articlesDir, dir);
        await regenerate({ articlesDir });
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/upload' && req.method === 'POST') {
        const dir = url.searchParams.get('dir');
        const name = url.searchParams.get('name') || 'image';
        if (!dir) return sendJson(res, 400, { error: 'dir required' });
        const path = await saveUpload(articlesDir, dir, name, await readBody(req));
        return sendJson(res, 200, { path });
      }
      return sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      return sendJson(res, 500, { error: String((e && e.message) || e) });
    }
  }

  async function handleStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/admin.html';
    // Resolve safely within root; reject path traversal.
    const full = normalize(join(root, rel));
    if (full !== root && !full.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
      res.writeHead(403); return res.end('forbidden');
    }
    try {
      const info = await stat(full);
      if (info.isDirectory()) { res.writeHead(403); return res.end('forbidden'); }
      const buf = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  }

  return createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) handleApi(req, res, url);
    else handleStatic(req, res, url);
  });
}

// Run directly: start listening.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  const root = process.env.ADMIN_ROOT || process.cwd();
  createAdminServer(root).listen(port, '127.0.0.1', () => {
    console.log(`Admin server: http://127.0.0.1:${port}/  (serving ${root})`);
    console.log('Press Ctrl+C to stop. Do not deploy this server.');
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/lib/admin-server.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full test suite**

Run: `node --test scripts/lib/*.test.mjs`
Expected: PASS (23 tests total).

- [ ] **Step 6: Commit**

```bash
git add scripts/admin-server.mjs scripts/lib/admin-server.test.mjs
git commit -m "$(printf 'feat: local admin server with article CRUD + upload API\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: `admin.html` — full UI (list + editor)

**Files:**
- Create: `admin.html`

This is a single cohesive artifact built on the dc-runtime (same as `index.html`/`article.html`). Write the whole file, then verify manually in a browser. The dc-runtime maps `on*` attributes to React handlers and `value="{{ }}"` to controlled inputs; **use only `onClick`/`onChange`/`onInput`** (the lowercase→React fallback mangles names like `onKeyDown`). File `<input>`s are created programmatically to avoid binding quirks.

- [ ] **Step 1: Write `admin.html`**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500;1,6..72,600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="icon" type="image/x-icon" href="favicon.ico">
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #0f0c09; }
  ::selection { background: #d8a942; color: #0f0c09; }
  @keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes menuIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  input, textarea, select, button { font-family: 'JetBrains Mono', monospace; }
  .fld { width: 100%; background: #14110b; border: 1px solid #2a2218; border-radius: 6px; color: #ece1cf; font-size: 14px; padding: 11px 13px; outline: none; transition: border-color 0.2s ease; }
  .fld:focus { border-color: #d8a942; }
  .md-raw { width: 100%; min-height: 540px; background: #14110b; border: 1px solid #2a2218; border-radius: 6px; color: #cdc1ab; font-size: 14px; line-height: 1.7; padding: 18px; resize: vertical; outline: none; transition: border-color 0.2s ease; }
  .md-raw:focus { border-color: #d8a942; }
  .prose { font-family: 'Newsreader', Georgia, serif; font-size: 19px; line-height: 1.82; color: #cdc1ab; min-height: 540px; }
  .prose > *:first-child { margin-top: 0; }
  .prose p { margin: 0 0 1.4em; text-wrap: pretty; }
  .prose h1, .prose h2 { font-family: 'Newsreader', Georgia, serif; font-style: italic; font-weight: 500; color: #ece1cf; font-size: 31px; line-height: 1.18; letter-spacing: -0.01em; margin: 1.9em 0 0.55em; }
  .prose h3 { font-family: 'Newsreader', Georgia, serif; font-style: italic; font-weight: 500; color: #ece1cf; font-size: 23px; margin: 1.6em 0 0.5em; }
  .prose a { color: #d8a942; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(216,169,66,0.4); }
  .prose strong { color: #ece1cf; font-weight: 600; }
  .prose em { font-style: italic; }
  .prose blockquote { margin: 1.6em 0; padding: 0.1em 0 0.1em 1.4em; border-left: 2px solid #d8a942; color: #a99e88; font-style: italic; }
  .prose ul, .prose ol { margin: 0 0 1.4em; padding-left: 1.3em; }
  .prose li { margin: 0.4em 0; }
  .prose li::marker { color: #b78f3a; }
  .prose code { font-family: 'JetBrains Mono', monospace; font-size: 0.82em; background: #1c1710; border: 1px solid #2a2218; border-radius: 4px; padding: 2px 6px; color: #d8a942; }
  .prose pre { background: #14110b; border: 1px solid #2a2218; border-radius: 6px; padding: 18px; overflow-x: auto; margin: 0 0 1.4em; }
  .prose pre code { background: none; border: none; padding: 0; color: #cdc1ab; }
  .prose img { max-width: 100%; border-radius: 6px; }
  .prose table { border-collapse: collapse; margin: 0 0 1.4em; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .prose th, .prose td { border: 1px solid #2a2218; padding: 7px 12px; text-align: left; }
</style>
</helmet>

<div style="background: #0f0c09; min-height: 100vh; color: #ece1cf; font-family: 'JetBrains Mono', monospace; padding: 0 0 120px; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 1180px; margin: 0 auto; padding: 0 40px;">

    <!-- server-down banner -->
    <sc-if value="{{ serverDown }}" hint-placeholder-val="{{ false }}">
      <div style="margin-top: 28px; padding: 16px 18px; background: #2a1410; border: 1px solid #6b2c20; border-radius: 7px; color: #e7b0a4; font-size: 13px; line-height: 1.7;">
        Admin server not reachable. Start it with <span style="color: #f0c9bf;">node scripts/admin-server.mjs</span> then
        <button type="button" onClick="{{ reload }}" style="margin-left: 8px; background: #6b2c20; border: none; color: #ffe; border-radius: 5px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Retry</button>
      </div>
    </sc-if>

    <!-- HEADER -->
    <header style="padding: 72px 0 36px; border-bottom: 1px solid #221c14; display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
      <div>
        <a href="index.html" style="display: inline-block; font-size: 12px; letter-spacing: 0.34em; color: #d8a942; text-transform: uppercase; margin-bottom: 26px; text-decoration: none;" style-hover="color: #ece1cf;">← View site</a>
        <h1 style="font-family: 'Newsreader', Georgia, serif; font-style: italic; font-weight: 500; color: #ece1cf; font-size: clamp(40px, 7vw, 76px); line-height: 0.98; letter-spacing: -0.015em;">Admin</h1>
      </div>
      <sc-if value="{{ isList }}" hint-placeholder-val="{{ true }}">
        <button type="button" onClick="{{ openNew }}" style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; padding: 13px 18px; border-radius: 5px; cursor: pointer; background: #d8a942; border: 1px solid #d8a942; color: #0f0c09;" style-hover="background: #e6bb58;">+ New article</button>
      </sc-if>
    </header>

    <!-- ===================== LIST VIEW ===================== -->
    <sc-if value="{{ isList }}" hint-placeholder-val="{{ true }}">
      <div>
        <!-- controls -->
        <div style="position: relative; z-index: 50; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 34px 0 30px;">
          <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            <div style="position: relative;">
              <button type="button" onClick="{{ toggleSort }}" style="{{ sortBtnStyle }}" style-hover="{{ btnHover }}">
                <span style="color: #5f574a;">Sort</span><span style="color: #ece1cf;">{{ sortLabel }}</span><span style="color: #b78f3a; font-size: 9px;">{{ sortCaret }}</span>
              </button>
              <sc-if value="{{ sortOpen }}" hint-placeholder-val="{{ false }}">
                <div style="position: absolute; top: calc(100% + 8px); left: 0; min-width: 214px; background: #16120c; border: 1px solid #2a2218; border-radius: 7px; padding: 6px; box-shadow: 0 22px 46px -18px rgba(0,0,0,0.75); z-index: 60; display: flex; flex-direction: column; gap: 2px; animation: menuIn 0.16s ease both;">
                  <sc-for list="{{ sortOptions }}" as="o" hint-placeholder-count="4">
                    <button type="button" onClick="{{ o.onClick }}" style="{{ o.style }}" style-hover="{{ o.hoverStyle }}">{{ o.label }}</button>
                  </sc-for>
                </div>
              </sc-if>
            </div>
            <div style="position: relative;">
              <button type="button" onClick="{{ toggleTag }}" style="{{ tagBtnStyle }}" style-hover="{{ btnHover }}">
                <span style="color: #5f574a;">Filter</span><span style="color: #ece1cf;">{{ tagLabel }}</span><span style="color: #b78f3a; font-size: 9px;">{{ tagCaret }}</span>
              </button>
              <sc-if value="{{ tagOpen }}" hint-placeholder-val="{{ false }}">
                <div style="position: absolute; top: calc(100% + 8px); left: 0; min-width: 230px; max-height: 340px; overflow-y: auto; background: #16120c; border: 1px solid #2a2218; border-radius: 7px; padding: 6px; box-shadow: 0 22px 46px -18px rgba(0,0,0,0.75); z-index: 60; display: flex; flex-direction: column; gap: 2px; animation: menuIn 0.16s ease both;">
                  <sc-for list="{{ tagOptions }}" as="o" hint-placeholder-count="6">
                    <button type="button" onClick="{{ o.onClick }}" style="{{ o.style }}" style-hover="{{ o.hoverStyle }}"><span>{{ o.label }}</span><span style="{{ o.countStyle }}">{{ o.count }}</span></button>
                  </sc-for>
                </div>
              </sc-if>
            </div>
          </div>
          <div style="font-size: 12px; letter-spacing: 0.18em; color: #5f574a; text-transform: uppercase; white-space: nowrap;">{{ countLabel }}</div>
        </div>

        <sc-if value="{{ anyOpen }}" hint-placeholder-val="{{ false }}">
          <div onClick="{{ closeMenus }}" style="position: fixed; inset: 0; z-index: 40;"></div>
        </sc-if>

        <!-- grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 22px;">
          <sc-for list="{{ articles }}" as="a" hint-placeholder-count="12">
            <div style="display: flex; flex-direction: column; background: #14100b; border: 1px solid #29221a; border-radius: 6px; overflow: hidden; animation: riseIn 0.5s ease both;">
              <div style="position: relative; aspect-ratio: 16 / 10; background-color: #16120c; background-image: repeating-linear-gradient(135deg, #181309 0px, #181309 11px, #1d1710 11px, #1d1710 22px); border-bottom: 1px solid #29221a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                <sc-if value="{{ a.hasImg }}" hint-placeholder-val="{{ false }}">
                  <img src="{{ a.imgUrl }}" alt="{{ a.title }}" loading="lazy" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;">
                </sc-if>
                <sc-if value="{{ a.noImg }}" hint-placeholder-val="{{ true }}">
                  <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #6c6354; text-align: center; padding: 0 20px;">{{ a.title }}<br><span style="color: #4a4337;">no cover</span></div>
                </sc-if>
                <sc-if value="{{ a.draft }}" hint-placeholder-val="{{ false }}">
                  <span style="position: absolute; left: 12px; top: 12px; font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: #0f0c09; background: #d8a942; border-radius: 3px; padding: 4px 8px; z-index: 2;">Draft</span>
                </sc-if>
              </div>
              <div style="padding: 20px 20px 18px; display: flex; flex-direction: column; flex: 1;">
                <div style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #b78f3a;">{{ a.dateLabel }}</div>
                <h3 style="margin-top: 11px; font-family: 'Newsreader', Georgia, serif; font-weight: 500; color: #ece1cf; font-size: 21px; line-height: 1.22; text-wrap: pretty;">{{ a.title }}</h3>
                <div style="margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px;">
                  <sc-for list="{{ a.tags }}" as="t" hint-placeholder-count="2">
                    <span style="font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #b78f3a; border: 1px solid #3a2f1a; border-radius: 3px; padding: 4px 8px;">{{ t }}</span>
                  </sc-for>
                </div>
                <div style="margin-top: 18px; display: flex; gap: 8px;">
                  <button type="button" onClick="{{ a.onEdit }}" style="flex: 1; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; padding: 9px 12px; border-radius: 5px; cursor: pointer; background: transparent; border: 1px solid #3a2f1a; color: #c9bca6;" style-hover="border-color: #d8a942; color: #ece1cf;">Edit</button>
                  <button type="button" onClick="{{ a.onDelete }}" style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; padding: 9px 12px; border-radius: 5px; cursor: pointer; background: transparent; border: 1px solid #4a221a; color: #b5786c;" style-hover="border-color: #b5786c; color: #e7b0a4;">Delete</button>
                </div>
              </div>
            </div>
          </sc-for>
        </div>

        <sc-if value="{{ empty }}" hint-placeholder-val="{{ false }}">
          <div style="padding: 60px 0; text-align: center; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: #5f574a;">{{ emptyLabel }}</div>
        </sc-if>

        <!-- pager -->
        <sc-if value="{{ showPager }}" hint-placeholder-val="{{ false }}">
          <div style="margin-top: 50px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; overflow-x: auto;">
            <button type="button" onClick="{{ prev.onClick }}" style="{{ prev.style }}" style-hover="{{ prev.hoverStyle }}">{{ prev.label }}</button>
            <sc-for list="{{ pages }}" as="pg" hint-placeholder-count="5">
              <button type="button" onClick="{{ pg.onClick }}" style="{{ pg.style }}" style-hover="{{ pg.hoverStyle }}">{{ pg.label }}</button>
            </sc-for>
            <button type="button" onClick="{{ next.onClick }}" style="{{ next.style }}" style-hover="{{ next.hoverStyle }}">{{ next.label }}</button>
          </div>
        </sc-if>
      </div>
    </sc-if>

    <!-- ===================== EDITOR VIEW ===================== -->
    <sc-if value="{{ isEditor }}" hint-placeholder-val="{{ false }}">
      <div style="padding: 34px 0 0;">
        <sc-if value="{{ error }}" hint-placeholder-val="{{ false }}">
          <div style="margin-bottom: 22px; padding: 13px 16px; background: #2a1410; border: 1px solid #6b2c20; border-radius: 7px; color: #e7b0a4; font-size: 13px;">{{ error }}</div>
        </sc-if>

        <div style="display: grid; grid-template-columns: 320px 1fr; gap: 32px; align-items: start;">

          <!-- left: frontmatter -->
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <div>
              <label style="display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8c8170; margin-bottom: 9px;">Title</label>
              <input class="fld" type="text" value="{{ edTitle }}" onChange="{{ onTitle }}" placeholder="Post title">
            </div>
            <div>
              <label style="display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8c8170; margin-bottom: 9px;">Date</label>
              <input class="fld" type="date" value="{{ edDate }}" onChange="{{ onDate }}">
              <div style="margin-top: 7px; font-size: 11px; color: #5f574a;">Folder: {{ folderHint }}</div>
            </div>
            <div>
              <label style="display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8c8170; margin-bottom: 9px;">Status</label>
              <button type="button" onClick="{{ toggleDraft }}" style="{{ draftBtnStyle }}">{{ draftLabel }}</button>
            </div>
            <div>
              <label style="display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8c8170; margin-bottom: 9px;">Tags</label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                <sc-for list="{{ edTags }}" as="t" hint-placeholder-count="3">
                  <button type="button" onClick="{{ t.onRemove }}" style="font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #d8a942; border: 1px solid #3a2f1a; border-radius: 3px; padding: 5px 9px; cursor: pointer; background: #1d1710;" style-hover="border-color: #b5786c; color: #e7b0a4;">{{ t.label }} ✕</button>
                </sc-for>
              </div>
              <div style="display: flex; gap: 8px;">
                <input class="fld" list="all-tags" type="text" value="{{ tagInput }}" onChange="{{ onTagInput }}" placeholder="Add tag…">
                <button type="button" onClick="{{ addTagFromInput }}" style="white-space: nowrap; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 0 14px; border-radius: 6px; cursor: pointer; background: transparent; border: 1px solid #3a2f1a; color: #c9bca6;" style-hover="border-color: #d8a942; color: #ece1cf;">Add</button>
              </div>
              <datalist id="all-tags">
                <sc-for list="{{ allTagOptions }}" as="t" hint-placeholder-count="6">
                  <option value="{{ t }}"></option>
                </sc-for>
              </datalist>
            </div>
            <div>
              <label style="display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8c8170; margin-bottom: 9px;">Cover image</label>
              <sc-if value="{{ hasCover }}" hint-placeholder-val="{{ false }}">
                <img src="{{ coverUrl }}" alt="cover" style="width: 100%; border-radius: 6px; border: 1px solid #29221a; margin-bottom: 10px;">
              </sc-if>
              <button type="button" onClick="{{ uploadCover }}" style="width: 100%; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 11px; border-radius: 6px; cursor: pointer; background: transparent; border: 1px solid #3a2f1a; color: #c9bca6;" style-hover="border-color: #d8a942; color: #ece1cf;">{{ coverBtnLabel }}</button>
            </div>
          </div>

          <!-- right: body editor -->
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 12px; flex-wrap: wrap;">
              <div style="display: inline-flex; border: 1px solid #29221a; border-radius: 6px; overflow: hidden;">
                <button type="button" onClick="{{ setRaw }}" style="{{ rawTabStyle }}">Raw</button>
                <button type="button" onClick="{{ setRendered }}" style="{{ renderedTabStyle }}">Rendered</button>
              </div>
              <button type="button" onClick="{{ insertImage }}" style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 9px 14px; border-radius: 6px; cursor: pointer; background: transparent; border: 1px solid #3a2f1a; color: #c9bca6;" style-hover="border-color: #d8a942; color: #ece1cf;">+ Insert image</button>
            </div>

            <sc-if value="{{ isRaw }}" hint-placeholder-val="{{ true }}">
              <textarea id="md-body" class="md-raw" value="{{ edBody }}" onChange="{{ onBody }}" onInput="{{ onBody }}" placeholder="Write Markdown here…"></textarea>
            </sc-if>
            <sc-if value="{{ isRendered }}" hint-placeholder-val="{{ false }}">
              <div style="border: 1px solid #2a2218; border-radius: 6px; padding: 28px 32px; background: #100d09;">{{ preview }}</div>
            </sc-if>

            <div style="margin-top: 22px; display: flex; gap: 10px; justify-content: flex-end;">
              <button type="button" onClick="{{ cancelEdit }}" style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; padding: 12px 20px; border-radius: 6px; cursor: pointer; background: transparent; border: 1px solid #29221a; color: #8c8170;" style-hover="border-color: #4a3c1d; color: #c9bca6;">Cancel</button>
              <button type="button" onClick="{{ save }}" style="{{ saveBtnStyle }}">{{ saveLabel }}</button>
            </div>
          </div>
        </div>
      </div>
    </sc-if>

  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script>
class Component extends DCLogic {
  state = {
    view: 'list', articles: [], allTags: [], loading: true, serverDown: false,
    tag: 'all', sort: 'newest', menu: null, page: 1,
    ed: null, mode: 'raw', tagInput: '', saving: false, error: '',
  };

  componentDidMount() { this.load(); }

  async load() {
    try {
      const [aRes, tRes] = await Promise.all([fetch('/api/articles'), fetch('/api/tags')]);
      if (!aRes.ok || !tRes.ok) throw new Error('bad response');
      const a = await aRes.json();
      const t = await tRes.json();
      this.setState({ articles: a.articles || [], allTags: t.tags || [], loading: false, serverDown: false });
    } catch (e) {
      this.setState({ serverDown: true, loading: false });
    }
  }

  reload = () => { this.setState({ loading: true, serverDown: false }); this.load(); };

  today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  parseFM(text) {
    const m = /^\uFEFF?---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
    const fm = {};
    let body = text;
    if (m) {
      body = text.slice(m[0].length);
      for (const line of m[1].split('\n')) {
        const i = line.indexOf(':');
        if (i === -1) continue;
        const k = line.slice(0, i).trim();
        let v = line.slice(i + 1).trim();
        if (v.startsWith('[') && v.endsWith(']')) {
          v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else {
          v = v.replace(/^["']|["']$/g, '');
        }
        fm[k] = v;
      }
    }
    return { fm, body };
  }

  setEd(patch) { this.setState((s) => ({ ed: { ...s.ed, ...patch } })); }

  // ---- list controls ----
  sortDefs = [
    { key: 'newest', label: 'Newest' }, { key: 'oldest', label: 'Oldest' },
    { key: 'az', label: 'Title A–Z' }, { key: 'za', label: 'Title Z–A' },
  ];

  buildPages(page, total) {
    const out = [];
    const left = Math.max(2, page - 1);
    const right = Math.min(total - 1, page + 1);
    out.push(1);
    if (left > 2) out.push('gap-l');
    for (let i = left; i <= right; i++) out.push(i);
    if (right < total - 1) out.push('gap-r');
    if (total > 1) out.push(total);
    return out;
  }

  // ---- editor lifecycle ----
  openNew = () => {
    this.setState({
      view: 'editor', mode: 'raw', error: '', tagInput: '',
      ed: { originalDir: null, title: '', date: this.today(), draft: true, tags: [], img: '', body: '', assets: [] },
    });
  };

  openEdit = async (dir) => {
    this.setState({ error: '' });
    try {
      const r = await fetch('/api/article?dir=' + encodeURIComponent(dir));
      if (!r.ok) throw new Error('load failed');
      const data = await r.json();
      const { fm, body } = this.parseFM(data.raw || '');
      const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
      const date = fm.date || (dir.match(/^\d{4}-\d{2}-\d{2}/) || [''])[0];
      this.setState({
        view: 'editor', mode: 'raw', tagInput: '', error: '',
        ed: { originalDir: dir, title: fm.title || '', date, draft: fm.draft === 'true' || fm.draft === true, tags, img: fm.img || '', body, assets: data.assets || [] },
      });
    } catch (e) { this.setState({ serverDown: true }); }
  };

  cancelEdit = () => this.setState({ view: 'list', ed: null, error: '' });

  // ---- field handlers ----
  onTitle = (e) => this.setEd({ title: e.target.value });
  onDate = (e) => this.setEd({ date: e.target.value });
  onBody = (e) => this.setEd({ body: e.target.value });
  toggleDraft = () => this.setEd({ draft: !this.state.ed.draft });
  setRaw = () => this.setState({ mode: 'raw' });
  setRendered = () => this.setState({ mode: 'rendered' });

  onTagInput = (e) => this.setState({ tagInput: e.target.value });
  addTag = (t) => {
    t = String(t || '').trim();
    if (!t) return;
    const cur = this.state.ed.tags;
    if (!cur.includes(t)) this.setEd({ tags: [...cur, t] });
    this.setState({ tagInput: '' });
  };
  addTagFromInput = () => this.addTag(this.state.tagInput);
  removeTag = (t) => this.setEd({ tags: this.state.ed.tags.filter((x) => x !== t) });

  // ---- uploads ----
  pickFile(cb) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => { if (inp.files && inp.files[0]) cb(inp.files[0]); };
    inp.click();
  }

  async uploadTo(dir, file) {
    try {
      const r = await fetch('/api/upload?dir=' + encodeURIComponent(dir) + '&name=' + encodeURIComponent(file.name), {
        method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'upload failed'); }
      const j = await r.json();
      return j.path;
    } catch (e) { this.setState({ error: String(e.message || e) }); return null; }
  }

  uploadCover = () => this.pickFile(async (file) => {
    const dir = await this.ensureSaved();
    if (!dir) return;
    const path = await this.uploadTo(dir, file);
    if (path) this.setEd({ img: path });
  });

  insertImage = () => this.pickFile(async (file) => {
    const dir = await this.ensureSaved();
    if (!dir) return;
    const path = await this.uploadTo(dir, file);
    if (path) this.insertAtCursor('\n![](' + path + ')\n');
  });

  insertAtCursor(text) {
    const ta = document.getElementById('md-body');
    const body = this.state.ed.body || '';
    if (!ta) { this.setEd({ body: body + text }); return; }
    const s = ta.selectionStart != null ? ta.selectionStart : body.length;
    const e = ta.selectionEnd != null ? ta.selectionEnd : body.length;
    this.setEd({ body: body.slice(0, s) + text + body.slice(e) });
  }

  // ---- save / delete ----
  async doSave() {
    const ed = this.state.ed;
    if (!String(ed.title).trim()) { this.setState({ error: 'Title is required.' }); return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date)) { this.setState({ error: 'Date must be YYYY-MM-DD.' }); return null; }
    this.setState({ saving: true, error: '' });
    try {
      const r = await fetch('/api/article', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalDir: ed.originalDir, date: ed.date, title: ed.title, draft: ed.draft, tags: ed.tags, img: ed.img, body: ed.body }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ('HTTP ' + r.status)); }
      const j = await r.json();
      this.setState((s) => ({ saving: false, ed: { ...s.ed, originalDir: j.dir } }));
      return j.dir;
    } catch (e) { this.setState({ saving: false, error: String(e.message || e) }); return null; }
  }

  ensureSaved = async () => {
    const ed = this.state.ed;
    if (ed.originalDir) return ed.originalDir;
    return await this.doSave();
  };

  save = async () => {
    const dir = await this.doSave();
    if (dir) { await this.load(); this.setState({ view: 'list', ed: null }); }
  };

  remove = async (dir) => {
    if (!window.confirm('Delete ' + dir + ' and all its files? This cannot be undone.')) return;
    try {
      const r = await fetch('/api/article?dir=' + encodeURIComponent(dir), { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      await this.load();
    } catch (e) { this.setState({ serverDown: true }); }
  };

  renderVals() {
    const st = this.state;
    const isList = st.view === 'list';
    const isEditor = st.view === 'editor';

    // ---------- LIST ----------
    const menuBtn = { display: 'inline-flex', alignItems: 'center', gap: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '11px 15px', borderRadius: '5px', cursor: 'pointer', background: '#14100b', whiteSpace: 'nowrap', transition: 'all 0.2s ease' };
    const sortOpen = st.menu === 'sort';
    const tagOpen = st.menu === 'tag';
    const sortBtnStyle = { ...menuBtn, border: sortOpen ? '1px solid #d8a942' : '1px solid #29221a', color: '#8c8170' };
    const tagBtnStyle = { ...menuBtn, border: tagOpen ? '1px solid #d8a942' : '1px solid #29221a', color: '#8c8170' };

    const optBase = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: '11.5px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 11px', borderRadius: '4px', transition: 'all 0.15s ease' };
    const mkOpt = (on) => ({ style: { ...optBase, background: on ? '#1d1710' : 'transparent', color: on ? '#d8a942' : '#8c8170' }, hoverStyle: on ? {} : { background: '#1a150e', color: '#c9bca6' } });

    const all = st.articles.map((p) => ({
      ...p,
      dateLabel: this.formatDate(p.date),
      ts: Date.parse(p.date),
      hasImg: !!p.imgUrl, noImg: !p.imgUrl,
      tags: Array.isArray(p.tags) ? p.tags : [],
    }));

    const tagCounts = {};
    all.forEach((a) => a.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const tagOrder = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b));

    const sortOptions = this.sortDefs.map((s) => {
      const on = s.key === st.sort;
      const o = mkOpt(on);
      return { label: s.label, onClick: () => this.setState({ sort: s.key, menu: null, page: 1 }), style: o.style, hoverStyle: o.hoverStyle };
    });
    const sortLabel = (this.sortDefs.find((s) => s.key === st.sort) || this.sortDefs[0]).label;

    const tagDefs = [{ key: 'all', label: 'All posts', count: all.length }].concat(tagOrder.map((t) => ({ key: t, label: t, count: tagCounts[t] })));
    const tagOptions = tagDefs.map((t) => {
      const on = t.key === st.tag;
      const o = mkOpt(on);
      return { label: t.label, count: t.count, onClick: () => this.setState({ tag: t.key, menu: null, page: 1 }), style: o.style, hoverStyle: o.hoverStyle, countStyle: { fontSize: '10px', letterSpacing: '0.05em', color: on ? '#b78f3a' : '#5f574a' } };
    });
    const tagLabel = st.tag === 'all' ? 'All posts' : st.tag;

    const filtered = st.tag === 'all' ? all : all.filter((a) => a.tags.includes(st.tag));
    const sorters = { newest: (a, b) => b.ts - a.ts, oldest: (a, b) => a.ts - b.ts, az: (a, b) => a.title.localeCompare(b.title), za: (a, b) => b.title.localeCompare(a.title) };
    const sorted = filtered.slice().sort(sorters[st.sort] || sorters.newest);

    const perPage = 12;
    const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
    const page = Math.min(Math.max(1, st.page), totalPages);
    const start = (page - 1) * perPage;
    const pageItems = sorted.slice(start, start + perPage).map((a) => ({
      dir: a.dir, title: a.title, dateLabel: a.dateLabel, tags: a.tags, draft: a.draft,
      hasImg: a.hasImg, noImg: a.noImg, imgUrl: a.imgUrl,
      onEdit: () => this.openEdit(a.dir), onDelete: () => this.remove(a.dir),
    }));

    const countLabel = st.loading ? 'Loading…' : (st.tag === 'all' ? (sorted.length + ' posts') : (sorted.length + ' of ' + all.length));

    const pagerBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 13px', minWidth: '42px', borderRadius: '5px', background: 'transparent', transition: 'all 0.2s ease', flexShrink: 0 };
    const mkNav = (label, target, disabled) => ({ label, onClick: disabled ? () => {} : () => this.setState({ page: target }), style: { ...pagerBtn, border: '1px solid #29221a', color: disabled ? '#433c30' : '#c9bca6', cursor: disabled ? 'default' : 'pointer' }, hoverStyle: disabled ? {} : { borderColor: '#4a3c1d', color: '#ece1cf' } });
    const pages = this.buildPages(page, totalPages).map((item) => {
      if (item === 'gap-l' || item === 'gap-r') return { label: '…', onClick: () => {}, style: { ...pagerBtn, minWidth: '24px', border: 'none', color: '#5f574a', cursor: 'default' }, hoverStyle: {} };
      const on = item === page;
      return { label: String(item).padStart(2, '0'), onClick: () => this.setState({ page: item }), style: { ...pagerBtn, border: on ? '1px solid #d8a942' : '1px solid #29221a', color: on ? '#ece1cf' : '#8c8170', cursor: 'pointer' }, hoverStyle: on ? {} : { borderColor: '#4a3c1d', color: '#c9bca6' } };
    });

    // ---------- EDITOR ----------
    const ed = st.ed || { title: '', date: '', draft: true, tags: [], img: '', body: '', originalDir: null };
    const tabBtn = (on) => ({ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer', border: 'none', background: on ? '#d8a942' : 'transparent', color: on ? '#0f0c09' : '#8c8170' });
    const draftOn = !!ed.draft;
    const draftBtnStyle = { width: '100%', textAlign: 'left', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '12px 14px', borderRadius: '6px', cursor: 'pointer', background: draftOn ? '#1d1710' : '#13241a', border: draftOn ? '1px solid #3a2f1a' : '1px solid #234a32', color: draftOn ? '#d8a942' : '#6fce97' };
    const saveBtnStyle = { fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '12px 24px', borderRadius: '6px', cursor: st.saving ? 'default' : 'pointer', background: '#d8a942', border: '1px solid #d8a942', color: '#0f0c09', opacity: st.saving ? 0.6 : 1 };

    // preview with asset paths rewritten relative to the article folder
    let previewEl = null;
    if (isEditor && st.mode === 'rendered') {
      const base = ed.originalDir ? ('articles/' + ed.originalDir + '/') : '';
      let md = ed.body || '';
      if (base) md = md.replace(/(!\[[^\]]*\]\()(assets\/)/g, '$1' + base + '$2');
      const html = (window.marked ? window.marked.parse(md) : md.replace(/\n/g, '<br>'));
      previewEl = React.createElement('div', { className: 'prose', dangerouslySetInnerHTML: { __html: html } });
    }

    return {
      // view flags
      isList, isEditor, serverDown: st.serverDown, reload: this.reload,
      // list
      btnHover: { borderColor: '#4a3c1d' }, sortBtnStyle, tagBtnStyle, sortOpen, tagOpen,
      sortCaret: sortOpen ? '▲' : '▼', tagCaret: tagOpen ? '▲' : '▼', sortLabel, tagLabel,
      sortOptions, tagOptions,
      toggleSort: () => this.setState((s) => ({ menu: s.menu === 'sort' ? null : 'sort' })),
      toggleTag: () => this.setState((s) => ({ menu: s.menu === 'tag' ? null : 'tag' })),
      anyOpen: st.menu !== null, closeMenus: () => this.setState({ menu: null }),
      articles: pageItems, countLabel,
      empty: !st.loading && sorted.length === 0,
      emptyLabel: st.tag === 'all' ? 'No articles yet — create one.' : 'No posts with this tag.',
      showPager: totalPages > 1, pages, prev: mkNav('← Prev', page - 1, page <= 1), next: mkNav('Next →', page + 1, page >= totalPages),
      openNew: this.openNew,
      // editor
      error: st.error,
      edTitle: ed.title, edDate: ed.date, edBody: ed.body,
      onTitle: this.onTitle, onDate: this.onDate, onBody: this.onBody,
      folderHint: ed.originalDir || (ed.date || '—'),
      toggleDraft: this.toggleDraft, draftBtnStyle, draftLabel: draftOn ? 'Draft (hidden from site)' : 'Published',
      edTags: (ed.tags || []).map((t) => ({ label: t, onRemove: () => this.removeTag(t) })),
      allTagOptions: st.allTags, tagInput: st.tagInput, onTagInput: this.onTagInput, addTagFromInput: this.addTagFromInput,
      hasCover: !!ed.img, coverUrl: ed.originalDir && ed.img && !/^https?:/i.test(ed.img) ? ('articles/' + ed.originalDir + '/' + ed.img) : ed.img,
      coverBtnLabel: ed.img ? 'Replace cover' : 'Upload cover', uploadCover: this.uploadCover,
      insertImage: this.insertImage,
      setRaw: this.setRaw, setRendered: this.setRendered, isRaw: st.mode === 'raw', isRendered: st.mode === 'rendered',
      rawTabStyle: tabBtn(st.mode === 'raw'), renderedTabStyle: tabBtn(st.mode === 'rendered'),
      preview: previewEl,
      cancelEdit: this.cancelEdit, save: this.save, saveBtnStyle, saveLabel: st.saving ? 'Saving…' : 'Save',
    };
  }
}
</script>
</body>
</html>
```

- [ ] **Step 2: Start the server**

Run: `node scripts/admin-server.mjs`
Expected: prints `Admin server: http://127.0.0.1:8787/  (serving …)`. Leave it running in a separate terminal.

- [ ] **Step 3: Manual verification — list view**

Open `http://127.0.0.1:8787/` in Chrome. Verify:
- The page matches `index.html`'s look (dark theme, Newsreader/JetBrains Mono, gold accent).
- Article tiles render with covers, dates, tags; draft posts (create one in Step 5) show a gold **Draft** badge.
- Sort dropdown (Newest/Oldest/Title A–Z/Z–A) reorders tiles; Filter dropdown filters by tag and shows counts; pager appears when >12 posts.

- [ ] **Step 4: Manual verification — edit an existing post**

Click **Edit** on any post. Verify: title/date/tags/cover populate; toggling **Raw**/**Rendered** switches between the textarea and the `.prose` preview (which should look like `article.html`). Make a small body edit, click **Save**, confirm you return to the list and the change persisted (re-open it).

- [ ] **Step 5: Manual verification — create, tags, uploads, draft default**

Click **+ New article**. Verify: date defaults to today, status defaults to **Draft**. Type a title. Add an existing tag (datalist suggests) and a brand-new tag; remove one via its ✕ chip. Click **Upload cover**, pick an image → preview appears. Click **+ Insert image**, pick an image → `![](assets/…)` is inserted at the cursor; switch to **Rendered** and confirm the image displays. Save. Confirm a new `articles/<today>/` folder exists with `index.md` + `assets/`, the tile shows the **Draft** badge, and the post does NOT appear on the public `index.html` (drafts excluded).

- [ ] **Step 6: Manual verification — date rename + auto-suffix + delete**

Edit a post and change its date to a date that has no post → Save → confirm the folder was renamed (old gone, new present) and the public site updated. Then create a second post on a date that already has one → confirm it lands in `<date>-2` and the original is untouched. Finally **Delete** a test post → confirm the folder is removed and it disappears from both admin and `index.html`.

- [ ] **Step 7: Manual verification — server-down banner**

Stop the server (Ctrl+C) and reload the page (it's cached) or click an action → confirm the red "Admin server not reachable" banner with the start command + Retry appears. Restart the server, click **Retry** → list reloads.

- [ ] **Step 8: Commit**

```bash
git add admin.html
git commit -m "$(printf 'feat: admin.html CRUD UI for articles\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: One-shot cover migration (covers → assets/)

**Files:**
- Create: `scripts/migrate-covers.mjs`

- [ ] **Step 1: Implement the migration script**

```javascript
#!/usr/bin/env node
// One-shot, idempotent migration: move each article's root-level cover.* into
// assets/ and rewrite its `img:` frontmatter to 'assets/cover.*'.
//   node scripts/migrate-covers.mjs
import { readdir, readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { regenerate } from './lib/manifest.mjs';

const ARTICLES = 'articles';

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

const dirs = (await readdir(ARTICLES, { withFileTypes: true }))
  .filter((e) => e.isDirectory()).map((e) => e.name);

let moved = 0;
for (const dir of dirs) {
  const mdPath = join(ARTICLES, dir, 'index.md');
  if (!(await exists(mdPath))) continue;
  let raw = await readFile(mdPath, 'utf8');

  // current img value
  const m = /^img:\s*(.+)$/m.exec(raw);
  if (!m) continue;
  const cur = m[1].trim().replace(/^["']|["']$/g, '');
  if (cur.startsWith('assets/') || /^https?:/i.test(cur)) continue; // already migrated/external

  const srcPath = join(ARTICLES, dir, cur);
  if (!(await exists(srcPath))) continue;

  await mkdir(join(ARTICLES, dir, 'assets'), { recursive: true });
  const destRel = 'assets/' + cur;
  await rename(srcPath, join(ARTICLES, dir, destRel));
  raw = raw.replace(/^img:\s*.+$/m, "img: '" + destRel + "'");
  await writeFile(mdPath, raw, 'utf8');
  moved++;
  console.log(`migrated ${dir}: ${cur} -> ${destRel}`);
}

const { posts, bodies } = await regenerate();
console.log(`Migrated ${moved} cover(s). Regenerated ${posts} post(s), ${bodies} body file(s).`);
```

- [ ] **Step 2: Run the migration once**

Run: `node scripts/migrate-covers.mjs`
Expected: prints a `migrated <dir>: cover.png -> assets/cover.png` line for each of the 38 articles, then the regenerate summary.

- [ ] **Step 3: Verify covers moved and frontmatter updated**

Run: `find articles -maxdepth 2 -iname 'cover.*' -not -path '*/assets/*' | wc -l` → expect `0`.
Run: `grep -rL "img: 'assets/" articles/*/index.md | wc -l` → expect `0` (every article's img now points at assets/).

- [ ] **Step 4: Verify the site still renders covers**

With the admin server running, open `http://127.0.0.1:8787/index.html` and `…/article.html?slug=<any>` → confirm cover images still display (now served from `assets/`).

- [ ] **Step 5: Run idempotency check**

Run: `node scripts/migrate-covers.mjs`
Expected: `Migrated 0 cover(s).` (everything already on `assets/`).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-covers.mjs articles
git commit -m "$(printf 'chore: migrate covers into assets/ and update frontmatter\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Admin" section to README.md**

Insert after the "Build" section:

```markdown
## Admin (local CRUD)

A local-only tool for managing articles without editing files by hand. It is a
dev tool — never deploy the server.

```sh
node scripts/admin-server.mjs   # then open http://127.0.0.1:8787/
```

`admin.html` lists every article (including drafts), and lets you create, edit,
and delete posts: frontmatter fields (title, date, draft, tags, cover image), a
raw/rendered Markdown editor, and image uploads into the article's `assets/`
folder. New posts default to `draft: true`. Changing a post's date renames its
folder; if the date is already taken the folder is auto-suffixed (`-2`, `-3`).
Every change re-runs the manifest build automatically, so the static site stays
in sync. The server requires no npm dependencies.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(printf 'docs: document the local admin tool\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full test suite passes**

Run: `node --test scripts/lib/*.test.mjs`
Expected: all tests PASS (23 total).

- [ ] **Step 2: Manifest is clean and committed**

Run: `node scripts/generate-manifest.mjs && git status --porcelain articles`
Expected: no uncommitted changes under `articles/` (generated output already committed).

- [ ] **Step 3: Confirm the public site is untouched in behavior**

Open `http://127.0.0.1:8787/index.html` → grid/sort/filter work exactly as before; drafts created via admin do NOT appear. Open a couple of articles → bodies and covers render.
```
