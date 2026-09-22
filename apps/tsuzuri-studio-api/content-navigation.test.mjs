import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const read = name => readFileSync(`projects/totonoe/${name}`, 'utf8');

test('content tabs, upcoming default and independent newest-three sidebars', async () => {
  const dom = new JSDOM(read('contents.html'), {url:'https://example.com/projects/totonoe/contents.html', runScripts:'outside-only', pretendToBeVisual:true});
  try {
    const {document:d} = dom.window;
    dom.window.Date.now = () => Date.parse('2026-09-17T12:00:00+09:00');
    dom.window.localStorage.setItem('wa_seminars_status_v1','past');
    dom.window.localStorage.setItem('wa_seminars_tag_v1','座談会');
    dom.window.localStorage.setItem('wa_tsuzuri_order_v1','oldest');
    dom.window.localStorage.setItem('wa_tsumami_order_v1','oldest');
    const articles = [1,4,2,3].flatMap(i=>[
      {status:'published',content_type:'column',title:'記事'+i,url:'tsuzuri/article-'+i+'.html',published_at:'2026-09-0'+i},
      {status:'published',content_type:'learning',title:'資料'+i,media_url:'https://example.com/file-'+i,published_at:'2026-09-0'+i}
    ]);
    articles.push({status:'published',content_type:'column',destination:'characters',title:'キャラクターの物語',published_at:'2026-09-16'});
    articles.push({status:'draft',content_type:'column',title:'未公開の記事',published_at:'2026-09-16'});
    dom.window.fetch = async () => ({ok:true,json:async()=>({articles})});
    dom.window.eval(read('service-content.js'));
    dom.window.eval(read('seminars.js'));
    dom.window.eval(read('contents-tabs.js'));
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual([...d.querySelectorAll('[role="tab"]')].map(x=>x.textContent), ['セミナー','ポッドキャスト','アーカイブ']);
    assert.equal(d.querySelector('#seminars').hidden,false);
    assert.equal(d.querySelector('#podcast').hidden,true);
    assert.equal(d.querySelector('#archive').hidden,true);
    assert.equal(d.querySelector('#semStatusFilter .active').dataset.semStatus,'upcoming');
    assert.equal(d.querySelectorAll('#semGrid .is-past').length,0);
    assert.equal(d.querySelector('#semGrid').children.length,2);
    assert.ok(d.querySelector('#semGrid').firstElementChild.classList.contains('contents-recurring-card'));
    assert.match(d.querySelector('#semGrid img').getAttribute('src'),/weekend-ai-default-thumbnail/);
    assert.equal(d.querySelector('#tsuzuri-heading').textContent,'つづりTSUZURI');
    assert.equal(d.querySelector('#tsumami-heading').textContent,'つまみTSUMAMI');
    d.querySelector('[data-sem-status="past"]').click();
    assert.equal(d.querySelectorAll('#semGrid .contents-recurring-card').length,0);
    d.querySelector('[data-sem-status="upcoming"]').click();
    d.querySelector('[data-sem-tag="座談会"]').click();
    assert.equal(d.querySelector('#semGrid').children.length,1);
    assert.ok(d.querySelector('#semGrid').firstElementChild.classList.contains('contents-recurring-card'));
    d.querySelector('[data-sem-tag="all"]').click();
    for(const name of ['tsuzuri','tsumami']) {
      assert.deepEqual([...d.querySelectorAll('#'+name+'Latest strong')].map(x=>x.textContent),[4,3,2].map(i=>(name==='tsuzuri'?'記事':'資料')+i));
    }
    d.querySelector('#tab-podcast').click();
    assert.equal(d.querySelector('#podcast').hidden,false);
    assert.equal(d.querySelector('#seminars').hidden,true);
    d.querySelector('#tab-podcast').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.equal(d.activeElement.id,'tab-archive');
    assert.equal(d.querySelector('#archive').hidden,false);
    assert.equal(dom.window.location.hash,'#archive');
    assert.ok(d.querySelectorAll('#archiveGrid .archive-card').length > 0);
    assert.ok(d.querySelector('#podList').children.length > 0);
    d.querySelector('#archiveGrid button').click();
    assert.equal(d.querySelector('#cvModal').getAttribute('aria-hidden'),'false');
    d.querySelector('#cvModalClose').click();
    assert.equal(d.querySelector('#cvModal').getAttribute('aria-hidden'),'true');
    d.querySelector('#tab-seminars').click();
    d.querySelector('[data-sem-status="all"]').click();
    assert.ok(d.querySelectorAll('#semGrid .is-past').length > 0);
    d.querySelector('#semGrid .sem-detail').click();
    assert.equal(d.querySelector('#semModal').getAttribute('aria-hidden'),'false');
    dom.window.location.hash='#podcast';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    assert.equal(d.querySelector('#podcast').hidden,false);
  } finally {dom.window.close();}
});

test('empty published article feed shows an honest sidebar empty state', async () => {
  const dom = new JSDOM(read('contents.html'), {url:'https://example.com/projects/totonoe/contents.html#archive',runScripts:'outside-only',pretendToBeVisual:true});
  try {
    dom.window.fetch = async () => ({ok:true,json:async()=>({articles:[]})});
    dom.window.eval(read('service-content.js'));
    dom.window.eval(read('contents-tabs.js'));
    await new Promise(resolve=>setTimeout(resolve,30));
    const d=dom.window.document;
    assert.match(d.querySelector('#tsuzuriLatest').textContent,/公開記事を準備/);
    assert.equal(d.querySelectorAll('#tsumamiLatest .contents-latest-item').length,0);
    assert.match(d.querySelector('#tsumamiLatest').textContent,/公開動画を準備/);
    assert.equal(d.querySelector('#archive').hidden,false);
  } finally {dom.window.close();}
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
