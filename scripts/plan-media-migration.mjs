// Offline only. Build a reviewable SQL plan from actual public JSON + a D1
// snapshot. Never infer public media from current draft body or upload ownership.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
import {sanitizeBody,safeUrl} from '../apps/column-studio-api/src/security.js';
const [snapshotFile,publicDirectory,outputFile]=process.argv.slice(2);
if(!snapshotFile||!publicDirectory||!outputFile)throw new Error('Usage: node scripts/plan-media-migration.mjs snapshot.json published-json-directory /private/tmp/media-plan.sql');
const output=resolve(outputFile),root=resolve('.');
if(output===root||output.startsWith(root+'/'))throw new Error('Save the migration plan outside the site repository.');
const snapshot=JSON.parse(await readFile(snapshotFile,'utf8'));
if(!Array.isArray(snapshot.articles)||!Array.isArray(snapshot.assets))throw new Error('snapshot.json must contain articles and assets arrays');
const sql=[],issues=[];const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
for(const name of await readdir(publicDirectory)){
 if(name==='index.json'||!name.endsWith('.json'))continue;
 const published=JSON.parse(await readFile(join(publicDirectory,name),'utf8'));
 const article=snapshot.articles.find(a=>a.id===published.id&&a.status==='published'&&!a.deleted_at);
 if(!article){issues.push(name+': no active published article');continue;}
 const dom=new JSDOM(sanitizeBody(published.body_html));
 const urls=[safeUrl(published.hero_url,true),...Array.from(dom.window.document.querySelectorAll('img[src]'),img=>img.getAttribute('src'))];dom.window.close();
 for(const raw of new Set(urls.filter(Boolean))){
  const url=new URL(raw,'https://basecraftas.com');if(url.hostname!=='basecraftas.com'||!url.pathname.startsWith('/column-media/'))continue;
  const key=decodeURIComponent(url.pathname.slice('/column-media/'.length));
  const asset=snapshot.assets.find(a=>a.r2_key===key);
  if(!asset||!['image/png','image/jpeg','image/webp','image/gif'].includes(asset.content_type)){issues.push(name+': missing/unsupported asset '+key);continue;}
  if(asset.article_id&&asset.article_id!==article.id){issues.push(name+': shared image requires explicit duplication '+key);continue;}
  sql.push(`UPDATE article_assets SET article_id = ${quote(article.id)} WHERE r2_key = ${quote(key)} AND article_id IS NULL;`);
  sql.push(`INSERT OR IGNORE INTO article_public_assets(article_id,r2_key) SELECT ${quote(article.id)},${quote(key)} WHERE EXISTS (SELECT 1 FROM articles WHERE id=${quote(article.id)} AND status='published' AND deleted_at IS NULL);`);
 }
}
await writeFile(output,`-- Review only. Apply after 20260911_security.sql; freeze editing while snapshotting/applying.\n-- ${issues.length} unresolved items; see companion JSON.\n`+[...new Set(sql)].join('\n')+'\n',{mode:0o600});
await writeFile(output+'.issues.json',JSON.stringify(issues,null,2)+'\n',{mode:0o600});
console.log(`Created SQL plan; ${issues.length} unresolved. No remote operations performed.`);
