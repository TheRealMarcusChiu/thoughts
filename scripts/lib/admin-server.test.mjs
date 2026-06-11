// scripts/lib/admin-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAdminServer } from '../admin-server.mjs';

const exec = promisify(execFile);
const git = (cwd, ...args) => exec('git', args, { cwd });

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

test('a malformed request line gets 400 and does not crash the server', async () => {
  await withServer(async (base) => {
    const port = Number(new URL(base).port);
    // Send an absolute-form target that makes new URL() throw, over a raw socket.
    const status = await new Promise((resolve, reject) => {
      const sock = connect(port, '127.0.0.1', () => {
        sock.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
      });
      let buf = '';
      sock.on('data', (d) => { buf += d.toString(); });
      sock.on('end', () => resolve(buf.split(' ')[1]));
      sock.on('error', reject);
    });
    assert.equal(status, '400');
    // Server is still alive for normal requests.
    const r = await fetch(base + '/api/articles');
    assert.equal(r.status, 200);
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

// Sets up a real git repo at root with a bare remote as origin, runs `body`.
async function withGitServer(run) {
  const root = await mkdtemp(join(tmpdir(), 'admin-git-'));
  const remote = await mkdtemp(join(tmpdir(), 'admin-remote-'));
  await git(remote, 'init', '--bare', '-b', 'main');
  await git(root, 'init', '-b', 'main');
  await git(root, 'config', 'user.email', 'test@example.com');
  await git(root, 'config', 'user.name', 'Test');
  await git(root, 'remote', 'add', 'origin', remote);
  await mkdir(join(root, 'articles', '2026-05-18'), { recursive: true });
  await writeFile(join(root, 'articles', '2026-05-18', 'index.md'),
    '---\ndraft: false\ntitle: "Alpha"\ntags: ["x"]\ndate: 2026-05-18\n---\n\nBody A\n');
  await git(root, 'add', '-A');
  await git(root, 'commit', '-m', 'initial');
  await git(root, 'push', '-u', 'origin', 'main');
  const server = createAdminServer(root);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await run(base, root, remote); } finally { await new Promise((r) => server.close(r)); }
}

test('POST /api/article commits and pushes when root is a git repo', async () => {
  await withGitServer(async (base, root, remote) => {
    const before = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
    const r = await fetch(base + '/api/article', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalDir: null, date: '2026-08-01', title: 'Fresh', draft: false, tags: [], img: '', body: 'Hi' }),
    });
    const j = await r.json();
    assert.equal(j.dir, '2026-08-01');
    assert.equal(j.git.committed, true);
    assert.equal(j.git.pushed, true);
    // A new commit exists locally and the working tree is clean (everything committed).
    const after = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
    assert.notEqual(after, before);
    assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '');
    // The remote received it.
    assert.equal((await git(remote, 'rev-parse', 'HEAD')).stdout.trim(), after);
    assert.match((await git(root, 'log', '-1', '--pretty=%s')).stdout, /Fresh/);
  });
});

test('DELETE /api/article commits and pushes when root is a git repo', async () => {
  await withGitServer(async (base, root, remote) => {
    const r = await fetch(base + '/api/article?dir=2026-05-18', { method: 'DELETE' });
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.git.committed, true);
    assert.equal(j.git.pushed, true);
    assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '');
    const head = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
    assert.equal((await git(remote, 'rev-parse', 'HEAD')).stdout.trim(), head);
  });
});

test('POST /api/article skips git cleanly when root is not a repo', async () => {
  await withServer(async (base) => {
    const r = await fetch(base + '/api/article', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalDir: null, date: '2026-08-02', title: 'NoGit', draft: false, tags: [], img: '', body: 'x' }),
    });
    const j = await r.json();
    assert.equal(j.dir, '2026-08-02');     // save still succeeds
    assert.equal(j.git.skipped, true);     // git step was skipped, not errored
  });
});
