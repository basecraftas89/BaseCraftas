import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
import {loadWorker} from './test-support.mjs';
import {sanitizeBody,safeUrl,requestGuard} from './src/security.js';
const worker=await loadWorker();
function fixture() {
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('apps/column-studio-api/schema.sql','utf8'));
 sql.exec("INSERT INTO members(id,email,role) VALUES('admin','admin@example.com','admin'),('editor','editor@example.com','editor'),('viewer','viewer@example.com','viewer')");
 function prepare(query) {let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}};}
 const objects=new Map();
 const env={ALLOW_DEV_AUTH:'true',DB:{prepare,async batch(items){sql.exec('BEGIN');try {const r=[];for(const i of items)r.push(await i.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}},MEDIA:{async put(key,bytes,metadata){objects.set(key,{bytes,metadata})},async get(key){const v=objects.get(key);return v?{body:v.bytes}:null},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)}}};
 async function call(path,method='GET',body,email='admin@example.com',headers={}) {
  return worker.fetch(new Request('https://test.local'+path,{method,headers:{...(email?{'x-column-studio-dev-email':email}:{}),...(!(body instanceof FormData)?{'content-type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)}),env);
 }
 async function article(fields={}){const r=await call('/api/articles','POST',{slug:'test-'+crypto.randomUUID(),title:'安全な記事',main_actor_id:'shindo-toshiki',...fields});assert.equal(r.status,201);return (await r.json()).article;}
 return {sql,env,call,article,objects};
}
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64'));
function upload(id,bytes=png,type='image/png'){const fd=new FormData();fd.append('file',new File([bytes],'image.png',{type}));if(id)fd.append('article_id',id);return fd;}

test('stored XSS, encoded URL schemes and dangerous markup are removed; speech bubbles survive',async()=>{
 const f=fixture();const payload='<script>window.pwned=1</script><img src=x onerror="window.pwned=1"><svg onload="window.pwned=1"></svg><a href="jav&#x61;script:alert(1)">bad</a><div class="editor-bubble right" data-character="mion-standard"><div class="bubble-avatar" contenteditable="false"><img src="assets/characters/mion-standard.png" class="character-icon"></div><p style="background-color:#fff;color:rgb(1, 2, 3)">会話</p></div>';
 const a=await f.article({body_html:payload,media_url:'javascript:alert(1)',hero_url:'data:image/svg+xml,bad'});
 assert.doesNotMatch(a.body_html,/<script|onerror|onload|<svg|javascript:/i);assert.match(a.body_html,/editor-bubble right/);assert.match(a.body_html,/data-character="mion-standard"/);assert.match(a.body_html,/background-color/);assert.equal(a.media_url,'');assert.equal(a.hero_url,'');
 const r=await f.call('/api/articles/'+a.id,'PATCH',{expected_revision:a.revision,body_html:''});assert.equal((await r.json()).article.body_html,'');
 f.sql.prepare('UPDATE articles SET body_html=? WHERE id=?').run(payload,a.id);
 assert.doesNotMatch((await (await f.call('/api/articles')).json()).articles[0].body_html,/<script|onerror/);
});

test('browser sanitizer blocks DOM XSS and unsafe paste markup',()=>{
 const dom=new JSDOM('<div id="body"></div>',{url:'https://basecraftas.com/apps/column-studio/',runScripts:'dangerously'});
 dom.window.eval(readFileSync('apps/column-studio/security.js','utf8'));
 const clean=dom.window.ColumnSecurity.body('<img src=x onerror="window.pwned=1"><iframe srcdoc="bad"></iframe><svg onload="window.pwned=1"></svg><a href="javascript:alert(1)">x</a>');
 dom.window.document.getElementById('body').innerHTML=clean;
 dom.window.document.querySelector('img').dispatchEvent(new dom.window.Event('error'));
 assert.equal(dom.window.pwned,undefined);assert.doesNotMatch(clean,/onerror|onload|iframe|javascript:|<svg/);
 dom.window.close();
});

test('URL validation rejects credentials, backslashes, controls and protocol-relative URLs',()=>{
 for(const bad of ['javascript:alert(1)','data:text/html,x','//evil.example/x','https://u:p@example.com','java\nscript:foo','\\evil.example'])assert.equal(safeUrl(bad,true),'');
 assert.equal(safeUrl('https://example.com/path'),'https://example.com/path');
});

test('SVG and MIME-spoofed images rejected; valid image needs an article',async()=>{
 const f=fixture(),a=await f.article();
 for(const [body,type] of [['<svg onload="alert(1)"></svg>','image/svg+xml'],['<svg/>','image/png'],['<html>bad</html>','image/jpeg']])assert.equal((await f.call('/api/assets','POST',upload(a.id,body,type))).status,415);
 assert.equal((await f.call('/api/assets','POST',upload(''))).status,400);
 assert.equal((await f.call('/api/assets','POST',upload(a.id), 'viewer@example.com')).status,403);
 assert.equal((await f.call('/api/assets','POST',upload(a.id))).status,201);
});

test('draft media private; public snapshot required; unpublish revokes it; existing SVG denied',async()=>{
 const f=fixture(),a=await f.article();const asset=(await (await f.call('/api/assets','POST',upload(a.id))).json()).asset;
 assert.equal((await f.call('/column-media/'+asset.key,'GET',undefined,'')).status,404);
 assert.equal((await f.call('/api/column-studio/media/'+asset.key,'GET',undefined,'')).status,403);
 const privateResponse=await f.call('/api/column-studio/media/'+asset.key);assert.equal(privateResponse.status,200);assert.match(privateResponse.headers.get('cache-control'),/no-store/);assert.equal(privateResponse.headers.get('x-content-type-options'),'nosniff');assert.match(privateResponse.headers.get('content-security-policy'),/sandbox/);
 f.sql.prepare("UPDATE articles SET status='published' WHERE id=?").run(a.id);
 assert.equal((await f.call('/column-media/'+asset.key,'GET',undefined,'')).status,404);
 f.sql.prepare('INSERT INTO article_public_assets VALUES(?,?)').run(a.id,asset.key);
 assert.equal((await f.call('/column-media/'+asset.key,'GET',undefined,'')).status,200);
 const draft=(await (await f.call('/api/assets','POST',upload(a.id))).json()).asset;
 assert.equal((await f.call('/column-media/'+draft.key,'GET',undefined,'')).status,404);
 f.sql.prepare("UPDATE articles SET status='archived' WHERE id=?").run(a.id);
 assert.equal((await f.call('/column-media/'+asset.key,'GET',undefined,'')).status,404);
 f.sql.prepare("UPDATE article_assets SET content_type='image/svg+xml' WHERE r2_key=?").run(asset.key);
 assert.equal((await f.call('/api/column-studio/media/'+asset.key)).status,404);
});

test('last admin protected in registration and update; second admin allows intentional demotion',async()=>{
 const f=fixture();assert.equal((await f.call('/api/members','POST',{email:'admin@example.com',role:'editor'})).status,409);
 assert.equal((await f.call('/api/members/admin','PATCH',{role:'viewer'})).status,409);
 await f.call('/api/members','POST',{email:'second@example.com',role:'admin'});
 assert.equal((await f.call('/api/members','POST',{email:'admin@example.com',role:'editor'})).status,200);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM members WHERE role='admin' AND status='active'").get().n,1);
});

test('cross-origin/missing-origin requests blocked and body type enforced',()=>{
 const url='https://basecraftas.com/api/column-studio/api/articles';
 for(const origin of ['', 'https://evil.example'])assert.throws(()=>requestGuard(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'}}),{},'/api/articles'),/invalid_origin/);
 assert.throws(()=>requestGuard(new Request(url,{method:'POST',headers:{origin:'https://basecraftas.com','content-type':'text/plain'}}),{},'/api/articles'),/unsupported_content_type/);
 assert.doesNotThrow(()=>requestGuard(new Request(url,{method:'POST',headers:{origin:'https://basecraftas.com','content-type':'application/json'}}),{},'/api/articles'));
});

test('public member route exposes only customer-scoped endpoints',async()=>{
 const f=fixture();
 assert.equal((await f.call('/api/totonoe-member/api/health')).status,200);
 assert.equal((await f.call('/api/totonoe-member/api/customer/auth/status','GET',undefined,'')).status,200);
 for(const path of ['/api/me','/api/members','/api/articles','/api/weekly/admin/questions','/api/archive-candidates']) {
  assert.equal((await f.call('/api/totonoe-member'+path,'GET',undefined,'admin@example.com')).status,404,path);
 }
});

test('JSON body bounded without relying on content-length; per-account write limit',async()=>{
 const f=fixture();assert.equal((await f.call('/api/articles','POST',{slug:'large',body_html:'a'.repeat(513*1024)})).status,413);
 for(let i=0;i<59;i++)await f.call('/api/articles','POST',{});
 assert.equal((await f.call('/api/articles','POST',{})).status,429);
 assert.equal((await f.call('/api/articles')).status,200);
});

test('preview redirects are validated before contacting next host',async()=>{
 const f=fixture(),calls=[],original=globalThis.fetch;
 try {
  globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options.redirect,'manual');return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})};
  assert.equal((await f.call('/api/link-preview','POST',{url:'https://note.com/example'})).status,200);
  assert.deepEqual(calls,['https://note.com/example']);
 }finally{globalThis.fetch=original;}
});

test('public build excludes source/config/report files and includes real 404/security headers',()=>{
 for(const file of ['apps/column-studio-api/src/worker.js','apps/column-studio-api/schema.sql','apps/column-studio-api/wrangler.toml','README.md','package.json','package-lock.json','scripts/build-site.mjs','apps/column-studio/security-entry.js'])assert.equal(existsSync(join('dist',file)),false,file);
 for(const file of ['index.html','404.html','_headers','apps/column-studio/security.js','projects/totonoe/assets/characters/mion-standard.png'])assert.ok(existsSync(join('dist',file)),file);
 assert.match(readFileSync('dist/_headers','utf8'),/script-src 'self'/);
});

test('successful publish emits sanitized HTML and fixes public media snapshot only after GitHub commit',async()=>{
 const f=fixture(),a=await f.article({body_html:'<p>published</p><img src=x onerror="alert(1)">'});
 const asset=(await (await f.call('/api/assets','POST',upload(a.id))).json()).asset;
 await f.call('/api/articles/'+a.id,'PATCH',{expected_revision:1,hero_url:'https://basecraftas.com/column-media/'+asset.key});
 f.env.GITHUB_TOKEN='test-only';f.env.GITHUB_REPOSITORY='test/repo';let tree;const blobs=new Map();
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options={})=>{
   const path=new URL(url).pathname;
   if(path.includes('/git/ref/'))return Response.json({object:{sha:'base'}});
   if(path.includes('/contents/'))return new Response('',{status:404});
   if(path.endsWith('/git/commits/base'))return Response.json({tree:{sha:'base-tree'}});
   if(path.endsWith('/git/blobs')){const blob=JSON.parse(options.body),sha='blob-'+blobs.size;blobs.set(sha,blob.encoding==='base64'?Buffer.from(blob.content,'base64').toString():blob.content);return Response.json({sha});}
   if(path.endsWith('/git/trees')){tree=JSON.parse(options.body);return Response.json({sha:'tree'});}
   if(path.endsWith('/git/commits'))return Response.json({sha:'commit'});
   if(path.includes('/git/refs/'))return Response.json({object:{sha:'commit'}});
   throw new Error('Unexpected mock '+path);
  };
  const r=await f.call('/api/articles/'+a.id+'/publish','POST',{expected_revision:2});
  assert.equal(r.status,200,await r.clone().text());
  assert.ok(tree);const html=blobs.get(tree.tree.find(x=>x.path.endsWith(a.slug+'.html')).sha);
  assert.doesNotMatch(html,/onerror/);assert.match(html,/<p>published<\/p>/);
  assert.equal((await f.call('/column-media/'+asset.key,'GET',undefined,'')).status,200);
 }finally{globalThis.fetch=original;}
});

test('production UI waits for authentication; pending drafts use scoped session storage and logout clears views',async()=>{
 const dom=new JSDOM(readFileSync('apps/column-studio/index.html','utf8'),{url:'https://basecraftas.com/apps/column-studio/',runScripts:'outside-only'}),w=dom.window;
 w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(readFileSync('apps/column-studio/security.js','utf8'));
 const old={currentEmail:'admin@example.com',posts:[{id:'draft-old',slug:'draft-old',title:'private pending',body:'<p>secret</p>',pending:true,updated:'2026.09.11',content_type:'column'}],members:[{email:'private@example.com'}]};
 w.localStorage.setItem('basecraftas_column_studio_v1',JSON.stringify(old));
 let release;
 w.fetch=async url=>{
  if(String(url).endsWith('/api/me')){await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({email:'admin@example.com',member:{email:'admin@example.com',role:'admin'}})}}
  return {ok:true,json:async()=>({articles:[],tags:[],members:[],candidates:[]})};
 };
 w.eval(readFileSync('apps/column-studio/script.js','utf8').replace(/\}\)\(\);\s*$/,'window.securityTest={state,persist,clearSessionView};})();'));
 assert.equal(w.securityTest.state.posts.length,0);assert.doesNotMatch(w.document.body.textContent,/private pending/);
 release();await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(w.localStorage.getItem('basecraftas_column_studio_v1'),null);
 const cached=JSON.parse(w.sessionStorage.getItem('column-studio-session:admin@example.com'));
 assert.equal(cached.posts[0].title,'private pending');assert.equal(cached.members,undefined);assert.ok(cached.expires>Date.now());
 w.securityTest.clearSessionView();assert.equal(w.sessionStorage.length,0);assert.equal(w.securityTest.state.posts.length,0);assert.doesNotMatch(w.document.body.textContent,/private pending/);
 w.close();
});

