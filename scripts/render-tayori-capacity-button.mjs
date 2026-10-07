// Exact typography over original ImageGen artwork; no external network calls.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const art = await readFile(resolve(root, 'outputs/tayori-signup-20260930/capacity-button-artwork-v1.png'));
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page = await browser.newPage({viewport:{width:960,height:240},deviceScaleFactor:1});
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:transparent}.button{position:relative;width:960px;height:240px;overflow:hidden;border-radius:44px;background:#164d36;color:#fff9e8;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Sans",sans-serif;font-weight:800}.art{position:absolute;width:960px;height:360px;top:-60px;left:0}.label{position:relative;display:flex;align-items:baseline;gap:12px;font-size:46px;margin-left:14px}.label strong{font-size:112px;letter-spacing:-4px;margin-right:4px}</style><div class="button"><img class="art" src="data:image/png;base64,${art.toString('base64')}" alt=""><span class="label">土日合計<strong>10</strong>名まで</span></div>`);
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:resolve(root,'projects/totonoe/assets/tayori-signup-capacity-button-v2.png'),omitBackground:true});
} finally { await browser.close(); }
