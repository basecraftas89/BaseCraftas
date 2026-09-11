import {cp, mkdir, readdir, rm, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sanitizeBody,safeUrl,safeSourceId} from '../apps/column-studio-api/src/security.js';
import {articleHtml} from '../apps/column-studio-api/src/public-render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await build({entryPoints:[path.join(root,'apps/column-studio/security-entry.js')],bundle:true,format:'iife',platform:'browser',legalComments:'inline',minify:true,outfile:path.join(root,'apps/column-studio/security.js')});
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
const extensions = new Set(['.html','.css','.js','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.mp3','.mp4','.woff','.woff2']);
// Only these public trees can enter a deployment. Never traverse apps/API or tools.
const trees = ['css','js','images','services','projects','apps/column-studio'];
const blocked = /(?:^|\/)(?:node_modules|\.git|\.wrangler|\.pet-runs|scripts|tests?)(?:\/|$)|(?:\.test\.|security-entry\.js$)/;
const copied=[];
async function copyFile(relative) {
  await mkdir(path.dirname(path.join(out,relative)),{recursive:true});
  await cp(path.join(root,relative),path.join(out,relative));copied.push(relative);
}
async function walk(relative) {
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})) {
    const name=path.posix.join(relative,entry.name);
    if(entry.name.startsWith('.')||blocked.test(name)||entry.isSymbolicLink())continue;
    if(entry.isDirectory()){await walk(name);continue;}
    const publicJson=/^projects\/totonoe\/data\/(columns|contents)\/[a-z0-9-]+\.json$/.test(name);
    if(extensions.has(path.extname(name))||publicJson)await copyFile(name);
  }
}
for(const tree of trees)await walk(tree);
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(entry.isFile() && (entry.name.endsWith('.html')||['_headers','_redirects','robots.txt','sitemap.xml'].includes(entry.name)))await copyFile(entry.name);
}
// Public articles must not depend on Access-protected editor assets.
await cp(path.join(root,'apps/column-studio/assets/characters'),path.join(out,'projects/totonoe/assets/characters'),{recursive:true});
for(const file of copied.filter(file=>file.startsWith('projects/')&&/\.(html|json)$/.test(file))) {
  const dest=path.join(out,file);const text=await readFile(dest,'utf8');
  await writeFile(dest,text.replaceAll('../../../apps/column-studio/assets/characters/','../assets/characters/'));
}
await writeFile(path.join(out,'404.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><title>ページが見つかりません</title><h1>ページが見つかりません</h1><a href="/">ホームへ戻る</a></html>');
console.log(`Built ${copied.length} public files in dist; internal source, SQL, config, tests and reports excluded.`);

// Regenerate generated article documents from sanitized JSON, including previously
// published data. Static hand-authored site templates remain unchanged.
for(const file of copied.filter(file=>/^projects\/totonoe\/data\/contents\/[a-z0-9-]+\.json$/.test(file))) {
  const dest=path.join(out,file);const data=JSON.parse(await readFile(dest,'utf8'));
  const clean = item => ({...item,source_id:safeSourceId(item.source_id),url:safeUrl(item.url,true),body_html:sanitizeBody(item.body_html || ''),media_url:safeUrl(item.media_url),hero_url:safeUrl(item.hero_url,true),
    ...(item.external_link?{external_link:{...item.external_link,url:safeUrl(item.external_link.url),image:safeUrl(item.external_link.image)}}:{})});
  if(file.endsWith('/index.json')) {
    data.articles=(data.articles||[]).map(clean);await writeFile(dest,JSON.stringify(data,null,2)+'\n');
  }else{
    const article=clean(data);
    if(!/^[a-z0-9][a-z0-9-]*$/.test(article.slug)||!article.main_actor)throw new Error('Invalid published article: '+file);
    article.body_html=article.body_html.replaceAll('../../../apps/column-studio/assets/characters/','../assets/characters/');
    await writeFile(dest,JSON.stringify(article,null,2)+'\n');
    await mkdir(path.join(out,'projects/totonoe/contents'),{recursive:true});
    await writeFile(path.join(out,'projects/totonoe/contents',article.slug+'.html'),articleHtml(article));
  }
}
