// Manifest fallback; the loader prefers package.json's `quartz` field.
export const manifest = {
  name: "pagefind-search",
  displayName: "Pagefind Search",
  description: "Pagefind-backed search modal for Quartz (replaces the bundled FlexSearch plugin).",
  version: "1.0.0",
  category: "component",
}

export { PagefindSearch } from "./components/index.js"
