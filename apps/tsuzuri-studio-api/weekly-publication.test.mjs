import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {archiveMetadata} from './src/archive-metadata.js';

test('archive dates use the event filename and Japan time, with calendar validation', () => {
  assert.deepEqual(archiveMetadata('第16回 9/12.m4a', '2026-09-11T22:19:01Z'), {title:'第16回 9/12',episodeNo:16,sourceDate:'2026-09-12'});
  assert.equal(archiveMetadata('EP17.mp4','2026-09-18T22:00:00Z').sourceDate,'2026-09-19');
  assert.equal(archiveMetadata('第20回 12/31.mp4','2027-01-01T00:00:00Z').sourceDate,'2026-12-31');
  assert.equal(archiveMetadata('第20回 2/30.mp4','2026-03-01T00:00:00Z').sourceDate,'2026-03-01');
  assert.equal(archiveMetadata('日付なし.mp4','invalid').sourceDate,'');
});

const articles = [
  {status:'published',content_type:'podcast',episode_no:16,title:'#16 更新したPodcast',media_url:'https://stand.fm/episodes/6aa47d67279752ae5dd1c9c7',source_published_at:'2026-09-12'},
  {status:'published',content_type:'archive',episode_no:16,title:'#16 更新したアーカイブ',media_url:'https://drive.google.com/file/d/1CyWRj2CwUuFJizNqo99iTyrZXyUuLdEo/view',source_published_at:'2026-09-12'},
  {status:'draft',content_type:'podcast',episode_no:17,title:'未公開の回',media_url:'https://stand.fm/episodes/draft17'},
];
async function page(file, script, data) {
  const dom = new JSDOM(readFileSync('projects/totonoe/'+file,'utf8'),{url:'https://local.test/projects/totonoe/'+file,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.fetch=async()=>({ok:true,json:async()=>({articles:data})});
  dom.window.matchMedia=()=>({matches:false,addEventListener(){}});
  dom.window.scrollTo=()=>{};
  dom.window.eval(readFileSync('projects/totonoe/'+script,'utf8'));
  await new Promise(resolve=>setTimeout(resolve,30));
  return dom;
}

test('published dashboard metadata replaces legacy cards without duplication; drafts stay hidden', async () => {
  const dom=await page('weekend-ai.html','service-content.js',articles);
  try {
    const d=dom.window.document;
    assert.equal(d.querySelectorAll('.pod-card').length,16);
    assert.equal(d.querySelectorAll('.archive-card').length,16);
    assert.match(d.querySelector('.pod-card').textContent,/更新したPodcast/);
    assert.match(d.querySelector('.archive-card').textContent,/更新したアーカイブ/);
    assert.equal(d.querySelector('.pod-card iframe').getAttribute('src'),'https://stand.fm/embed/episodes/6aa47d67279752ae5dd1c9c7');
    assert.doesNotMatch(d.body.textContent,/未公開の回/);
  } finally {dom.window.close();}
});

test('weekend page reflects edited and newly published episodes in descending order', async () => {
  const next={status:'published',content_type:'podcast',episode_no:17,title:'#17 次の回',media_url:'https://stand.fm/episodes/new17',source_published_at:'2026-09-19'};
  const dom=await page('weekend-ai.html','service-content.js',[...articles,next]);
  try {
    const cards=[...dom.window.document.querySelectorAll('.pod-card')];
    assert.equal(cards.length,17);
    assert.match(cards[0].textContent,/第17回/);
    assert.match(cards[1].textContent,/更新したPodcast/);
    assert.match(cards[2].textContent,/第15回/);
  } finally {dom.window.close();}
});

test('weekend page switches podcast and member-only archive with accessible buttons and deep links', () => {
  const html=readFileSync('projects/totonoe/weekend-ai.html','utf8');
  const script=readFileSync('projects/totonoe/weekend-media-tabs.js','utf8');
  const dom=new JSDOM(html,{url:'https://local.test/projects/totonoe/weekend-ai.html#archive',runScripts:'outside-only'});
  try {
    dom.window.requestAnimationFrame=callback=>callback();
    dom.window.eval(script);
    const d=dom.window.document;
    const podcastButton=d.getElementById('mediaTabPodcast');
    const archiveButton=d.getElementById('mediaTabArchive');
    assert.equal(archiveButton.getAttribute('aria-selected'),'true');
    assert.equal(d.getElementById('archive').hidden,false);
    assert.equal(d.getElementById('podcast').hidden,true);
    assert.match(d.getElementById('archive').textContent,/コメキャリ生のみ/);

    podcastButton.click();
    assert.equal(dom.window.location.hash,'#podcast');
    assert.equal(podcastButton.getAttribute('aria-selected'),'true');
    assert.equal(archiveButton.getAttribute('aria-selected'),'false');
    assert.equal(d.getElementById('podcast').hidden,false);
    assert.equal(d.getElementById('archive').hidden,true);
  } finally {dom.window.close();}
});

test('weekend page renders the published next-event thumbnail with the fixed signup link', async () => {
  const html=readFileSync('projects/totonoe/weekend-ai.html','utf8');
  const script=readFileSync('projects/totonoe/weekend-next-thumbnail.js','utf8');
  const dom=new JSDOM(html,{url:'https://basecraftas.com/projects/totonoe/weekend-ai.html',runScripts:'outside-only'});
  try {
    dom.window.fetch=async()=>({ok:true,json:async()=>({event:{hero_url:'https://basecraftas.com/column-media/weekend.png',updated_at:'2026-09-13 00:00:00'}})});
    dom.window.eval(script);await new Promise(resolve=>setTimeout(resolve,20));
    const d=dom.window.document,card=d.getElementById('weekendNextEvent');
    assert.equal(card.hidden,false);
    assert.equal(d.getElementById('weekendNextImage').src,'https://basecraftas.com/column-media/weekend.png');
    assert.equal(d.querySelector('.weekend-next-link').href,'https://therapis10.com/seminars/cmr5gtjs30be14do38qlsolpu');
  } finally {dom.window.close();}
});

test('weekend page keeps the standard thumbnail and guidance when no current event image is published', async () => {
  const dom=new JSDOM(readFileSync('projects/totonoe/weekend-ai.html','utf8'),{url:'https://basecraftas.com/projects/totonoe/weekend-ai.html',runScripts:'outside-only'});
  try {
    dom.window.fetch=async()=>({ok:true,json:async()=>({event:null})});
    dom.window.eval(readFileSync('projects/totonoe/weekend-next-thumbnail.js','utf8'));await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(dom.window.document.getElementById('weekendNextEvent').hidden,false);
    assert.match(dom.window.document.getElementById('weekendNextImage').src,/assets\/weekend-ai-default-thumbnail\.webp$/);
    assert.match(dom.window.document.getElementById('schedule').textContent,/毎週土曜 朝6:00/);
  } finally {dom.window.close();}
});

test('homepage shares seminar data, keeps the weekly event first and separates service readiness', async () => {
  const html=readFileSync('projects/totonoe/index.html','utf8');
  const script=readFileSync('projects/totonoe/seminars.js','utf8');
  for(const [date,expected] of [['2026-09-12T00:00:00+09:00',3],['2026-09-14T21:30:00+09:00',3],['2026-09-14T22:00:00+09:00',2],['2026-09-28T21:00:00+09:00',1]]) {
    const dom=new JSDOM(html,{url:'https://example.com/projects/totonoe/',runScripts:'outside-only'});
    try {
      dom.window.Date.now=()=>Date.parse(date);
      dom.window.fetch=async()=>({ok:true,json:async()=>({articles:[]})});
      dom.window.eval(script);
      await new Promise(resolve=>setTimeout(resolve,20));
      const d=dom.window.document;
      assert.equal(d.querySelectorAll('#semGrid .sem-card').length,expected,date);
      assert.ok(d.querySelector('#semGrid').firstElementChild.classList.contains('contents-recurring-card'));
      assert.match(d.querySelector('#semGrid img').src,/weekend-ai-default-thumbnail/);
      assert.equal(d.querySelector('#semEmpty').hidden,true);
      for(const name of ['たより｜TAYORI','いろは｜IROHA','法人研修','プロダクト']) assert.ok(d.querySelector('.home-services').textContent.includes(name));
      assert.equal(d.querySelectorAll('.home-coming').length,3);
      assert.equal(d.querySelectorAll('.home-coming a').length,0);
      assert.match(d.querySelector('.home-tayori').textContent,/お申し込みは準備中/);
      assert.equal(d.querySelectorAll('.home-learning-grid .home-learning').length,2);
      dom.window.eval(readFileSync('projects/totonoe/service-content.js','utf8'));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(d.querySelectorAll('#tsumamiLatest .contents-latest-item').length,3);
      dom.window.eval(readFileSync('projects/totonoe/home-learning-tabs.js','utf8'));
      assert.equal(d.querySelector('#home-panel-video').hidden,true);
      d.querySelector('#home-tab-video').click();
      assert.equal(d.querySelector('#home-panel-video').hidden,false);
      assert.equal(d.querySelector('#home-panel-column').hidden,true);
      d.querySelector('#home-tab-video').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
      assert.equal(d.querySelector('#home-panel-column').hidden,false);
      assert.equal(d.activeElement.id,'home-tab-column');
      assert.equal(d.querySelector('.home-media-links'),null);
      assert.ok(d.querySelector('.home-world-image[href="characters/"] img'));
      assert.equal(d.querySelector('.home-hero-copy'),null);
      assert.match(d.querySelector('#tsuzuriLatest').textContent,/公開記事を準備/);
    } finally {dom.window.close();}
  }
});

test('studio video edits replace existing cards and preserve the selected thumbnail; new TSUZURI articles appear', async () => {
  const baseline=await page('tsumami/index.html','service-content.js',[]);
  const videoCount=baseline.window.document.querySelectorAll('#tsumamiGrid .content-card-video').length;baseline.window.close();
  const generated=[
    {id:'video-edit',status:'published',content_type:'video',title:'更新された動画',media_url:'https://www.youtube.com/watch?v=8ubAUePSwY8',source_type:'video',source_id:'8ubAUePSwY8',hero_url:'https://example.com/custom.jpg'},
    {id:'new-column',slug:'new-column',status:'published',content_type:'column',title:'追加したつづり',excerpt:'つづり概要'},
    {id:'draft-video',status:'draft',content_type:'video',title:'未公開動画',media_url:'https://youtu.be/draft123456'},
  ];
  const dom=await page('tsumami/index.html','service-content.js',generated);
  try {
    const d=dom.window.document;
    const cards=[...d.querySelectorAll('#tsumamiGrid .content-card-video')];
    const edited=cards.filter(card=>card.textContent.includes('更新された動画'));
    assert.equal(cards.length,videoCount);assert.equal(edited.length,1);
    assert.equal(edited[0].querySelector('img').src,'https://example.com/custom.jpg');
    assert.doesNotMatch(d.body.textContent,/未公開動画/);
    edited[0].querySelector('button').click();
    assert.ok([...d.querySelectorAll('iframe')].some(frame=>frame.src.includes('youtube-nocookie.com/embed/8ubAUePSwY8')));
  } finally {dom.window.close();}
  const tsuzuri=await page('tsuzuri/index.html','service-content.js',generated);
  try { assert.match(tsuzuri.window.document.body.textContent,/追加したつづり/); }
  finally { tsuzuri.window.close(); }
});

test('seminar grids promote published weekly thumbnails and adapt to one, two or three events', async () => {
  for (const file of ['index.html','contents.html']) {
    for (const [hero, extra, columns] of [[null,0,'1'],['https://example.com/week.png',0,'2'],['https://example.com/week.png',3,'3'],[null,3,'3'],['javascript:alert(1)',0,'1']]) {
      const dom=new JSDOM(readFileSync('projects/totonoe/'+file,'utf8'),{url:'https://example.com/projects/totonoe/'+file,runScripts:'outside-only'});
      try {
        dom.window.Date.now=()=>Date.parse('2026-09-17T12:00:00+09:00');
        dom.window.fetch=async url=>({ok:true,json:async()=>String(url).includes('weekend-event') ? {event:hero?{hero_url:hero}:null} : {articles:Array.from({length:extra},(_,i)=>({status:'published',content_type:'seminar',title:'追加セミナー'+i,media_url:'https://example.com/seminar/'+i,source_published_at:'2026-10-01',hero_url:'https://example.com/thumb.png'}))}});
        dom.window.eval(readFileSync('projects/totonoe/seminars.js','utf8'));
        await new Promise(resolve=>setTimeout(resolve,20));
        const d=dom.window.document, grid=d.querySelector('#semGrid');
        assert.equal(grid.dataset.columns,columns);
        const promoted=!!hero&&hero.startsWith('https:');
        assert.equal(grid.firstElementChild.classList.contains('sem-weekly-featured'),promoted);
        assert.equal(grid.querySelectorAll('.sem-weekly-featured').length,promoted?1:0);
        if(file==='index.html') assert.ok(grid.querySelectorAll('.sem-card:not(.contents-recurring-card)').length<=3);
        if(promoted){
          assert.equal(grid.querySelector('img').src,hero);
          grid.querySelector('img').dispatchEvent(new dom.window.Event('error'));
          assert.ok(grid.firstElementChild.classList.contains('contents-recurring-card'));
          assert.match(grid.querySelector('img').src,/weekend-ai-default-thumbnail/);
        }
        if(file==='contents.html'){
          d.querySelector('[data-sem-status="past"]').click();
          assert.equal(grid.querySelector('.sem-weekly-featured,.contents-recurring-card'),null);
        }
      } finally {dom.window.close();}
    }
  }
});
