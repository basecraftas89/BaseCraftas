import sharp from "sharp";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assetDir = join(root, "projects", "totonoe", "assets");
const width = 1200;
const height = 900;
const font = "Hiragino Kaku Gothic ProN, Hiragino Sans, sans-serif";

// Source backgrounds are image-generated, without copy. All Japanese copy and
// button geometry are composed deterministically so the published text is exact.
const banners = [
  {
    id: "01", label: "READ", source: "tayori-problem-banner-source-01-v1.webp",
    output: "tayori-problem-banner-01-v1.webp",
    problem: "情報が多くて、追いきれない。",
    answer: "大切な話題を、ひとつに。",
  },
  {
    id: "02", label: "WATCH", source: "tayori-problem-banner-source-02-v1.webp",
    output: "tayori-problem-banner-02-v1.webp",
    problem: "仕事でどう使うか、迷う。",
    answer: "短い解説から、一歩へ。",
  },
  {
    id: "03", label: "ASK", source: "tayori-problem-banner-source-03-v1.webp",
    output: "tayori-problem-banner-03-v1.webp",
    problem: "疑問が残って、先に進めない。",
    answer: "似た質問から、ヒントを。",
  },
];

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function overlay({ id, label, problem, answer }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#224436" flood-opacity=".2"/></filter>
      <linearGradient id="button" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d97745"/><stop offset="1" stop-color="#c75b31"/></linearGradient>
    </defs>
    <rect x="42" y="42" width="1116" height="440" rx="42" fill="#fffdf5" fill-opacity=".97" stroke="#d9e0d3" stroke-width="3" filter="url(#shadow)"/>
    <path d="M1045 82c41 5 57 32 59 70M1072 108c-24-2-40 4-48 23 22 8 40 4 48-23Zm20 23c-13 6-19 20-16 38 20-5 27-18 16-38Z" fill="#a7b49a" stroke="#a7b49a" stroke-width="4" opacity=".82"/>
    <text x="94" y="126" fill="#a36c4d" font-family="${font}" font-weight="700" font-size="36" letter-spacing="4">${id} / ${label}</text>
    <text x="94" y="207" fill="#274b3d" font-family="${font}" font-weight="700" font-size="47">${escapeXml(problem)}</text>
    <text x="94" y="296" fill="#164d39" font-family="${font}" font-weight="800" font-size="64">${escapeXml(answer)}</text>
    <rect x="90" y="340" width="1020" height="101" rx="51" fill="url(#button)" filter="url(#shadow)"/>
    <text x="566" y="405" text-anchor="middle" fill="#fffdf7" font-family="${font}" font-weight="800" font-size="45">会員画面の見本を見る</text>
    <path d="m1039 378 20 14-20 14" fill="none" stroke="#fffdf7" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

for (const banner of banners) {
  const source = join(assetDir, banner.source);
  const output = join(assetDir, banner.output);
  await sharp(source).resize(width, height, { fit: "cover" })
    .composite([{ input: overlay(banner), top: 0, left: 0 }])
    .webp({ quality: 86, effort: 6 }).toFile(output);
  console.log(output);
}
