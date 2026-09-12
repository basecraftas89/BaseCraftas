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

test('homepage labels the section as seminars and shows only seminars that have not started', async () => {
  const html=readFileSync('projects/totonoe/index.html','utf8');
  const script=readFileSync('projects/totonoe/home-seminars.js','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'});
  try {
    const d=dom.window.document;
    const latest=d.querySelector('#latest');
    assert.equal(latest.querySelector('.content-strip-title').textContent,'セミナー');
    assert.equal(latest.querySelectorAll('.latest-visual-card').length,2);
    assert.doesNotMatch(latest.textContent,/ポッドキャスト|アーカイブ動画/);
    dom.window.TOTONOE_NOW=Date.parse('2026-09-12T00:00:00+09:00');
    dom.window.eval(script);
    assert.equal(latest.querySelectorAll('.latest-visual-card:not([hidden])').length,2);
    assert.equal(d.querySelectorAll('.service-content-grid .service-hub-card').length,4);
    for(const name of ['たより｜TAYORI','つづり｜TSUZURI','つまみ｜TSUMAMI','いろは｜IROHA'])assert.match(d.querySelector('.service-content-grid').textContent,new RegExp(name));
  } finally {dom.window.close();}

  const afterFirst=new JSDOM(html,{runScripts:'outside-only'});
  try {
    afterFirst.window.TOTONOE_NOW=Date.parse('2026-09-14T21:00:00+09:00');
    afterFirst.window.eval(script);
    const visible=[...afterFirst.window.document.querySelectorAll('#latest .latest-visual-card:not([hidden])')];
    assert.equal(visible.length,1);
    assert.match(visible[0].textContent,/2026\.09\.28/);
  } finally {afterFirst.window.close();}

  const afterAll=new JSDOM(html,{runScripts:'outside-only'});
  try {
    afterAll.window.TOTONOE_NOW=Date.parse('2026-09-28T20:00:00+09:00');
    afterAll.window.eval(script);
    assert.equal(afterAll.window.document.querySelectorAll('#latest .latest-visual-card:not([hidden])').length,0);
    assert.equal(afterAll.window.document.querySelector('#latestSeminarEmpty').hidden,false);
  } finally {afterAll.window.close();}
  for(const slug of ['ai-yohaku','weekend-cycle','team-learning'])assert.equal(existsSync(`projects/totonoe/tsuzuri/${slug}.html`),false);
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
