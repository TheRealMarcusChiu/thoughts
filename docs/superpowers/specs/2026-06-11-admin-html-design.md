# Design: `admin.html` — local CRUD admin for the static blog

Date: 2026-06-11

## Goal

A single `admin.html` that lists, creates, updates, and deletes articles
(`articles/<folder>/index.md`) with frontmatter editing, tag management, image
and cover uploads, and a raw/rendered editor — while keeping the public site
100% static. It looks and feels like `index.html`, with CRUD layered on top.

## Constraints discovered

- The site is dependency-free static and works over `file://`.
- `index.html` is built on the homegrown `dc-runtime` (in `support.js`): React
  under the hood with `<x-dc>` + `{{ }}` templates and a `DCLogic` component.
  Reusing it yields pixel-identical styling.
- `article.html` renders markdown bodies with `marked@12` (CDN) into a `.prose`
  div. The admin "rendered view" reuses this for fidelity.
- `scripts/generate-manifest.mjs` scans `articles/`, writing `articles/manifest.js`
  (the listing consumed by `index.html`; **drafts excluded**) and a sibling
  `index.js` body bundle per article (consumed by `article.html`). Any edit must
  re-run this build.
- A browser page cannot write to disk on its own → a small local server is
  required for real file CRUD and uploads.

## Architecture

Three new files. The public site (`index.html`, `article.html`, `support.js`,
`articles/*`) is otherwise untouched and stays static.

1. **`scripts/admin-server.mjs`** — Node, **zero npm deps** (built-in
   `http`/`fs`/`path`). Binds `127.0.0.1:8787`. Serves the project directory
   statically (so `admin.html`, `support.js`, fonts, and `articles/assets/*` all
   load) **and** exposes a JSON/upload API under `/api/*`. After every mutation
   it calls `regenerate()` so `index.html`/`article.html` reflect changes
   immediately. Local-only, no auth — a dev tool, never deployed.

2. **`admin.html`** — reuses `support.js` (dc-runtime) + the same fonts/palette
   as `index.html`. One `DCLogic` component with two views (list ⇄ editor).
   Uses `marked@12` (same CDN as `article.html`) for the rendered preview.

3. **`scripts/migrate-covers.mjs`** — one-shot migration: for each of the 38
   existing articles, move `cover.*` → `assets/cover.*` and rewrite the `img:`
   frontmatter to `'assets/cover.*'`. Run once, then `regenerate()`.

### Refactor (targeted improvement to code being worked in)

`generate-manifest.mjs` is refactored to **export** a `regenerate()` function
plus its helpers (`parseFrontmatter`, `stripFrontmatter`, `rewriteRelativePaths`,
`walk`). Its CLI behavior (run directly → regenerate + log) is preserved. The
admin server imports `regenerate()` so the build logic is never duplicated.

## API (`admin-server.mjs`)

| Method  | Route                          | Purpose |
|---------|--------------------------------|---------|
| `GET`   | `/api/articles`                | Scan `articles/`, return **all** posts incl. drafts (list view needs drafts). Each: `{ dir, title, date, tags, draft, img, imgUrl }`. |
| `GET`   | `/api/article?dir=<folder>`    | Raw `index.md` text (frontmatter + body) + list of files in `assets/`. |
| `POST`  | `/api/article`                 | Create/update. Body: `{ originalDir?, date, title, draft, tags[], img, body }`. Writes `index.md`; folder placement per rules below; then `regenerate()`. Returns the final `dir`. |
| `DELETE`| `/api/article?dir=<folder>`    | Remove the entire date folder, then `regenerate()`. |
| `POST`  | `/api/upload?dir=<folder>`     | Save an uploaded image to `articles/<folder>/assets/`, return its path relative to the article folder (e.g. `assets/diagram.png`). |
| `GET`   | `/api/tags`                    | Union of all tags across all articles incl. drafts, for the tag picker. |

Non-`/api/` requests are served as static files from the project root.

## `admin.html` — List view

Mirrors `index.html`'s grid + Sort + Filter exactly, but sourced from
`/api/articles` (live data, **includes drafts**). Additions:

