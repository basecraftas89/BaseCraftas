import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const slugs = [
  "tsugumo-morning-call",
  "hakuto-story-beyond-window",
  "mion-which-shadow",
  "three-characters-same-gift",
];

test("nested character stories resolve shared styles, scripts, navigation, and images from ToToNoE root", async () => {
  for (const slug of slugs) {
    const file = path.join(root, "dist/projects/totonoe/tsuzuri", slug, "index.html");
    const html = await readFile(file, "utf8");

    assert.match(html, /href="\.\.\/\.\.\/styles\.css\?/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/totonoe-logo\.png"/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/characters\/stories\//);
    assert.match(html, /src="\.\.\/\.\.\/common\.js\?/);
    assert.match(html, /src="\.\.\/\.\.\/article-actions\.js\?/);
    assert.match(html, /<p class="eyebrow">キャラクター \/ 2026-09-13<\/p>/);
    assert.match(html, /href="\.\.\/\.\.\/characters\/">← キャラクター一覧へ戻る<\/a>/);
    assert.doesNotMatch(html, /(?:href|src)="\.\.\/(?!\.\.\/)/);
  }
});

test("a direct site Worker deployment rebuilds generated character stories", async () => {
  const config = await readFile(path.join(root, "apps/site-worker/wrangler.toml"), "utf8");

  assert.match(config, /\[build\][\s\S]*command\s*=\s*"npm run build"/);
  assert.match(config, /\[build\][\s\S]*cwd\s*=\s*"\."/);
});
