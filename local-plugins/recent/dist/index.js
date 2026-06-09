import fs from "fs"
import path from "path"

export const manifest = {
  name: "recent",
  displayName: "Recent",
  description:
    "Replace a ```recent``` code block with a list of index.md pages, most recent first (title + date, linked).",
  version: "1.0.0",
  category: "transformer",
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Pull `title` and `date` out of a YAML frontmatter block. Intentionally tiny:
// these index.md files use simple `key: value` frontmatter, so a full YAML
// parser would be overkill.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const body = m[1]
  const get = (key) => {
    const mm = body.match(new RegExp("^" + key + ":\\s*(.*)$", "m"))
    if (!mm) return undefined
    let v = mm[1].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    return v
  }
  return { title: get("title"), date: get("date") }
}

// "2024-08-26T17:36:22-05:00" -> "August 26, 2024". Format from the calendar
// date components in UTC so the displayed day never shifts by timezone.
function formatDate(iso) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ""
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

// Resolve the content root (the dir holding the page folders) from the current
// vfile, falling back to ./content when relativePath isn't populated.
function contentRootFor(file) {
  const rel = file?.data?.relativePath
  const full = file?.path
  if (rel && typeof full === "string" && full.endsWith(rel)) {
    return full.slice(0, full.length - rel.length)
  }
  return path.resolve("content")
}

// Walk the content tree and collect every folder whose index.md carries both a
// `title` and a `date`. `slug` is the folder path relative to the content root,
// which is what crawl-links resolves into a base-path-aware href.
function collectPages(root) {
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const sub = path.join(dir, ent.name)
      const idx = path.join(sub, "index.md")
      if (fs.existsSync(idx)) {
        const fm = parseFrontmatter(fs.readFileSync(idx, "utf8"))
        if (fm.title && fm.date) {
          const slug = path.relative(root, sub).split(path.sep).join("/")
          out.push({ slug, title: fm.title, date: fm.date })
        }
      }
      walk(sub)
    }
  }
  walk(root)
  // most recent first
  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return out
}

function buildListHtml(pages) {
  let html = '<ul class="recent-list">'
  for (const p of pages) {
    html +=
      `<li class="recent-item"><a class="recent-link" href="${escapeHtml(p.slug)}">` +
      `<span class="recent-title">${escapeHtml(p.title)}</span>` +
      `<span class="recent-date">${escapeHtml(formatDate(p.date))}</span>` +
      `</a></li>`
  }
  html += "</ul>"
  return html
}

const Recent = (_opts) => ({
  name: "Recent",
  markdownPlugins() {
    return [
      () => (tree, file) => {
        // Cheap early-out: only touch files that actually contain a recent block.
        let hasRecent = false
        const scan = (node) => {
          if (hasRecent || !node) return
          if (node.type === "code" && node.lang === "recent") {
            hasRecent = true
            return
          }
          if (Array.isArray(node.children)) node.children.forEach(scan)
        }
        scan(tree)
        if (!hasRecent) return

        const pages = collectPages(contentRootFor(file))
        const listHtml = buildListHtml(pages)

        const walk = (node) => {
          if (!node || !Array.isArray(node.children)) return
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i]
            if (child.type === "code" && child.lang === "recent") {
              node.children[i] = { type: "html", value: listHtml }
            } else {
              walk(child)
            }
          }
        }
        walk(tree)
      },
    ]
  },
})

export default Recent
