import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const root = process.cwd();
const workerSource=readFileSync(resolve(root,'apps/tsuzuri-studio-api/src/worker.js'),'utf8');
const {loadWorker}=await import('./test-support.mjs');
const worker=await loadWorker();
const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(resolve(root,'apps/tsuzuri-studio-api/schema.sql'),'utf8'));
sql.exec("INSERT INTO members(id,email,role,status) VALUES('test','test@example.com','admin','active')");
function prepare(query){
 let args=[];
 return {bind(...values){args=values;return this;},
 async first(){return sql.prepare(query).get(...args)||null;},
 async all(){return {results:sql.prepare(query).all(...args)};},
 async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}};
}
const env={ALLOW_DEV_AUTH:'true',DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
async function call(path,method='GET',body,email='test@example.com'){
 return worker.fetch(new Request('https://test.local'+path,{method,headers:{'x-column-studio-dev-email':email,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
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

const lifecycleId='article_22345678-1234-1234-1234-123456789abc';
res=await call('/api/articles','POST',{id:lifecycleId,slug:'lifecycle-test',title:'lifecycle',main_actor_id:'shindo-toshiki'});assert.equal(res.status,201);
res=await call('/api/articles/'+lifecycleId+'/lifecycle','POST',{action:'trash',expected_revision:1},'editor@example.com');assert.equal(res.status,403);
res=await call('/api/articles/'+lifecycleId+'/lifecycle','POST',{action:'trash',expected_revision:1});assert.equal(res.status,200);
article=(await res.json()).article;assert.equal(article.status,'archived');assert.ok(article.deleted_at);assert.equal(article.revision,2);
res=await call('/api/articles/'+lifecycleId,'PATCH',{expected_revision:2,title:'blocked'});assert.equal(res.status,409);
res=await call('/api/articles');assert.ok((await res.json()).articles.find(item=>item.id===lifecycleId).deleted_at);
res=await call('/api/articles/'+lifecycleId+'/lifecycle','POST',{action:'restore',expected_revision:2});assert.equal(res.status,200);
article=(await res.json()).article;assert.equal(article.status,'draft');assert.equal(article.deleted_at,null);assert.equal(article.revision,3);
sql.prepare("UPDATE articles SET status='published' WHERE id=?").run(lifecycleId);
env.GITHUB_TOKEN='test-token';env.GITHUB_REPOSITORY='owner/repo';env.GITHUB_BRANCH='main';
const deletionRequests=[];globalThis.fetch=async(url,options={})=>{
 const pathname=new URL(String(url)).pathname;const body=options.body?JSON.parse(options.body):null;
 deletionRequests.push({pathname,method:options.method||'GET',body});
 if(pathname.endsWith('/git/ref/heads/main'))return new Response(JSON.stringify({object:{sha:'base-sha'}}),{status:200});
 if(pathname.endsWith('/git/commits/base-sha'))return new Response(JSON.stringify({tree:{sha:'base-tree'}}),{status:200});
 if(pathname.includes('/contents/projects/totonoe/data/contents/index.json'))return new Response(JSON.stringify({sha:'index-sha',content:Buffer.from(JSON.stringify({articles:[{id:lifecycleId,slug:'lifecycle-test'},{id:'keep',slug:'keep'}]})).toString('base64')}),{status:200});
 if(pathname.includes('/contents/projects/totonoe/data/contents/lifecycle-test.json'))return new Response(JSON.stringify({sha:'json-sha'}),{status:200});
 if(pathname.includes('/contents/projects/totonoe/contents/lifecycle-test.html'))return new Response(JSON.stringify({sha:'html-sha'}),{status:200});
 if(pathname.endsWith('/git/blobs'))return new Response(JSON.stringify({sha:'index-blob'}),{status:201});
 if(pathname.endsWith('/git/trees'))return new Response(JSON.stringify({sha:'new-tree'}),{status:201});
 if(pathname.endsWith('/git/commits'))return new Response(JSON.stringify({sha:'new-commit'}),{status:201});
 if(pathname.endsWith('/git/refs/heads/main'))return new Response(JSON.stringify({}),{status:200});
 return new Response(JSON.stringify({message:'unexpected '+pathname}),{status:404});
};
res=await call('/api/articles/'+lifecycleId+'/lifecycle','POST',{action:'unpublish',expected_revision:3});assert.equal(res.status,200);
const treeRequest=deletionRequests.find(item=>item.pathname.endsWith('/git/trees'));assert.ok(treeRequest);
const deletedPaths=treeRequest.body.tree.filter(item=>item.sha===null).map(item=>item.path).sort();
assert.deepEqual(deletedPaths,['projects/totonoe/contents/lifecycle-test.html','projects/totonoe/data/contents/lifecycle-test.json']);
const indexBlobRequest=deletionRequests.find(item=>item.pathname.endsWith('/git/blobs'));
const nextIndex=JSON.parse(Buffer.from(indexBlobRequest.body.content,'base64').toString('utf8'));assert.deepEqual(nextIndex.articles.map(item=>item.id),['keep']);
globalThis.fetch=originalFetch;delete env.GITHUB_TOKEN;delete env.GITHUB_REPOSITORY;delete env.GITHUB_BRANCH;
res=await call('/api/articles','POST',{slug:'podcast-16',title:'#16 テスト配信タイトル',content_type:'podcast',episode_no:16,source_published_at:'2026-09-12',media_url:'https://stand.fm/episodes/test16'});assert.equal(res.status,201);
env.GOOGLE_DRIVE_ACCESS_TOKEN='drive-test-token';env.DRIVE_ARCHIVE_FOLDER_ID='folder-test';
const driveRequests=[];globalThis.fetch=async url=>{driveRequests.push(String(url));return new Response(JSON.stringify({files:[{id:'drive_video_1',name:'第16回 9/12.m4a',mimeType:'video/mp4',createdTime:'2026-09-11T22:19:01.935Z',modifiedTime:'2026-09-10T02:00:00Z',webViewLink:'https://drive.google.com/file/d/drive_video_1/view'}]}),{status:200});};
res=await call('/api/archive-candidates/scan','POST',{});assert.equal(res.status,200);assert.equal((await res.json()).new_count,1);
res=await call('/api/archive-candidates');let archiveData=await res.json();assert.equal(archiveData.candidates.length,1);assert.equal(archiveData.candidates[0].status,'new');assert.match(archiveData.schedule,/土曜日 09:00/);
res=await call('/api/archive-candidates/'+archiveData.candidates[0].id+'/import','POST',{});assert.equal(res.status,201);let archiveArticle=(await res.json()).article;assert.equal(archiveArticle.content_type,'archive');assert.equal(archiveArticle.status,'draft');assert.equal(archiveArticle.source_id,'drive_video_1');assert.equal(archiveArticle.main_actor_id,'');assert.equal(archiveArticle.episode_no,16);assert.equal(archiveArticle.title,'#16 テスト配信タイトル');assert.equal(archiveArticle.source_published_at,'2026-09-12');
res=await call('/api/archive-candidates/'+archiveData.candidates[0].id+'/import','POST',{});assert.equal(res.status,200);assert.equal((await res.json()).article.id,archiveArticle.id);
await worker.scheduled({cron:'0 0 * * 6',scheduledTime:Date.now()},env);
assert.ok(driveRequests.some(url=>url.includes("'folder-test'+in+parents")||url.includes('%27folder-test%27+in+parents')));
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM archive_candidates').get().n,1);
globalThis.fetch=originalFetch;delete env.GOOGLE_DRIVE_ACCESS_TOKEN;delete env.DRIVE_ARCHIVE_FOLDER_ID;
console.log('PASS: weekly Drive scan detects candidates and imports a reviewable archive draft');
sql.prepare("UPDATE articles SET deleted_at='2026-07-01 00:00:00', status='archived' WHERE id=?").run(lifecycleId);
sql.prepare("INSERT INTO article_assets(id,article_id,r2_key,url) VALUES('asset_old',?,'contents/old.png','https://test.local/old.png')").run(lifecycleId);
const removedKeys=[];env.MEDIA={delete:async keys=>removedKeys.push(...(Array.isArray(keys)?keys:[keys]))};
await worker.scheduled({cron:'15 18 * * *',scheduledTime:Date.now()},env);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM articles WHERE id=?').get(lifecycleId).n,0);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM article_versions WHERE article_id=?').get(lifecycleId).n,0);
assert.deepEqual(removedKeys,['contents/old.png']);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_id=? AND action='article.purge'").get(lifecycleId).n,1);
delete env.MEDIA;
console.log('PASS: admin-only trash, restore, atomic GitHub unpublish, and 30-day purge');

const html=readFileSync(resolve(root,'apps/tsuzuri-studio/index.html'),'utf8');
const js=readFileSync(resolve(root,'apps/tsuzuri-studio/script.js'),'utf8');
const dom=new JSDOM(html,{url:'https://local.test/apps/tsuzuri-studio/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};w.confirm=()=>true;w.fetch=async()=>({ok:false,json:async()=>({})});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.document.execCommand=(command,_,value)=>{if(command==='insertHTML')w.document.getElementById('articleEditor').insertAdjacentHTML('beforeend',value);};
w.eval(readFileSync(resolve(root,'apps/tsuzuri-studio/security.js'),'utf8'));
w.eval(js.replace(/\}\)\(\);\s*$/, 'window.editorTest={bootRemote,uploadHero,state,els,blankPost,collect,editPost,scheduleSave,syncRemoteArticle,sourceFromUrl,analyzeLink,setHeroPreview,showHistory,publish,insertBubble,checkpoint,api,openLatest,changeLifecycle,openContentView,setCloud:(value)=>{cloudReady=value;},setApi:(value)=>{API_BASE=value;}};})();'));
const t=w.editorTest;
assert.ok(w.document.querySelector('[data-content-view="column"]'));
assert.equal(w.document.querySelector('[data-content-view="podcast"]'),null);
assert.equal(w.document.querySelector('[data-content-view="archive"]'),null);
assert.equal(w.document.getElementById('archiveSyncPanel'),null);
assert.equal(w.document.querySelector('#postContentType option[value="podcast"]'),null);
t.openContentView('podcast');assert.equal(w.document.getElementById('contentListTitle').textContent,'すべてのコンテンツ');
assert.ok(!w.document.getElementById('postTable').textContent.includes('Podcastで深める'));
t.openContentView('video');t.blankPost(false);
assert.equal(t.els.contentType.value,'video');assert.ok(w.document.getElementById('view-editor').classList.contains('source-only-editor'));
assert.equal(w.document.getElementById('imageDrop').closest('.setting-block').classList.contains('source-only-hidden'),false);
t.openContentView('column');t.blankPost(false);
t.els.title.value='new draft';t.els.title.dispatchEvent(new w.Event('input',{bubbles:true}));
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
const lifecyclePost=t.state.posts[0];await t.changeLifecycle(lifecyclePost.id,'trash');assert.ok(lifecyclePost.deleted_at);assert.equal(lifecyclePost.status,'archived');
assert.equal(w.document.querySelector('[data-filter="trash"]').classList.contains('active'),true);assert.match(w.document.getElementById('postTable').textContent,/あと30日/);
await t.changeLifecycle(lifecyclePost.id,'restore');assert.equal(lifecyclePost.deleted_at,'');assert.equal(lifecyclePost.status,'draft');
console.log('PASS: sidebar content navigation, visible trash action, automatic trash view, retention display, and restore');

// While save A is in flight, type B. Response A must not erase B.
t.setApi('/api/tsuzuri-studio');t.setCloud(true);
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
// Auxiliary APIs must not prevent loading or saving articles.
const bootRequests=[];
w.fetch=async(url)=>{bootRequests.push(String(url));
 if(String(url).endsWith('/api/me'))return {ok:true,json:async()=>({email:'test@example.com',member:{email:'test@example.com',role:'admin'}})};
 if(String(url).endsWith('/api/articles'))return {ok:true,json:async()=>({articles:[{id:'loaded',title:'Loaded column',content_type:'column',revision:1}]})};
 return {ok:false,status:500,json:async()=>({error:'optional API unavailable'})};
};
await t.bootRemote();assert.equal(t.state.role,'admin');assert.ok(t.state.posts.some(p=>p.id==='loaded'));
assert.ok(!bootRequests.some(url=>/archive-candidates|qualifications|members/.test(url)));
assert.match(t.els.saveState.textContent,/接続済み|未共有/);
// Permission errors and HTML responses retain the active editor and its work.
const retainedPosts=t.state.posts;
w.fetch=async()=>({ok:false,status:403,json:async()=>({error:'forbidden'})});
await assert.rejects(t.api('/api/members'),/forbidden/);assert.equal(t.state.posts,retainedPosts);
w.fetch=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('HTML response');}});
await assert.rejects(t.api('/api/articles'),/応答を読み取れません/);
// Image ownership is captured before the save, even when navigation changes.
t.state.editingId='image-a';const imageA={id:'image-a',title:'image',content_type:'column',revision:0};t.state.posts.push(imageA);
let uploadedOwner;
w.fetch=async(url,options)=>{
 if(String(url).endsWith('/api/assets')){uploadedOwner=options.body.get('article_id');return {ok:true,json:async()=>({asset:{url:'/column-media/image.png'}})};}
 t.state.editingId='loaded';return {ok:true,json:async()=>({article:{revision:1,status:'draft'}})};
};
await t.uploadHero(new w.File(['image'],'test.png',{type:'image/png'}));assert.equal(uploadedOwner,'image-a');
console.log('PASS: core boot isolation, permission/HTML error handling, and image ownership across navigation');
w.close();
