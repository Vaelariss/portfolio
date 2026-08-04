/* IndexNow ping.
 *
 * Google ignores IndexNow. Bing does not — and Bing's index is what ChatGPT
 * search and Copilot read, so this is the cheapest route into the two AI
 * surfaces that actually cite sources. Everyone skips it because "Google
 * doesn't use it", which is exactly why it stays cheap.
 *
 * Run after a deploy:
 *     node tools/indexnow.mjs
 *     node tools/indexnow.mjs https://brickworkstudio.net/ada-accessibility-compliance
 *
 * With no arguments it submits every <loc> in sitemap.xml. With arguments it
 * submits only those URLs.
 *
 * The key file must stay reachable at https://brickworkstudio.net/<KEY>.txt and
 * must contain the key and nothing else — Bing fetches it to verify ownership
 * before accepting a submission. Deleting it silently kills every future ping.
 *
 * This is not wired to a deploy hook yet: the site is deployed manually and has
 * no git-linked build, so there is no post-deploy step to hang it on. Once the
 * site is git-linked to Netlify, run it from the build command instead of by
 * hand.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY = '667d8fe2e1e44e81a8f1666fee89d690';
const HOST = 'brickworkstudio.net';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function sitemapUrls() {
  const xml = await readFile(join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

const urlList = process.argv.slice(2).length ? process.argv.slice(2) : await sitemapUrls();

if (!urlList.length) {
  console.error('No URLs to submit.');
  process.exit(1);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
};

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

/* 200 and 202 both mean accepted. 403 means the key file is missing or does not
   match; 422 means a URL does not belong to the host. */
console.log(`IndexNow ${res.status} ${res.statusText} — ${urlList.length} URL(s)`);
for (const u of urlList) console.log(`  ${u}`);
if (!res.ok && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