test('metadata IDs and quote-breaking URLs cannot create unsafe embeds',async()=>{
 const f=fixture();const a=await f.article({source_id:'x" onload="alert(1)',media_url:'https://example.com/"><svg/onload=alert(1)>'});
 assert.equal(a.source_id,'');assert.equal(a.media_url,'');
 const {articleHtml}=await import('./src/public-render.js');
 const html=articleHtml({title:'safe',excerpt:'',tags:[],speakers:[],main_actor:{name:'name'},body_html:'<img src=x onerror="alert(1)">',content_type:'column',media_url:'javascript:alert(1)'});
 assert.doesNotMatch(html,/onerror|href="javascript:/);
});

test('media migration uses actual published references, excluding unused drafts and SVG',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'media-plan-test-'));
 try{
  const published=join(dir,'published');await mkdir(published);
  await writeFile(join(dir,'snapshot.json'),JSON.stringify({articles:[{id:'article-a',status:'published'}],assets:[{r2_key:'live.png',article_id:null,content_type:'image/png'},{r2_key:'draft.png',article_id:'article-a',content_type:'image/png'},{r2_key:'bad.svg',article_id:'article-a',content_type:'image/svg+xml'}]}));
  await writeFile(join(published,'a.json'),JSON.stringify({id:'article-a',hero_url:'https://basecraftas.com/column-media/live.png',body_html:'<img src="https://basecraftas.com/column-media/bad.svg">'}));
  const output=join(dir,'plan.sql');const result=spawnSync(process.execPath,['scripts/plan-media-migration.mjs',join(dir,'snapshot.json'),published,output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const sql=await readFile(output,'utf8');
  assert.match(sql,/live\.png/);assert.doesNotMatch(sql,/draft\.png|bad\.svg/);
  assert.equal(JSON.parse(await readFile(output+'.issues.json','utf8')).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
