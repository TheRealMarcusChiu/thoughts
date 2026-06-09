import { h } from "preact"

const style = `
.pagefind-results {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.pagefind-results .pf-result {
  padding: 0.5rem;
  border-radius: 5px;
}
.pagefind-results .pf-result:hover,
.pagefind-results .pf-result.focus {
  background: var(--background-secondary, var(--lightgray));
}
.pagefind-results .pf-title {
  font-weight: 600;
  color: var(--text-normal, var(--dark));
}
.pagefind-results .pf-excerpt {
  font-size: 0.85rem;
  color: var(--text-muted, var(--darkgray));
}
.pagefind-results mark {
  background: var(--text-highlight-bg, var(--textHighlight));
  /* !important so the Obsidian theme (higher @layer) can't override it. */
  color: #000 !important;
  padding: 0 0.1rem;
}
.pagefind-results .pf-subresults {
  margin: 0.25rem 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
/* Toolbar button: fill (almost) the full sidebar width, text left + icon right. */
.search {
  width: 100%;
}
.search > .search-button {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  background: var(--background-secondary, var(--lightgray));
  color: var(--text-normal, var(--dark));
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
}
.search > .search-button p {
  margin: 0;
}
/* Icon matches the "Search" text size and sits to the right of the text. */
.search > .search-button svg {
  flex: 0 0 auto;
  width: 1em;
  height: 1em;
}
.search > .search-button .search-path {
  stroke: currentColor;
}
.search > .search-container { display: none; }
.search > .search-container.active {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 1000;
  /* Dim the page strongly so the results panel doesn't blend into it. */
  background: rgba(0, 0, 0, 0.7);
}
.search > .search-container.active .search-space {
  max-width: 50rem;
  margin: 12vh auto 0;
  padding: 1rem;
  /* Solid, opaque panel with a clear edge against the dimmed page. */
  /* !important: the bundled Obsidian theme forces this element transparent in
     @layer obsidian-theme, which outranks this component's @layer quartz-base. */
  background-color: var(--background-secondary, var(--lightgray)) !important;
  border: 1px solid var(--background-modifier-border, var(--lightgray));
  border-radius: 8px;
  box-shadow: 0 14px 50px rgba(0, 0, 0, 0.5);
}
.search > .search-container.active .search-bar {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  font-size: 1.1rem;
  /* !important: same Obsidian-theme override applies to .search-space > * children. */
  background-color: var(--background-primary, var(--light)) !important;
  color: var(--text-normal, var(--dark));
  border: 1px solid var(--background-modifier-border, var(--lightgray));
  border-radius: 5px;
}
`

const script = `
const SEARCH_ENABLED = true
let pagefind = null
let pagefindLoading = null

function basePath() {
  return document.body.dataset.basepath || ""
}

async function loadPagefind() {
  if (pagefind) return pagefind
  if (!pagefindLoading) {
    const url = basePath() + "/pagefind/pagefind.js"
    pagefindLoading = import(url).then((mod) => {
      pagefind = mod
      return mod
    })
  }
  return pagefindLoading
}

function resultUrl(url) {
  // Pagefind already returns base-path-aware URLs: it infers the site root from
  // the pagefind.js location (e.g. /tech/pagefind/ => base /tech/), so its
  // result urls are already like /tech/16/. Do NOT prepend basePath() again
  // (that double-counts). Just strip any trailing index.html.
  return url.replace(/index\\.html$/, "")
}

async function runSearch(query, container) {
  if (!query) {
    container.innerHTML = ""
    return
  }
  const pf = await loadPagefind()
  const search = await pf.search(query)
  const results = await Promise.all(search.results.slice(0, 8).map((r) => r.data()))
  container.innerHTML = ""
  for (const d of results) {
    const item = document.createElement("a")
    item.className = "pf-result"
    item.href = resultUrl(d.url)
    const title = document.createElement("div")
    title.className = "pf-title"
    title.textContent = (d.meta && d.meta.title) || d.url
    const excerpt = document.createElement("div")
    excerpt.className = "pf-excerpt"
    excerpt.innerHTML = d.excerpt
    item.appendChild(title)
    item.appendChild(excerpt)
    container.appendChild(item)
  }
}

function debounce(fn, ms) {
  let t
  return function (...args) {
    clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), ms)
  }
}

function setupSearch() {
  const root = document.querySelector(".search")
  if (!root) return
  const button = root.querySelector(".search-button")
  const container = root.querySelector(".search-container")
  const input = root.querySelector(".search-bar")
  const results = root.querySelector(".pagefind-results")
  if (!button || !container || !input || !results) return

  function open() {
    container.classList.add("active")
    button.setAttribute("aria-expanded", "true")
    input.focus()
    loadPagefind()
  }
  function close() {
    container.classList.remove("active")
    button.setAttribute("aria-expanded", "false")
    input.value = ""
    results.innerHTML = ""
  }
  function toggle() {
    container.classList.contains("active") ? close() : open()
  }

  const onInput = debounce((e) => runSearch(e.target.value.trim(), results), 150)
  const onContainerClick = (e) => {
    if (e.target === container) close()
  }
  const onKeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      toggle()
    } else if (e.key === "Escape" && container.classList.contains("active")) {
      e.preventDefault()
      close()
    }
  }

  button.addEventListener("click", toggle)
  input.addEventListener("input", onInput)
  container.addEventListener("click", onContainerClick)
  document.addEventListener("keydown", onKeydown)

  // Quartz re-fires "nav" on every SPA navigation and micromorph reuses these
  // elements, so without cleanup each navigation stacks another set of
  // listeners. A doubled click handler makes toggle() run twice (open+close),
  // leaving the button unresponsive on any page reached via SPA nav. Register
  // removals so spa.inline tears them down before the next nav re-binds.
  window.addCleanup(() => {
    button.removeEventListener("click", toggle)
    input.removeEventListener("input", onInput)
    container.removeEventListener("click", onContainerClick)
    document.removeEventListener("keydown", onKeydown)
  })
}

if (SEARCH_ENABLED) {
  // Quartz's SPA dispatches "nav" on initial load (spa.inline runs after component
  // scripts), so binding via nav/render covers first paint too. Do NOT also call
  // setupSearch() directly here — that would double-bind the initial element's listeners.
  document.addEventListener("nav", setupSearch)
  document.addEventListener("render", setupSearch)
}
`

const PagefindSearch = (_opts) => {
  function PagefindSearchComponent({ displayClass }) {
    const classes = ["search", displayClass].filter(Boolean).join(" ")
    return h("div", { class: classes }, [
      h("button", { class: "search-button", "aria-label": "Search", "aria-expanded": "false" }, [
        h("p", {}, "Search"),
        h(
          "svg",
          {
            role: "img",
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 19.9 19.7",
          },
          [
            h("title", {}, "Search"),
            h("g", { class: "search-path", fill: "none" }, [
              h("path", { "stroke-linecap": "square", d: "M18.5 18.3l-5.4-5.4" }),
              h("circle", { cx: "8", cy: "8", r: "7" }),
            ]),
          ],
        ),
      ]),
      h("div", { class: "search-container" }, [
        h("div", { class: "search-space" }, [
          h("input", {
            autocomplete: "off",
            class: "search-bar",
            name: "search",
            type: "text",
            "aria-label": "Search for something...",
            placeholder: "Search for something...",
          }),
          h("div", { class: "pagefind-results" }),
        ]),
      ]),
    ])
  }

  PagefindSearchComponent.css = style
  PagefindSearchComponent.afterDOMLoaded = script
  return PagefindSearchComponent
}

export { PagefindSearch }
