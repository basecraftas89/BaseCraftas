import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {loadWorker} from './test-support.mjs';
import {JSDOM} from 'jsdom';
import {deliveryCatalog,memberCatalog,startPlayback,playbackHeartbeat,completeDeliveryLesson,streamDeliveryLesson,registerClaudeStaffPreview} from './src/curriculum-playback.js';
const worker=await loadWorker();
function fixture() {
  const sql=new DatabaseSync(':memory:');
  for(const file of ['schema.sql','migrations/20260911_curriculum_foundation.sql','migrations/20261002_iroha_lesson_notes.sql','migrations/20261003_iroha_playback.sql'])sql.exec(readFileSync('apps/tsuzuri-studio-api/'+file,'utf8'));
  const prepare=query=>{let args=[];return {bind(...value){args=value;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};}};};
  const env={DB:{prepare},ALLOW_DEV_AUTH:'true',IROHA_ENROLLMENT_ENABLED:'true',IROHA_TEST_NOW:String(Date.parse('2026-10-03T00:00:00Z'))};
  for(const id of ['a','b','weekly']) {
    sql.prepare("INSERT INTO customer_accounts(id,email,status) VALUES(?,?,'active')").run(id,id+'@example.com');
    sql.prepare("INSERT INTO customer_entitlements(id,customer_id,entitlement_code,status,starts_at) VALUES(?,?,?,'active','2020-01-01')").run('ent-'+id,id,id==='weekly'?'weekly_access':'curriculum_all_access');
  }
  for(const [id,order] of [['first',1],['second',2]])sql.prepare('INSERT INTO iroha_delivery_lessons(id,curriculum_key,metadata_json,drive_file_id,parent_folder_id,duration_seconds,sort_order,published) VALUES(?,?,?,?,?,60,?,1)').run(id,'claude',JSON.stringify({title:id,categoryId:'llm',curriculumTitle:'Claude',videoFileName:'0'+order+'_test.mp4'}),'drive-'+id,'folder',order);
  const auth={customer:{id:'a',email:'a@example.com'},access:{has_curriculum_access:true,staff_access:false}};
  const tick=s=>{env.IROHA_TEST_NOW=String(Number(env.IROHA_TEST_NOW)+s*1000);};
  const call=(path,body,email='a@example.com')=>worker.fetch(new Request('https://test.local/api/totonoe-member/api/curriculum'+path,{method:body===undefined?'GET':'POST',headers:{...(email?{'x-column-studio-dev-email':email}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  return {sql,env,auth,tick,call};
}
test('非会員は教材を取得できず、サービス停止中は運営以外へ教材を出さない',async()=>{
  const f=fixture();assert.equal((await f.call('/catalog',undefined,'')).status,401);assert.equal((await f.call('/catalog',undefined,'weekly@example.com')).status,403);
  f.env.IROHA_ENROLLMENT_ENABLED='false';assert.equal((await deliveryCatalog(f.env,f.auth)).rows.length,0);
  const staff={...f.auth,access:{...f.auth.access,staff_access:true}};assert.equal((await deliveryCatalog(f.env,staff)).rows.length,2);
});
test('後続動画への直リンク・配信・完了操作は前のアウトプット完了まで拒否する',async()=>{
  const f=fixture();const catalog=await (await f.call('/catalog')).json();assert.equal(catalog.lessons[1].allowed,false);assert.equal(catalog.lessons[0].providerAssetId,undefined);
  assert.equal((await f.call('/lessons/second/playback',{})).status,403);assert.equal((await f.call('/media/second')).status,403);
  assert.equal((await f.call('/lessons/first/complete',{})).status,409);
});
test('先送り・他会員のセッション・古い更新番号を拒否し、連続視聴だけを保存する',async()=>{
  const f=fixture();const session=await startPlayback(f.env,f.auth,'first');
  await assert.rejects(playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:1,positionSeconds:60,ended:true}),/seek_rejected/);
  await assert.rejects(playbackHeartbeat(f.env,{...f.auth,customer:{id:'b'}},session.sessionId,{sequence:1,positionSeconds:0}),/session_expired/);
  f.tick(15);let result=await playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:1,positionSeconds:30});assert.equal(result.videoCompletedAt,null);
  assert.deepEqual(await playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:1,positionSeconds:30}),result);
  await assert.rejects(playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:4,positionSeconds:30}),/invalid_playback_update/);
  f.tick(15);result=await playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:2,positionSeconds:60,ended:true});assert.ok(result.videoCompletedAt);
  await assert.rejects(completeDeliveryLesson(f.env,f.auth,'first'),/learning_output_required/);
  f.sql.prepare('INSERT INTO iroha_lesson_notes(customer_id,lesson_id,takeaway,action,last_mutation_id,updated_at) VALUES(?,?,?,?,?,?)').run('a','first','学び','試す','test',new Date().toISOString());
  const complete=await completeDeliveryLesson(f.env,f.auth,'first');assert.equal(complete.lessons[1].allowed,true);assert.ok(complete.progress.first.completedAt);
  const other=await deliveryCatalog(f.env,{...f.auth,customer:{id:'b'}});assert.equal(memberCatalog(other).lessons[1].allowed,false);
});
test('途中視聴は端末を変えて再開でき、古い完了情報やローカル値で先へ進めない',async()=>{
  const f=fixture();const session=await startPlayback(f.env,f.auth,'first');f.tick(15);await playbackHeartbeat(f.env,f.auth,session.sessionId,{sequence:1,positionSeconds:20});
  const resumed=await startPlayback(f.env,f.auth,'first');assert.equal(resumed.resumeSeconds,20);assert.equal(resumed.videoCompletedAt,null);
  f.tick(3600);await assert.rejects(playbackHeartbeat(f.env,f.auth,resumed.sessionId,{sequence:1,positionSeconds:60,ended:true}),/connection_lost/);
  f.tick(22000);await assert.rejects(playbackHeartbeat(f.env,f.auth,resumed.sessionId,{sequence:1,positionSeconds:20}),/session_expired/);
});
test('Drive動画の移動・差し替えを検知し、Range付きで本体をバッファせずに配信する',async()=>{
  const f=fixture();const original=globalThis.fetch;let moved=false,changed=false,range;
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('alt=media')){range=init.headers.get('range');return new Response('bytes',{status:206,headers:{'content-range':'bytes 0-4/5','content-length':'5'}});}
    return Response.json({mimeType:'video/mp4',parents:[moved?'draft':'folder'],videoMediaMetadata:{durationMillis:changed?'90000':'60000'}});
  };
  try {
    const response=await streamDeliveryLesson(new Request('https://test.local',{headers:{range:'bytes=0-4'}}),f.env,f.auth,'first',async()=> 'token');assert.equal(response.status,206);assert.equal(range,'bytes=0-4');assert.equal(await response.text(),'bytes');
    moved=true;await assert.rejects(streamDeliveryLesson(new Request('https://test.local'),f.env,f.auth,'first',async()=> 'token'),/not_available/);
    moved=false;changed=true;await assert.rejects(streamDeliveryLesson(new Request('https://test.local'),f.env,f.auth,'first',async()=> 'token'),/media_changed/);
  }finally{globalThis.fetch=original;}
});
test('Claude動画の動作確認は運営専用で、正式な教材やバッジとして扱わない',async()=>{
  const f=fixture();f.env.IROHA_ENROLLMENT_ENABLED='false';
  const google=async()=>({id:'preview-drive',name:'9:30 TAYORI共有.mp4',parents:['1AzKcjCMlT67_LtUzWVQXsZRquo1EhDd_'],mimeType:'video/mp4',videoMediaMetadata:{durationMillis:'180000'}});
  await assert.rejects(registerClaudeStaffPreview(f.env,f.auth,google),/staff_preview_only/);
  const staff={...f.auth,access:{staff_access:true}};await registerClaudeStaffPreview(f.env,staff,google);
  const catalog=memberCatalog(await deliveryCatalog(f.env,staff));const preview=catalog.lessons.find(row=>row.staffPreview);assert.ok(preview);assert.equal(preview.durationSeconds,180);
  assert.equal((await deliveryCatalog(f.env,f.auth)).rows.length,0);
});
test('受講画面は動画終了のサーバー確認とメモ保存を待って完了し、本人の履歴を更新する',async()=>{
  const root='projects/totonoe/IROHA/';
  const dom=new JSDOM(readFileSync(root+'lesson.html','utf8'),{url:'https://basecraftas.com/projects/totonoe/IROHA/lesson.html?id=first',runScripts:'outside-only'});
  try {
    const w=dom.window;w.HTMLMediaElement.prototype.pause=function(){};
    w.eval(readFileSync(root+'curriculum-store.js','utf8'));
    const data={owner:{id:'a'},lessons:[{id:'first',title:'動画',categoryId:'llm',curriculumTitle:'Claude',workflowStatus:'published',folderStage:'delivery',videoProvider:'secure_drive',playbackUrl:'/api/totonoe-member/api/curriculum/media/first',allowed:true}],progress:{}};
    w.TOTONOE_APPLY_DELIVERY(data);const calls=[];
    w.TOTONOE_DELIVERY={local:false,ready:Promise.resolve(data),api:async(path,body)=>{
      calls.push({path,body});
      if(path.endsWith('/playback'))return {sessionId:'session',sequence:0,resumeSeconds:0,durationSeconds:60};
      if(path==='/playback/session')return {sequence:body.sequence,videoCompletedAt:body.ended?'2026-10-03T00:00:00Z':null};
      if(path.endsWith('/complete')){data.progress.first={status:'completed',completedAt:'2026-10-03T00:00:00Z',playbackCompletedAt:'2026-10-03T00:00:00Z'};return {completed:true};}
    },refresh:async()=>{w.TOTONOE_APPLY_DELIVERY(data);return data;}};
    w.TOTONOE_LESSON_NOTES={load:async()=>({note:null}),save:async payload=>({note:{...payload,revision:1},sheetSync:'synced'})};
    w.eval(readFileSync(root+'lesson-playback.js','utf8'));w.eval(readFileSync(root+'lesson.js','utf8'));
    await new Promise(resolve=>setTimeout(resolve,0));
    const form=w.document.querySelector('#completionForm'),button=w.document.querySelector('#completeLessonButton'),video=w.document.querySelector('video');
    assert.ok(video);assert.equal(button.disabled,true);
    form.elements.takeaway.value='学び';form.elements.action.value='試す';
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(calls.some(item=>item.path.endsWith('/complete')),false);
    video.currentTime=60;video.dispatchEvent(new w.Event('timeupdate'));video.dispatchEvent(new w.Event('ended'));await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(button.disabled,false);assert.equal(calls.find(item=>item.path==='/playback/session').body.ended,true);
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(calls.some(item=>item.path.endsWith('/complete')),true);assert.equal(w.TOTONOE_CURRICULUM_STORE.readLearnerState().lessonProgress.first.status,'completed');
    assert.equal(w.localStorage.getItem(w.TOTONOE_CURRICULUM_STORE.LEARNER_KEY),null);
  }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}
});
