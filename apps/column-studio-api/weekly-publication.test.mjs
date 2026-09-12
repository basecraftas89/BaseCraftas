import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  const dom=await page('contents.html','contents.js',articles);
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

test('homepage reflects edited and newly published episodes in descending order', async () => {
  const next={status:'published',content_type:'podcast',episode_no:17,title:'#17 次の回',media_url:'https://stand.fm/episodes/new17',source_published_at:'2026-09-19'};
  const dom=await page('index.html','latest-podcast.js',[...articles,next]);
  try {
    const cards=[...dom.window.document.querySelectorAll('.latest-podcast-card')];
    assert.equal(cards.length,3);
    assert.match(cards[0].textContent,/第17回/);
    assert.match(cards[1].textContent,/更新したPodcast/);
    assert.match(cards[2].textContent,/第15回/);
  } finally {dom.window.close();}
});