- A **DRAFT** badge on draft cards.
- A **+ New** button (opens the editor prefilled for create).
- **Edit** and **Delete** actions per card (Delete asks for confirmation).

Sort options (Newest / Oldest / Title A–Z / Z–A) and tag filtering match
`index.html`. Drafts are included in counts and tag facets here (unlike the
public site).

## `admin.html` — Editor view (create / update)

Frontmatter controls:

- **title** — text input.
- **date** — date picker. Drives folder placement (see rules). Defaults to
  today on create.
- **draft** — toggle. **Defaults ON (true) for new articles.**
- **tags** — chip multiselect over existing tags (from `/api/tags`) plus
  free-type to create a new tag. Stored as the `tags: [...]` array.
- **cover image** — upload button → stored in `articles/<folder>/assets/`, sets
  `img: 'assets/<file>'`, shows a preview thumbnail.

Body editor — two modes toggled by a control:

- **Raw** — monospace `textarea` of the markdown body.
- **Rendered** — `marked.parse(body)` into a `.prose` div, identical to
  `article.html`.

Body image insert: an upload button POSTs to `/api/upload`, then inserts
`![](assets/<file>)` at the cursor in the raw textarea.

Save / Cancel buttons. Save POSTs to `/api/article`; on success returns to the
list view (refreshed). Cancel discards and returns to the list.

## Folder placement rules

- Folder identity is the article's date: `YYYY-MM-DD`. If that folder is already
  taken by a different article, the next free suffix is used: `YYYY-MM-DD-2`,
  `-3`, … (**auto-suffix; never blocks, never overwrites**).
- Because suffixed folder names break `generate-manifest`'s date-from-folder
  regex, the admin **always writes `date:` explicitly into the frontmatter**
  (the generator already prefers `fm.date` over the derived date). Dates stay
  correct regardless of folder suffix.
- **Create:** new folder = first free of `<date>`, `<date>-2`, … Editor
  prefilled `date = today`, `draft = true`.
- **Update, date unchanged:** write in place (`originalDir`).
- **Update, date changed:** rename `originalDir` → first free folder for the new
  date (auto-suffix). The renamed folder carries its `assets/` and regenerated
  `index.js`. The existing post on the target date is never touched.

## Data flow

- **Load list:** `GET /api/articles` → render grid (drafts included).
- **Create:** New → editor (today, draft) → Save → `POST /api/article` (no
  `originalDir`) → server creates folder + `index.md` → `regenerate()` → list
  refresh.
- **Edit:** `GET /api/article?dir` → populate editor → Save → `POST` with
  `originalDir` → server writes/renames per rules → `regenerate()` → refresh.
- **Upload (cover or body image):** `POST /api/upload?dir` → returns
  `assets/<file>` → set as `img` (cover) or inserted into body (image).
- **Delete:** confirm → `DELETE /api/article?dir` → folder removed →
  `regenerate()` → refresh.

## Error handling

- **Server down:** admin shows a banner with the start command
  (`node scripts/admin-server.mjs`) and retry.
- **Upload/write failure:** inline error; editor state preserved.
- **Delete failure:** inline error; list unchanged.
- Save validates a non-empty title and a valid `YYYY-MM-DD` date before POSTing.

## Cover migration (`scripts/migrate-covers.mjs`)

One-shot, idempotent: for each `articles/*/index.md`, if `img:` points at a
root-level `cover.*` and that file exists at the folder root, move it into
`assets/cover.*` and rewrite `img:` to `'assets/cover.*'`. Skip articles already
on `assets/`. Run once; then `regenerate()`. All 38 current articles use a
root-level `cover.<ext>`, so all migrate.

## Security

`127.0.0.1` bind only, no auth. `admin.html` + the two scripts are committable
source but are not used by the static public deploy.

## Out of scope (YAGNI)

- Authentication / multi-user.
- Editing the public site's rendering or `index.html`/`article.html`.
- Deploying the admin server anywhere but localhost.
- Reordering, scheduling, or non-article content types.
