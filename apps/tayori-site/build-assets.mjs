import { cp, mkdir, writeFile } from "node:fs/promises";
import {weekendMediaData} from './weekend-media-data.mjs';
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = join(root, "projects", "totonoe");
const output = join(root, "dist-tayori", "projects", "totonoe");

await mkdir(output, { recursive: true });
// Scoped LP release: preserve the last built member assets, including IROHA's
// shared account page, while replacing only this landing page and its artwork.
if (process.env.TAYORI_LP_ONLY === "1") {
  for (const name of ["tayori.html", "tayori-pricing.css", "waitlist.js", "contents.html", "contents-page.css", "content-learning-tabs.js", "service-content.js"]) {
    await cp(join(source, name), join(output, name));
  }
  await mkdir(join(output, "assets"), { recursive: true });
  for (const name of [
    "content-world-hero-v1.png", "content-world-questions-v1.png", "content-world-next-v1.png", "content-learning-paths-v1.png", "service-tsuzuri-home.webp", "service-tsumami-home.webp", "content-button-podcast-v1.png", "content-button-tsuzuri-v1.png", "content-button-tsumami-v1.png",
    "tayori-story-01-v1.webp", "tayori-story-02-v1.webp", "tayori-story-03-v1.webp",
    "tayori-problem-tsugumo-v1.webp",
    "tayori-problem-banner-01-v1.webp", "tayori-problem-banner-02-v1.webp", "tayori-problem-banner-03-v1.webp",
    "tayori-problem-01-square-v2.webp", "tayori-problem-02-square-v2.webp", "tayori-problem-03-square-v2.webp",
    "tayori-one-step-trio-desktop-v1.webp", "tayori-one-step-trio-mobile-v1.webp",
    "tayori-trial-cta-v1.webp", "tayori-trial-cta-mobile-v1.webp",
  ]) {
    await cp(join(source, "assets", name), join(output, "assets", name));
  }
  // The current site Worker directs member login to this stable asset path.
  await mkdir(join(output, "TAYORI"), { recursive: true });
  for (const name of ["login-20261001.html", "login-20261001.js"]) {
    await cp(join(source, "TAYORI", name), join(output, "TAYORI", name));
  }
  process.exit(0);
}
for (const name of ["tayori.html", "tayori-pricing.css", "tayori-checkout.js", "waitlist.js", "seminars.js", "contents.html", "contents-page.css", "content-learning-tabs.js", "service-content.js"]) {
  await cp(join(source, name), join(output, name));
}
await mkdir(join(output, "TAYORI"), { recursive: true });
for (const name of [
  "checkout-complete.html", "index.html", "login.html", "login-20261001.html", "login.js", "login-20261001.js",
  "subscribe.css", "subscribe.html", "subscribe.js", "weekly-member.css", "weekly-member.js",
  "weekend-media.js", "weekend-media.css",
]) {
  await cp(join(source, "TAYORI", name), join(output, "TAYORI", name));
}
await mkdir(join(output, 'TAYORI', 'assets'), {recursive: true});
for (const name of ['archive-button.png', 'podcast-button.png']) await cp(join(source, 'TAYORI', 'assets', name), join(output, 'TAYORI', 'assets', name));
await writeFile(join(output,'TAYORI','weekend-media.json'),JSON.stringify(await weekendMediaData()));

// Shared account management only: do not publish the IROHA landing page or lessons.
await mkdir(join(output, "IROHA"), { recursive: true });
for (const name of ["mypage.html", "mypage.js", "member-shell.js", "curriculum.css"]) {
  await cp(join(source, "IROHA", name), join(output, "IROHA", name));
}

await mkdir(join(output, "assets"), { recursive: true });
for (const name of [
  "content-world-hero-v1.png", "content-world-questions-v1.png", "content-world-next-v1.png", "content-learning-paths-v1.png", "service-tsuzuri-home.webp", "service-tsumami-home.webp", "content-button-podcast-v1.png", "content-button-tsuzuri-v1.png", "content-button-tsumami-v1.png",
  "totonoe-tayori-benefits-v4.webp",
  "tayori-benefit-05.webp", "tayori-benefit-06.webp",
  "tayori-guide-priority-question-v1.png", "tayori-guide-answer-videos-v1.png",
  "tayori-guide-backnumbers-v1.png", "tayori-guide-seminars-v2.png",
  "tayori-signup-weekend-illustration-v1.png",
  "tayori-signup-capacity-button-v1.png",
  "tayori-signup-capacity-button-v2.png",
  "tayori-problem-banner-01-v1.webp", "tayori-problem-banner-02-v1.webp", "tayori-problem-banner-03-v1.webp",
  "tayori-problem-01-square-v2.webp", "tayori-problem-02-square-v2.webp", "tayori-problem-03-square-v2.webp",
  "tayori-one-step-trio-desktop-v1.webp", "tayori-one-step-trio-mobile-v1.webp",
  "seminar-2026-10-19-codex-intro.jpg", "seminar-2026-09-28-chatgpt-work.jpg",
  "seminar-2026-09-14-ai-zadankai-daily.jpg", "seminar-2026-09-07-ai-zadankai-work.jpg",
  "seminar-2026-08-10-ai-literacy.jpg", "seminar-2026-08-17-grok-x-branding.jpg",
]) {
  await cp(join(source, "assets", name), join(output, "assets", name));
}
