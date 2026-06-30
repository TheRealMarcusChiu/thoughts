// Site configuration. Loaded before the page renders and exposed as
// window.SITE_CONFIG. Copy config.js.example to config.js to get started,
// then edit the values below. (config.js may be git-ignored for private tweaks;
// config.js.example is the checked-in template.)
window.SITE_CONFIG = {
  // Big italic site title in the header.
  title: 'Mark the Thoughts',
  // One-line tagline under the title.
  tagline: 'Reflections, parables, and ramblings — collected here. Sort and filter, or click any post to read it.',
  // Giscus comments (GitHub Discussions). Fill these from https://giscus.app
  // (enable Discussions on the repo, install the giscus app, then copy the IDs).
  // Comments stay hidden until repo + repoId + categoryId are set.
  giscus: {
    enabled: true,              // set false to turn comments off site-wide
    repo: 'therealmarcuschiu/thoughts',          // e.g. 'marcuschiu/thoughts'
    repoId: 'R_kgDOS15zmg',                  // data-repo-id from giscus.app
    category: 'Announcements',   // discussion category name
    categoryId: 'DIC_kwDOS15zms4C-2nL',              // data-category-id from giscus.app
    mapping: 'specific',         // each article gets its own thread (keyed by slug)
    theme: 'dark',
  },
};
