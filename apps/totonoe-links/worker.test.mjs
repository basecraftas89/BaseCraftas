import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./worker.js";
import { memberXLink, xMembers } from "../../scripts/totonoe-campaign-link.mjs";

test("each member link preserves attribution and ignores supplied destinations", async () => {
  const aliases = ["kanto", "kajiwara", "kimura", "ito", "tsunashima", "kojima", "kaigaishi"];
  const guide = readFileSync(new URL("../../projects/totonoe/TEAM_X_OPERATIONS_GUIDE.md", import.meta.url), "utf8");
  assert.equal(aliases.length, xMembers.length);
  for (const [index, alias] of aliases.entries()) {
    const shortUrl = `https://basecraftas.com/go/${alias}`;
    assert.ok(guide.includes(shortUrl));
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(new Request(`${shortUrl}?url=https://example.com&utm_content=wrong`, { method }));
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), memberXLink(xMembers[index].id));
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
});

test("unknown paths and write methods are rejected", async () => {
  for (const path of ["/go/unknown", "/go/shindo", "/other", "/go/constructor"]) {
    assert.equal((await worker.fetch(new Request(`https://basecraftas.com${path}`))).status, 404);
  }
  assert.equal((await worker.fetch(new Request("https://basecraftas.com/go/kanto", { method: "POST" }))).status, 405);
});

test("new members use neutral SNS attribution and optional fixed media paths", async () => {
  const added = { kuroishi: "kuroishi-ryota", kaito: "kaito-taisho", nakagawa: "nakagawa-masahiro" };
  for (const [alias, id] of Object.entries(added)) {
    for (const source of ["sns", "instagram", "facebook", "line", "note", "x"]) {
      const suffix = source === "sns" ? "" : `/${source}`;
      const response = await worker.fetch(new Request(`https://basecraftas.com/go/${alias}${suffix}?utm_source=wrong&url=https://example.com`));
      assert.equal(response.status, 302);
      const url = new URL(response.headers.get("location"));
      assert.equal(url.origin, "https://basecraftas.com");
      assert.equal(url.searchParams.get("utm_source"), source);
      assert.equal(url.searchParams.get("utm_content"), id);
      assert.equal(url.searchParams.get("utm_campaign"), "totonoe_team");
      assert.equal(url.searchParams.get("utm_medium"), "organic_social");
    }
  }
  assert.equal((await worker.fetch(new Request("https://basecraftas.com/go/kanto/instagram"))).status, 302);
  for (const path of ["/go/kuroishi/unknown", "/go/kaito/x/extra", "/go/nakagawa/constructor"]) {
    assert.equal((await worker.fetch(new Request(`https://basecraftas.com${path}`))).status, 404);
  }
});
