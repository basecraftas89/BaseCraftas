import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:readFileSync(process.env.WORKER_TEST_PATH||'/private/tmp/tsuzuri-studio-security-worker/worker.js','utf8'),compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat'],bindings:{ALLOW_DEV_AUTH:'true'},d1Databases:['DB'],r2Buckets:['MEDIA']}));
try{
 const db=await mf.getD1Database('DB');
 const schema=readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8').replace(/^--.*$/gm,'');
 for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 await db.prepare("INSERT INTO members(id,email,role) VALUES('admin','runtime@example.com','admin')").run();
 const response=await mf.dispatchFetch('http://localhost/api/articles',{method:'POST',headers:{'content-type':'application/json','x-column-studio-dev-email':'runtime@example.com'},body:JSON.stringify({slug:'runtime-safe',title:'runtime',body_html:'<p>safe</p><img src=x onerror="alert(1)">',main_actor_id:'shindo-toshiki'})});
 assert.equal(response.status,201,await response.clone().text());
 const article=(await response.json()).article;
 assert.doesNotMatch(article.body_html,/onerror/);assert.match(article.body_html,/<p>safe<\/p>/);
 console.log('PASS: actual workerd runtime, bundled sanitizer, local D1 save and security headers');
}finally{await mf.dispose();}
