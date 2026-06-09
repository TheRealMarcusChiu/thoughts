import { h } from "preact"

// --- path utils (inlined from @quartz-community/utils so the link href is
// base-path-aware: component output is NOT processed by crawl-links) ---
function stripSlashes(s, onlyStripPrefix) {
  if (s.startsWith("/")) s = s.substring(1)
  if (!onlyStripPrefix && s.endsWith("/")) s = s.slice(0, -1)
  return s
}
function endsWith(s, suffix) {
  return s === suffix || s.endsWith("/" + suffix)
}
function trimSuffix(s, suffix) {
  return endsWith(s, suffix) ? s.slice(0, -suffix.length) : s
}
function simplifySlug(fp) {
  const res = stripSlashes(trimSuffix(fp, "index"), true)
  return res.length === 0 ? "/" : res
}
function pathToRoot(slug) {
  const r = slug
    .split("/")
    .filter((x) => x !== "")
    .slice(0, -1)
    .map(() => "..")
    .join("/")
  return r.length === 0 ? "." : r
}
function joinSegments(...args) {
  if (args.length === 0) return ""
  let joined = args
    .filter((seg) => seg !== "" && seg !== "/")
    .map((seg) => stripSlashes(seg))
    .join("/")
  const first = args[0]
  const last = args[args.length - 1]
  if (first?.startsWith("/")) joined = "/" + joined
  if (last?.endsWith("/")) joined = joined + "/"
  return joined
}
function resolveRelative(current, target) {
  return joinSegments(pathToRoot(current), simplifySlug(target))
}

// Dated article folders: slug is `YYYY-MM-DD` (or `YYYY-MM-DD/index`).
const DATED_SLUG = /^(\d{4})-(\d{2})-(\d{2})(\/index)?$/

// "2024-08-26" -> "August 26, 2024" (formatted in UTC so the day never shifts).
function formatDate(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey)
  if (!m) return ""
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

const RecentSidebar = (_opts) => {
  function RecentSidebarComponent({ allFiles, fileData, displayClass }) {
    const current = fileData?.slug ?? ""
    const pages = (allFiles ?? [])
      .filter((p) => DATED_SLUG.test(p.slug ?? ""))
      .map((p) => {
        const dateKey = (p.slug ?? "").split("/")[0]
        return {
          slug: p.slug,
          title: (p.frontmatter && p.frontmatter.title) || dateKey,
          dateKey,
        }
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey)) // most recent first

    return h("div", { class: [displayClass, "recent-sidebar"].filter(Boolean).join(" ") }, [
      h("h3", { class: "recent-sidebar-title" }, "Recent"),
      h(
        "ul",
        { class: "recent-sidebar-list" },
        pages.map((p) =>
          h("li", { class: "recent-sidebar-item" }, [
            h("a", { class: "recent-sidebar-link", href: resolveRelative(current, p.slug) }, [
              h("span", { class: "recent-sidebar-name" }, p.title),
              h("span", { class: "recent-sidebar-date" }, formatDate(p.dateKey)),
            ]),
          ]),
        ),
      ),
    ])
  }
  return RecentSidebarComponent
}

export { RecentSidebar }
