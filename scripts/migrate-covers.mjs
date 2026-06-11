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
