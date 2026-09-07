import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_PATH || '/private/tmp/column-studio-test-deps/node_modules/jsdom');
const root = process.cwd();
const workerSource=readFileSync(resolve(root,'apps/column-studio-api/src/worker.js'),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'))).default;
const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(resolve(root,'apps/column-studio-api/schema.sql'),'utf8'));
sql.exec("INSERT INTO members(id,email,role,status) VALUES('test','test@example.com','admin','active')");
function prepare(query){
 let args=[];
 return {bind(...values){args=values;return this;},
 async first(){return sql.prepare(query).get(...args)||null;},
 async all(){return {results:sql.prepare(query).all(...args)};},
 async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}};
}
const env={ALLOW_DEV_AUTH:'true',DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
async function call(path,method='GET',body){
 return worker.fetch(new Request('https://test.local'+path,{method,headers:{'x-column-studio-dev-email':'test@example.com','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
}
let res=await call('/api/members');assert.equal(res.status,200);assert.equal((await res.json()).members.length,1);
res=await call('/api/members/test','PATCH',{role:'editor',status:'active'});assert.equal(res.status,409);
res=await call('/api/members','POST',{name:'Editor',email:'EDITOR@example.com',role:'editor'});assert.equal(res.status,201);
const editorMember=(await res.json()).member;assert.equal(editorMember.email,'editor@example.com');
res=await call('/api/members/'+editorMember.id,'PATCH',{role:'viewer',status:'active'});assert.equal(res.status,200);assert.equal((await res.json()).member.role,'viewer');
console.log('PASS: member list, registration, role update, last-admin protection');
const spoofed=await worker.fetch(new Request('https://test.local/api/me',{headers:{'cf-access-authenticated-user-email':'test@example.com'}}),{...env,ALLOW_DEV_AUTH:'false'});
assert.equal((await spoofed.json()).member,null);
console.log('PASS: unverified Access email headers are rejected');
const accessKeys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicJwk=await crypto.subtle.exportKey('jwk',accessKeys.publicKey);publicJwk.kid='test-key';publicJwk.alg='RS256';
const encodePart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtHeader=encodePart({alg:'RS256',kid:'test-key'});
const jwtPayload=encodePart({iss:'https://team.cloudflareaccess.com',aud:['column-aud'],email:'test@example.com',exp:Math.floor(Date.now()/1000)+300});
const jwtInput=jwtHeader+'.'+jwtPayload;
const jwtSignature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',accessKeys.privateKey,Buffer.from(jwtInput))).toString('base64url');
const jwtFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[publicJwk]}),{status:200});
const verified=await worker.fetch(new Request('https://test.local/api/me',{headers:{'cf-access-jwt-assertion':jwtInput+'.'+jwtSignature}}),{...env,ALLOW_DEV_AUTH:'false',TEAM_DOMAIN:'https://team.cloudflareaccess.com',POLICY_AUD:'column-aud'});
assert.equal((await verified.json()).member.email,'test@example.com');globalThis.fetch=jwtFetch;
console.log('PASS: valid Cloudflare Access JWT is accepted');


const id='article_12345678-1234-1234-1234-123456789abc';
res=await call('/api/articles','POST',{id,slug:'test-editor',title:'one',tags:['初期タグ'],main_actor_id:'shindo-toshiki'});
assert.equal(res.status,201);
let article=(await res.json()).article;assert.equal(article.revision,1);
res=await call('/api/articles/'+id,'PATCH',{expected_revision:1,title:'two',tags:['履歴のタグ']});assert.equal(res.status,200);article=(await res.json()).article;assert.equal(article.revision,2);
res=await call('/api/articles/'+id,'PATCH',{expected_revision:1,title:'stale'});assert.equal(res.status,409);
assert.equal(sql.prepare('SELECT title FROM articles WHERE id=?').get(id).title,'two');
res=await call('/api/articles/'+id+'/history');let versions=(await res.json()).versions;assert.equal(versions.length,2);
res=await call('/api/articles/'+id+'/history/'+versions[1].id);const detail=(await res.json()).version;
res=await call('/api/articles/'+id,'PATCH',{...detail,expected_revision:2});assert.equal(res.status,200);
assert.equal(sql.prepare('SELECT title FROM articles WHERE id=?').get(id).title,'one');
res=await call('/api/tags');assert.ok((await res.json()).tags.includes('履歴のタグ'));
sql.prepare('INSERT INTO article_publish_locks VALUES(?,?)').run(id,Date.now()+60000);
res=await call('/api/articles/'+id,'PATCH',{expected_revision:3,title:'during publish'});assert.equal(res.status,409);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM article_versions').get().n,3);
sql.exec('DELETE FROM article_publish_locks');
res=await call('/api/articles/'+id+'/publish','POST',{expected_revision:1});assert.equal(res.status,409);
res=await call('/api/articles','POST',{id,slug:'test-editor',title:'duplicate'});assert.equal(res.status,200);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM articles').get().n,1);
sql.prepare("INSERT INTO publish_jobs(id,article_id,article_revision,status,live_url) VALUES('job_test',?,3,'published','https://basecraftas.com/projects/totonoe/contents/test-editor.html')").run(id);
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>String(url).includes('index.json')
  ?new Response(JSON.stringify({articles:[{id,revision:3}]}),{status:200})
  :new Response('<meta name="content-revision" content="3">',{status:200});
res=await call('/api/articles/'+id+'/publication');let publication=await res.json();assert.equal(publication.stage,'live');assert.equal(publication.has_unpublished_changes,false);
res=await call('/api/articles/'+id,'PATCH',{expected_revision:3,title:'new local draft'});assert.equal(res.status,200);
res=await call('/api/articles/'+id+'/publication');publication=await res.json();assert.equal(publication.stage,'live');assert.equal(publication.has_unpublished_changes,true);
globalThis.fetch=originalFetch;
console.log('PASS: revision conflict, publishing lock, history restore, tag history, exact publication state');

const html=readFileSync(resolve(root,'apps/column-studio/index.html'),'utf8');
const js=readFileSync(resolve(root,'apps/column-studio/script.js'),'utf8');
const dom=new JSDOM(html,{url:'https://local.test/apps/column-studio/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};w.fetch=async()=>({ok:false,json:async()=>({})});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.document.execCommand=(command,_,value)=>{if(command==='insertHTML')w.document.getElementById('articleEditor').insertAdjacentHTML('beforeend',value);};
w.eval(js.replace(/\}\)\(\);\s*$/, 'window.editorTest={state,els,blankPost,collect,editPost,scheduleSave,syncRemoteArticle,sourceFromUrl,analyzeLink,setHeroPreview,showHistory,publish,insertBubble,checkpoint,api,openLatest,setCloud:(value)=>{cloudReady=value;},setApi:(value)=>{API_BASE=value;}};})();'));
const t=w.editorTest;
t.blankPost(false);t.els.title.value='new draft';t.els.title.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.ok(t.state.editingId);assert.equal(t.state.posts[0].title,'new draft');
assert.match(w.document.getElementById('saveState').textContent,/この端末/);
t.setHeroPreview('https://test.local/hero.png');t.scheduleSave();assert.equal(t.state.posts[0].hero,'https://test.local/hero.png');
const tagButton=w.document.querySelector('[data-topic-tag="ChatGPT"]');tagButton.click();assert.ok(t.els.tags.value.includes('ChatGPT'));
const speaker=w.document.querySelector('#postSpeakers input');speaker.checked=true;speaker.dispatchEvent(new w.Event('change',{bubbles:true}));assert.deepEqual(Array.from(t.collect().speaker_ids),['shindo-toshiki']);
t.insertBubble('mion-standard');
const bubble=t.els.editor.querySelector('.editor-bubble');bubble.querySelector('p').textContent='keep words';bubble.querySelector('p').click();
assert.equal(t.els.editor.querySelectorAll('.editor-bubble').length,1);
w.document.getElementById('changeBubble').click();w.document.querySelector('#bubblePicker [data-character="hakuto-thinking"]').click();
assert.equal(bubble.dataset.character,'hakuto-thinking');assert.equal(bubble.querySelector('p').textContent,'keep words');
w.document.getElementById('flipBubble').click();assert.ok(bubble.classList.contains('right'));
w.document.getElementById('removeBubble').click();assert.equal(t.els.editor.querySelectorAll('.editor-bubble').length,0);
assert.ok(t.state.posts[0].history.some(v=>v.post.body.includes('keep words')));
console.log('PASS: new draft autosave, hero persistence, tags, Speaker, bubble change/flip/delete without duplication');

// While save A is in flight, type B. Response A must not erase B.
t.setApi('/api/column-studio');t.setCloud(true);
let releases=[],requests=[];
w.fetch=async(url,options)=>{
 const payload=JSON.parse(options.body);requests.push(payload);
 await new Promise(resolve=>releases.push(resolve));
 return {ok:true,json:async()=>({article:{...payload,id:payload.id,revision:(payload.expected_revision||0)+1,status:'draft'}})};
};
const p=t.collect();p.revision=0;p.title='A';const first=t.syncRemoteArticle(p);
await new Promise(r=>setTimeout(r,0));
p.title='B';const second=t.syncRemoteArticle(p);
releases.shift()();await first;
await new Promise(r=>setTimeout(r,0));releases.shift()();await second;
assert.equal(p.title,'B');assert.equal(requests[1].expected_revision,1);assert.equal(p.revision,2);
console.log('PASS: serialized saves preserve newer typing');

// A URL response that arrives after the URL changed must be ignored.
let releasePreview;
w.fetch=async()=>{await new Promise(resolve=>{releasePreview=resolve;});return {ok:true,json:async()=>({preview:{title:'stale title',description:'stale',recommended_content_type:'column'}})};};
t.els.mediaUrl.value='https://note.com/old';const previewPromise=t.analyzeLink();
await new Promise(r=>setTimeout(r,0));assert.equal(w.document.getElementById('analyzeLinkButton').disabled,true);
t.els.mediaUrl.value='https://note.com/new';t.els.mediaUrl.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(w.document.getElementById('analyzeLinkButton').disabled,false);
releasePreview();await previewPromise;assert.notEqual(t.els.title.value,'stale title');
console.log('PASS: stale URL metadata is ignored and the control is re-enabled');

// A conflicted local draft is retained as a pending backup before opening shared content.
const conflicted=t.state.posts.find(item=>item.id===t.state.editingId);conflicted.conflict=true;conflicted.revision=2;conflicted.title='local conflict';
w.fetch=async()=>({ok:true,json:async()=>({articles:[{id:conflicted.id,title:'shared',excerpt:'',category:'content',destination:'totonoe',content_type:'column',main_actor_id:'shindo-toshiki',speaker_ids:[],topic_tags:[],slug:conflicted.slug,status:'draft',revision:3,body_html:'<p>shared</p>'}]})});
await t.openLatest();
const backup=t.state.posts.find(item=>item.title.includes('端末の退避コピー'));assert.ok(backup);assert.equal(backup.pending,true);assert.equal(backup.revision,0);
console.log('PASS: conflict recovery retains a pending local backup');
w.close();
