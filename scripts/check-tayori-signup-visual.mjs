// Local-only visual QA. All signup API responses are mocked; no email or Stripe calls.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const artifacts = process.argv[2];
const slideOutput = process.argv[3];
if (!artifacts || !slideOutput) throw new Error('Provide QA artifact directory and final slide output path');
await mkdir(artifacts, { recursive: true });
let accepting = true;
let capacityState = 'available';
let checkoutError = 'tayori_capacity_pending';
let waitlistSubmissions = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    res.setHeader('content-type','application/json');
    if (path.endsWith('tayori-enrollment-status')) return res.end(JSON.stringify({enabled:true,mode:'live',weekend_only:true,accepting,capacity_state:capacityState,weekend_limit:10,next_open_at:'2026-10-02T21:30:00Z'}));
    if (path.endsWith('/waitlist')) {waitlistSubmissions++;res.statusCode=201;return res.end('{"ok":true}');}
    if (path.endsWith('request-code')) {res.statusCode=202;return res.end('{}');}
    if (path.endsWith('verify-code')) return res.end('{}');
    res.statusCode=429;return res.end(JSON.stringify({error:checkoutError}));
  }
  const file=resolve(root, '.' + decodeURIComponent(path));
  if (!file.startsWith(root+'/')) {res.statusCode=403;return res.end();}
  try {
    res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'})[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url=`http://127.0.0.1:${server.address().port}/projects/totonoe/TAYORI/subscribe.html`;
  await page.goto(url);await page.locator('#emailForm:not([hidden])').waitFor();
  await page.locator('.enrollment-visual').evaluate(img=>img.decode());
  await page.locator('.capacity-button img').evaluate(img=>img.decode());
  assert.equal(await page.getByText('契約のお申し込みが完了した方をカウント',{exact:true}).count(),0);
  await page.screenshot({path:resolve(artifacts,'desktop.png'),fullPage:true});
  await page.locator('.enrollment-slide').screenshot({path:slideOutput});
  assert.equal(await page.locator('.billing-note').isVisible(),true);
  assert.equal(await page.locator('.enrollment-details').getAttribute('open'),null);
  for (const width of [320,375,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    const sizes=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,
      slide:document.querySelector('.enrollment-slide').getBoundingClientRect().toJSON(),
      schedule:document.querySelector('.schedule').getBoundingClientRect().toJSON(),
      lastTime:document.querySelector('.schedule>div:last-child strong').getBoundingClientRect().toJSON()}));
    assert.ok(sizes.content<=sizes.viewport,`horizontal overflow at ${width}: ${JSON.stringify(sizes)}`);
    assert.ok(sizes.schedule.right<=sizes.slide.right,`schedule exceeds card at ${width}`);
    assert.ok(sizes.lastTime.right<=sizes.slide.right-12,`time is clipped at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  // Fresh surface avoids Chrome screenshot tiling artifacts after repeated resizes.
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await mobile.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await mobile.goto(url);await mobile.locator('.enrollment-visual').evaluate(img=>img.decode());
  await mobile.screenshot({path:resolve(artifacts,'mobile.png'),fullPage:true});
  await mobile.close();
  await page.locator('#emailForm input').fill('local-test@example.com');
  await page.locator('#emailForm button').click();
  await page.locator('#codeForm input').fill('123456');
  await page.locator('#codeForm button[type=submit]').click();
  await page.locator('#checkoutForm input').check();
  await page.locator('#checkoutForm button').click();
  await page.getByText('現在、残りの枠は決済中の方が仮確保しています。',{exact:false}).waitFor();
  await page.locator('#capacityButton').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#capacityButton').getAttribute('aria-expanded')==='true');
  assert.equal(await page.locator('.enrollment-details ul').isVisible(),true);
  assert.equal(await page.locator('.enrollment-details summary').evaluate(el=>el===document.activeElement),true);
  await page.locator('.enrollment-details summary').click();
  await page.waitForFunction(()=>document.querySelector('#capacityButton').getAttribute('aria-expanded')==='false');
  await page.locator('.enrollment-details summary').click();
  assert.equal(await page.locator('.enrollment-details ul').isVisible(),true);
  assert.equal(await page.locator('#waitlistPanel').isVisible(),true);
  assert.equal(await page.locator('#checkoutForm').isVisible(),false);
  capacityState='full';await page.reload();
  await page.getByText('今週末の10名枠は満席になりました。',{exact:false}).waitFor();
  assert.equal(await page.locator('#emailForm').isVisible(),false);
  assert.equal(await page.locator('#waitlistPanel').isVisible(),true);
  await page.screenshot({path:resolve(artifacts,'full-mobile.png'),fullPage:true});
  await page.locator('#waitlistPanel input[name=email]').fill('waitlist-test@example.com');
  await page.locator('#waitlistPanel input[name=privacy_consent]').check();
  await page.locator('#waitlistPanel button[type=submit]').click();
  await page.getByText('ウェイトリストに登録しました。',{exact:false}).waitFor();
  assert.equal(waitlistSubmissions,1);
  capacityState='available';checkoutError='tayori_daily_limit_reached';await page.reload();
  await page.locator('#emailForm input').fill('race-test@example.com');
  await page.locator('#emailForm button').click();
  await page.locator('#codeForm input').fill('123456');
  await page.locator('#codeForm button[type=submit]').click();
  await page.locator('#checkoutForm input').check();
  await page.locator('#checkoutForm button').click();
  await page.getByText('今週末の10名枠は満席になりました。',{exact:false}).waitFor();
  assert.equal(await page.locator('#checkoutForm').isVisible(),false);
  assert.equal(await page.locator('#waitlistPanel input[name=email]').inputValue(),'race-test@example.com');
  accepting=false;await page.reload();
  await page.getByText('現在は受付時間外です。',{exact:false}).waitFor();
  assert.equal(await page.locator('#emailForm').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: 5 responsive widths; mocked signup steps; pending capacity; weekday closure; no real email/payment');
  console.log(`Slide: ${slideOutput}`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
