# Mark the Thoughts

A minimal, dependency-free static blog — reflections, tinkerings, and technical write-ups.
Lives at [www.marcuschiu.com](http://www.marcuschiu.com).

The site is plain HTML/JS with no build step or framework. It works on any static
host, including opening the files directly via `file://`.

## Structure

```
index.html      # single-page app: article listing + reader (easter eggs inlined)
config.js       # site config (title, tagline) — copied from config.js.example
support.js      # shared runtime / rendering
articles/
  <YYYY-MM-DD>/
    index.md    # the article (frontmatter + Markdown body)
    index.js    # auto-generated body bundle (do not edit)
    assets/     # images for the article (optional)
  manifest.js   # auto-generated listing (do not edit)
server/
  server.mjs            # local admin server + manifest build (node server/server.mjs [--build])
  update-local.sh       # deploy helper (ssh: git pull + restart service)
  thoughts-admin.service # systemd unit for running the server in a container
```

## Configuration

Site-level text (the header title and tagline) lives in `config.js`. Copy the
template and edit the values:

```sh
cp config.js.example config.js
```

```js
window.SITE_CONFIG = {
  title: 'Mark the Thoughts',
  tagline: 'Reflections, parables, and ramblings — collected here. Sort and filter, or click any post to read it.',
};
```

`config.js.example` is the checked-in template; `config.js` is what the site
actually loads. If `config.js` is missing, the header falls back to the built-in
defaults.

## Writing an article

Create a folder named by date and add an `index.md`:

```
articles/2026-06-11/index.md
```

With frontmatter followed by the Markdown body:

```markdown
---
draft: false
title: "My Post Title"
tags: ["homelab", "networking"]
img: assets/cover.png
---

Body goes here. Images are relative to this folder, e.g. ![alt](assets/1.png)
```

Frontmatter keys:

- `title` — post title (defaults to the folder name).
- `draft` — `true` omits the post from the site entirely.
- `tags` — array used for filtering (defaults to `[]`).
- `img` — optional cover image, relative to the article folder or an absolute URL.
- `date` — optional; derived from the folder name when omitted.

## Build

After adding or editing articles, regenerate the manifest and body bundles:

```sh
node server/server.mjs --build
```

This scans `articles/`, writes `articles/manifest.js` (the listing), and writes a
sibling `index.js` next to each `index.md`. Both are generated — don't edit them by hand.

## Admin (local CRUD)

A local-only tool for managing articles without editing files by hand. It is a
dev tool — never deploy the server.

```sh
node server/server.mjs   # then open http://127.0.0.1:8787/
```

Admin mode lives inside `index.html` itself. With the site open, press
**⌘E** (macOS) / **Ctrl+E** (Windows/Linux) to toggle it. The listing then shows
every article (including drafts, whose tiles are dimmed) with a ✎ edit button on
each tile, a **Status** filter (All / Visible / Hidden), a ⚙ settings button to
point the editor at a different server endpoint, and a floating **+** button to
create a post. Press **⌘E** / **Ctrl+E** again to leave admin mode.

Creating or editing a post opens an in-page editor with frontmatter fields
(title, date, draft, tags, cover image), a rendered/Markdown editor, and image
uploads into the article's `assets/` folder. New posts default to `draft: true`.
Changing a post's date renames its folder; if the date is already taken the
folder is auto-suffixed (`-2`, `-3`). Every change re-runs the manifest build and
is auto-committed/pushed server-side, so the static site stays in sync. The
server requires no npm dependencies, and the editor only works while it is
running (otherwise admin mode shows a "server not reachable" banner).

## Deploy

Serve the directory as static files. No server-side code is required.

## Run the admin server as a service (systemd)

To keep the admin server running in a Proxmox LXC Ubuntu container, use the
bundled unit `server/thoughts-admin.service`. It assumes the repo is checked out
at `/root/thoughts` and runs Node from the nvm path
`/root/.nvm/versions/node/v24.16.0/bin/node` — adjust `ExecStart` in the unit if
your Node version or install path differs (systemd does not load nvm's PATH, so
an absolute node path is required).

```sh
# from inside the container
git clone <repo> /root/thoughts
ln -s /root/thoughts/server/thoughts-admin.service /etc/systemd/system/thoughts-admin.service
systemctl daemon-reload
systemctl enable --now thoughts-admin.service
systemctl status thoughts-admin.service
```

The service binds `0.0.0.0:9000` (all interfaces) so it accepts remote
connections. The admin API has **no authentication** — only run it on a trusted
network/firewall, and preferably behind a reverse proxy (nginx/Caddy) for TLS
and access control. To restrict it to the container itself instead, edit the
unit and set `Environment=HOST=127.0.0.1`, then
`systemctl daemon-reload && systemctl restart thoughts-admin.service`.

`server/update-local.sh` is a convenience script that SSHes in, pulls the latest
commit, and restarts the service after you've published changes.
