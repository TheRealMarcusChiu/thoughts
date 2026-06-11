// scripts/lib/article-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFrontmatter, buildMarkdown } from './article-store.mjs';
import { dirDate, nextFreeDir } from './article-store.mjs';
import { parseFrontmatter, stripFrontmatter } from './manifest.mjs';
import { mkdtemp, mkdir as mkdirp, writeFile as wf } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as pj } from 'node:path';
import { listArticles, readArticle, allTags, listDirNames } from './article-store.mjs';
import { saveArticle, deleteArticle, saveUpload } from './article-store.mjs';
import { readFile as rf, stat as st } from 'node:fs/promises';

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

test('serializeFrontmatter round-trips titles with both quote kinds losslessly', () => {
  for (const title of ['say "hi"', "both ' and \" quotes", '"leads', 'trails"', "It's fine"]) {
    const block = serializeFrontmatter({ draft: false, title, tags: [], img: '', date: '2026-01-01' });
    assert.equal(parseFrontmatter(block + '\n\nb\n').title, title);
  }
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
