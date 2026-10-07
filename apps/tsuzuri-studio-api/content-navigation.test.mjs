import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const read = name => readFileSync(`projects/totonoe/${name}`, 'utf8');

test('learning modes switch the visible content and support keyboard navigation', () => {
 const dom = new JSDOM(read('contents.html'), {runScripts:'outside-only'});
 try {
  const d = dom.window.document;
  dom.window.eval(read('content-learning-tabs.js'));
  const text = d.querySelector('#mode-tsuzuri'), video = d.querySelector('#mode-tsumami');
  assert.equal(d.querySelector('#panel-tsuzuri').hidden,false);
  assert.equal(d.querySelector('#panel-tsumami').hidden,true);
  video.click();
  assert.equal(d.querySelector('#panel-tsuzuri').hidden,true);
  assert.equal(d.querySelector('#panel-tsumami').hidden,false);
  assert.equal(video.getAttribute('aria-selected'),'true');
  assert.equal(text.tabIndex,-1);
  assert.equal(d.querySelector('#panel-tsumami .btn').getAttribute('href'),'tsumami/');
  video.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(d.activeElement,text);
  assert.equal(d.querySelector('#panel-tsuzuri').hidden,false);
  assert.equal(d.querySelector('#panel-tsuzuri .btn').getAttribute('href'),'tsuzuri/');
  assert.equal(d.querySelector('#podcast'),null);
  assert.equal(d.querySelector('.content-step-grid'),null);
  assert.ok(new JSDOM(read('weekend-ai.html')).window.document.querySelector('#podList'));
 } finally {dom.window.close();}
});

test('TAYORI application link remains usable when full, closed or status unavailable', async () => {
  for (const state of [{enabled:true,mode:'live',accepting:true,capacity_state:'available'}, {enabled:true,mode:'live',accepting:true,capacity_state:'full'}, {enabled:true,mode:'live',accepting:false}, null]) {
    const dom = new JSDOM(read('tayori.html'), {url:'https://example.com/projects/totonoe/tayori.html',runScripts:'outside-only'});
    try {
      dom.window.fetch = async () => {if(!state) throw new Error('offline'); return {ok:true,json:async()=>state};};
      dom.window.eval(read('waitlist.js'));
      await new Promise(resolve=>setTimeout(resolve,10));
      const d = dom.window.document;
      assert.equal(d.querySelector('[data-tayori-direct-signup]').hidden,false);
      assert.equal(d.querySelector('[data-tayori-footer-signup]').getAttribute('href'),'TAYORI/subscribe.html');
      assert.equal(d.querySelector('[data-waitlist-form]'),null);
      assert.equal(d.querySelector('.tayori-hero .btn-cta')?.getAttribute('href') || d.querySelector('a.btn-cta[href="TAYORI/subscribe.html"]').getAttribute('href'),'TAYORI/subscribe.html');
    } finally { dom.window.close(); }
  }
});

test('forthcoming service LPs never enter the public build; member pages remain available', () => {
  const d = new JSDOM(read('service.html')).window.document;
  assert.deepEqual([...d.querySelectorAll('.service-card h3')].map(x=>x.textContent), ['たより｜TAYORI','いろは｜IROHA','法人研修','プロダクト']);
  assert.equal(d.querySelectorAll('.is-coming-soon a').length,0);
  for (const name of ['IROHA/index.html','corporate.html','products.html']) {
    assert.equal(existsSync(`dist/projects/totonoe/${name}`),false,name);
    assert.equal(existsSync(`projects/totonoe/${name}`),true,name);
  }
  assert.equal(existsSync('dist/projects/totonoe/IROHA/dashboard.html'),true);
  const redirects=readFileSync('dist/_redirects','utf8');
  for(const route of ['IROHA','IROHA/','IROHA/index','IROHA/index.html','corporate','corporate.html','products','products.html']) {
    assert.ok(redirects.split('\n').some(line=>line.startsWith(`/projects/totonoe/${route} /projects/totonoe/service.html#`) && line.endsWith(' 302')),route);
  }
  const article = readFileSync('dist/projects/totonoe/tsuzuri/tsugumo-morning-call/index.html','utf8');
  const doc = new JSDOM(article).window.document;
  assert.ok(doc.querySelector('.nav-menu[aria-label="コンテンツメニュー"] a[href="../../tsuzuri/"]'));
  assert.equal(doc.querySelectorAll('.nav-menu[aria-label="サービスメニュー"] a').length,1);
});
