# Mark the Thoughts

A minimal, dependency-free static blog — reflections, tinkerings, and technical write-ups.
Lives at [www.marcuschiu.com](http://www.marcuschiu.com).

The site is plain HTML/JS with no build step or framework. It works on any static
host, including opening the files directly via `file://`.

## Structure

```
index.html      # article listing (sort + filter)
article.html    # single-article reader
support.js      # shared runtime / rendering
easter-eggs.js  # shared easter eggs (type "marcus" → highlighter; Konami → candlelight)
articles/
  <YYYY-MM-DD>/
    index.md    # the article (frontmatter + Markdown body)
    index.js    # auto-generated body bundle (do not edit)
    assets/     # images for the article (optional)
  manifest.js   # auto-generated listing (do not edit)
scripts/
  generate-manifest.mjs
```

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
node scripts/generate-manifest.mjs
```

This scans `articles/`, writes `articles/manifest.js` (the listing), and writes a
sibling `index.js` next to each `index.md`. Both are generated — don't edit them by hand.

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

## Deploy

Serve the directory as static files. No server-side code is required.
