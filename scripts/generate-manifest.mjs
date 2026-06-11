#!/usr/bin/env node
// Regenerates articles/manifest.js + each sibling index.js by scanning articles/.
//   node scripts/generate-manifest.mjs
import { regenerate } from './lib/manifest.mjs';

const { posts, bodies } = await regenerate();
console.log(`Wrote ${posts} post(s) to articles/manifest.js`);
console.log(`Wrote ${bodies} article body file(s) (sibling .js next to each .md)`);
