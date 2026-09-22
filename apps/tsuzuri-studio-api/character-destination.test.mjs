import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const root=process.cwd();
const read=file=>readFileSync(resolve(root,file),'utf8');

test('character statement is stacked and its title has no forced line break',()=>{
  const dom=new JSDOM(read('projects/totonoe/characters/index.html'));
  const title=dom.window.document.getElementById('world-title');
  assert.equal(title.querySelector('br'),null);
  assert.equal(title.textContent.trim(),'AI時代だからこそ、自分の感覚を起点にする。');
  assert.match(read('projects/totonoe/characters/characters.css'),/\.world-grid\s*\{[^}]*display:\s*grid;[^}]*gap:/);
  assert.doesNotMatch(read('projects/totonoe/characters/characters.css'),/\.world-grid\s*\{[^}]*grid-template-columns/);
});

test('the four published character stories are Studio-ready and seeded without overwriting edits',()=>{
  const index=JSON.parse(read('projects/totonoe/data/contents/index.json'));
  const characterStories=index.articles.filter(article=>article.destination==='characters');
  assert.equal(characterStories.length,4);
  for(const article of characterStories){
    assert.equal(article.destination,'characters');
    assert.equal(article.category,'character-story');
    assert.ok(article.main_actor_id);
    assert.ok(article.url.endsWith('/'));
  }
  const sql=new DatabaseSync(':memory:');
  sql.exec(read('apps/tsuzuri-studio-api/schema.sql'));
  sql.exec(read('apps/tsuzuri-studio-api/migrations/20260921_character_studio_articles.sql'));
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM articles WHERE destination='characters' AND category='character-story'").get().n,4);
  sql.prepare("UPDATE articles SET title='Studio edit' WHERE id='character-story-mion-which-shadow'").run();
  sql.exec(read('apps/tsuzuri-studio-api/migrations/20260921_character_studio_articles.sql'));
  assert.equal(sql.prepare("SELECT title FROM articles WHERE id='character-story-mion-which-shadow'").get().title,'Studio edit');
});

test('character page renders the selected destination while TSUZURI excludes it',async()=>{
  const html=read('projects/totonoe/characters/index.html');
  const dom=new JSDOM(html,{url:'https://basecraftas.com/projects/totonoe/characters/',runScripts:'outside-only'});
  const index=JSON.parse(read('projects/totonoe/data/contents/index.json'));
  dom.window.fetch=async()=>({ok:true,json:async()=>index});
  dom.window.eval(read('projects/totonoe/characters/characters-content.js'));
  await new Promise(resolve=>setTimeout(resolve,0));
  const cards=dom.window.document.querySelectorAll('#characterStoriesGrid .story-card');
  assert.equal(cards.length,4);
  assert.match(cards[0].querySelector('a').getAttribute('href'),/^\.\.\/tsuzuri\/.+\/$/);
  assert.match(read('projects/totonoe/service-content.js'),/item\.destination !== 'characters'/);
});

test('Studio offers both destinations and the Worker preserves character actors and routes',()=>{
  const html=read('apps/tsuzuri-studio/index.html');
  const dom=new JSDOM(html);
  const destinations=Array.from(dom.window.document.querySelectorAll('#postDestination option')).map(option=>option.value);
  assert.deepEqual(destinations,['tsuzuri','characters']);
  const actors=Array.from(dom.window.document.querySelectorAll('#postMainActor option')).map(option=>option.value);
  for(const actor of ['mion','tsugumo','hakuto','mion-tsugumo-hakuto'])assert.ok(actors.includes(actor));
  const worker=read('apps/tsuzuri-studio-api/src/worker.js');
  assert.match(worker,/normalizeDestination\(article\.destination, article\.category\) === "characters" \? "\/" : "\.html"/);
  assert.match(worker,/articleHtml\(data\)\.replaceAll\('\="\.\.\/', '\="\.\.\/\.\.\/'\)/);
});
