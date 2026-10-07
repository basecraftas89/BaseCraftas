import sharp from "sharp";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = join(root, "projects", "totonoe", "assets");
const master = join(assets, "tayori-one-step-trio-master-v1.png");
const font = "'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP',sans-serif";

function base(w, h, artX, artY, artW) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="paper" x2="1" y2="1"><stop stop-color="#f7fbf8"/><stop offset="1" stop-color="#e3f0e7"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#fff9dc" stop-opacity=".9"/><stop offset="1" stop-color="#fff9dc" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#paper)"/>
  <circle cx="${artX + artW / 2}" cy="${artY + artW / 3}" r="${artW * .55}" fill="url(#halo)"/>
  <path d="M0 ${h - 24} Q${w / 2} ${h - 70} ${w} ${h - 24}" fill="none" stroke="#c8ded0" stroke-width="3" opacity=".65"/>
  <image x="${artX}" y="${artY}" width="${artW}" height="${artW * 2 / 3}" xlink:href="data:image/png;base64,ART"/>
  CONTENT
  </svg>`;
}

const desktopCopy = `<g font-family="${font}">
  <text x="95" y="84" fill="#2c7656" font-size="29" font-weight="700">TAYORIで、今週の一歩を。</text>
  <text x="95" y="184" fill="#073c2d" font-size="72" font-weight="800">気になった話題を、</text>
  <text x="95" y="276" fill="#073c2d" font-size="82" font-weight="800">ひとつだけ。</text>
  <text x="99" y="354" fill="#2b664c" font-size="29" font-weight="500">読んで、観て、問いかけて。</text>
  <text x="99" y="399" fill="#2b664c" font-size="29" font-weight="500">仕事で試したいことを、自分で選ぶ。</text>
  <rect x="95" y="450" width="645" height="104" rx="29" fill="#0a513a"/>
  <text x="128" y="518" fill="#fff" font-size="35" font-weight="700">届く資料と会員画面を見る</text>
  <text x="681" y="519" fill="#fff" font-size="43" font-weight="700">→</text>
</g>`;

const mobileCopy = `<g font-family="${font}">
  <text x="75" y="614" fill="#2c7656" font-size="31" font-weight="700">TAYORIで、今週の一歩を。</text>
  <text x="75" y="715" fill="#073c2d" font-size="70" font-weight="800">気になった話題を、</text>
  <text x="75" y="805" fill="#073c2d" font-size="83" font-weight="800">ひとつだけ。</text>
  <text x="79" y="866" fill="#2b664c" font-size="29" font-weight="500">読んで、観て、問いかけて。</text>
  <text x="79" y="909" fill="#2b664c" font-size="29" font-weight="500">仕事で試したいことを、自分で選ぶ。</text>
  <rect x="70" y="966" width="760" height="105" rx="29" fill="#0a513a"/>
  <text x="102" y="1036" fill="#fff" font-size="38" font-weight="700">届く資料と会員画面を見る</text>
  <text x="758" y="1037" fill="#fff" font-size="44" font-weight="700">→</text>
</g>`;

async function render(name, w, h, artX, artY, artW, copy) {
  const art = await sharp(master).resize({ width: artW }).png().toBuffer();
  const svg = base(w, h, artX, artY, artW)
    .replace("ART", art.toString("base64"))
    .replace("CONTENT", copy);
  const output = join(assets, name);
  await sharp(Buffer.from(svg)).webp({ quality: 82, effort: 6 }).toFile(output);
  const { width, height } = await sharp(output).metadata();
  if (width !== w || height !== h) throw new Error(`Invalid dimensions: ${output}`);
  console.log(`${output}: ${width}x${height}`);
}

await render("tayori-one-step-trio-desktop-v1.webp", 1600, 620, 735, 5, 840, desktopCopy);
await render("tayori-one-step-trio-mobile-v1.webp", 900, 1120, 38, 0, 824, mobileCopy);
