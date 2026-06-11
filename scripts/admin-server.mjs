#!/usr/bin/env node
// Local-only admin server for the static blog. Serves the project directory and
// exposes a small CRUD/upload API for articles. Never deploy this.
//   node scripts/admin-server.mjs   →   http://127.0.0.1:8787/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const execFileP = promisify(execFile);

// Stage everything, commit, and push — so each admin edit is persisted to git.
// Never throws: returns a status object the API echoes back. If root isn't a
// git repo (e.g. tests against a temp dir) it skips silently. A failed push
// (offline / no auth) still reports the successful local commit.
async function gitCommitPush(root, message) {
  try {
    await execFileP('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
  } catch {
    return { skipped: true };
  }
  try {
    await execFileP('git', ['add', '-A'], { cwd: root });
    try {
      await execFileP('git', ['commit', '-m', message], { cwd: root });
    } catch (e) {
      const out = String((e.stdout || '') + (e.stderr || ''));
      if (/nothing to commit/i.test(out)) return { committed: false, pushed: false };
      throw e;
    }
    try {
      await execFileP('git', ['push'], { cwd: root });
      return { committed: true, pushed: true };
    } catch (e) {
      return { committed: true, pushed: false, error: String(e.stderr || e.message || e).trim() };
    }
  } catch (e) {
    return { committed: false, pushed: false, error: String(e.stderr || e.message || e).trim() };
  }
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
        const git = await gitCommitPush(root, `admin: save "${data.title || dir}" (${dir})`);
        return sendJson(res, 200, { dir, git });
      }
      if (p === '/api/article' && req.method === 'DELETE') {
        const dir = url.searchParams.get('dir');
        if (!dir) return sendJson(res, 400, { error: 'dir required' });
        await deleteArticle(articlesDir, dir);
        await regenerate({ articlesDir });
        const git = await gitCommitPush(root, `admin: delete ${dir}`);
        return sendJson(res, 200, { ok: true, git });
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
    // new URL throws synchronously on a malformed request line — don't let that
    // crash the long-running dev server.
    let url;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); }
    catch { res.writeHead(400); res.end('bad request'); return; }
    const done = url.pathname.startsWith('/api/')
      ? handleApi(req, res, url)
      : handleStatic(req, res, url);
    // Backstop: both handlers catch internally, but guard against any future
    // path that throws before its own try/catch.
    done.catch((e) => {
      if (!res.headersSent) sendJson(res, 500, { error: String((e && e.message) || e) });
      else res.end();
    });
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
