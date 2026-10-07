import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadWorker } from './test-support.mjs';
import { IROHA_NOTE_HEADERS, saveLessonNote, syncLessonNoteSheet } from './src/curriculum-notes.js';
const worker = await loadWorker();
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20261002_iroha_lesson_notes.sql','utf8'));
  const prepare = query => {
    let args = [];
    return { bind(...values) { args=values; return this; }, async first() { return sql.prepare(query).get(...args) || null; }, async all() { return {results:sql.prepare(query).all(...args)}; }, async run() { return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}; } };
  };
  const env = {ALLOW_DEV_AUTH:'true',DB:{prepare,async batch(statements) { sql.exec('BEGIN'); try { const result=[]; for(const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; } catch(error) { sql.exec('ROLLBACK'); throw error; } }}};
  for(const [id,email,code] of [['a','a@example.com','curriculum_all_access'],['b','b@example.com','curriculum_all_access'],['weekly','weekly@example.com','weekly_access']]) {
    sql.prepare("INSERT INTO customer_accounts(id,email,status,display_name) VALUES(?,?,'active',?)").run(id,email,id);
    sql.prepare("INSERT INTO customer_entitlements(id,customer_id,entitlement_code,status,starts_at) VALUES(?,?,?,'active','2020-01-01')").run('ent-'+id,id,code);
  }
  async function call(path,email='a@example.com',payload) {
    return worker.fetch(new Request('https://test.local/api/totonoe-member/api/curriculum/notes'+path,{method:payload ? 'POST':'GET',headers:{...(email ? {'x-column-studio-dev-email':email}:{}),...(payload ? {'content-type':'application/json'}:{})},...(payload ? {body:JSON.stringify(payload)}:{})}),env);
  }
  return {sql,env,call};
}
const payload = (overrides = {}) => ({lessonId:'claude-01',mutationId:crypto.randomUUID(),baseRevision:0,title:'Claude 基礎',category:'LLM',curriculumTitle:'Claude',takeaway:'学んだこと',doubts:'疑問点',action:'試すこと',saveKind:'manual',...overrides});

test('受講メモAPIは未認証とTAYORIのみの会員を拒否する',async () => {
  const f=fixture();
  assert.equal((await f.call('','')).status,401);
  assert.equal((await f.call('','weekly@example.com')).status,403);
  assert.equal((await f.call('','weekly@example.com',payload())).status,403);
});
test('会員IDは認証から確定し、同じ動画の他人のメモは取得できない',async () => {
  const f=fixture();
  const saved=await f.call('','a@example.com',payload({customer_id:'b'}));
  assert.equal(saved.status,200);
  assert.equal((await saved.json()).sheetSync,'pending');
  assert.equal((await (await f.call('/claude-01','b@example.com')).json()).note,null);
  assert.equal((await (await f.call('','b@example.com')).json()).notes.length,0);
  assert.equal((await (await f.call('/claude-01')).json()).note.doubts,'疑問点');
  assert.equal(f.sql.prepare('SELECT customer_id FROM iroha_lesson_notes').get().customer_id,'a');
});
test('再送と同じ内容の保存で重複せず、編集履歴を残し、古い版での上書きを防ぐ',async () => {
  const f=fixture(); const first=payload();
  await f.call('','a@example.com',first);
  await f.call('','a@example.com',first);
  await f.call('','a@example.com',payload({baseRevision:1}));
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM iroha_lesson_note_revisions').get().n,1);
  const newer=await f.call('','a@example.com',payload({baseRevision:1,takeaway:'新しいメモ'}));
  assert.equal((await newer.json()).note.revision,2);
  const conflict=await f.call('','a@example.com',payload({baseRevision:1,takeaway:'別端末の古いメモ'}));
  assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).note.takeaway,'新しいメモ');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM iroha_lesson_note_revisions').get().n,2);
});
test('Sheets障害でも本体を保持し、同じ行への再送で重複を作らない。数式を実行しない',async () => {
  const f=fixture(); const p=payload({takeaway:'=IMPORTXML("https://example.com","//x")'});
  await saveLessonNote(f.env,{id:'a',email:'a@example.com'},p);
  f.env.IROHA_NOTES_SPREADSHEET_ID='test-sheet';
  const writes=[]; let storedId=null; let loseResponse=true;
  const google=async (_env,url,init) => {
    if (url.includes('values:batchGet')) return {valueRanges:[{values:storedId ? [[storedId]]:[]}]};
    if (url.includes('/values/')) return {values:[IROHA_NOTE_HEADERS]};
    const body=JSON.parse(init.body); writes.push(body);
    storedId=body.data[0].values[0][0];
    if (loseResponse) { loseResponse=false; throw new Error('lost_response'); }
    return {};
  };
  await assert.rejects(syncLessonNoteSheet(f.env,google),/lost_response/);
  assert.equal(f.sql.prepare('SELECT sheet_synced_at FROM iroha_lesson_note_revisions').get().sheet_synced_at,null);
  assert.equal(f.sql.prepare('SELECT takeaway FROM iroha_lesson_notes').get().takeaway,p.takeaway);
  await syncLessonNoteSheet(f.env,google);
  assert.deepEqual(writes[0],writes[1]);
  assert.equal(writes[1].valueInputOption,'RAW');
  assert.equal(writes[1].data[0].values[0][9],p.takeaway);
  assert.ok(f.sql.prepare('SELECT sheet_synced_at FROM iroha_lesson_note_revisions').get().sheet_synced_at);
});
test('管理シートの行が移動したときは別の記録を上書きしない',async () => {
  const f=fixture();
  await saveLessonNote(f.env,{id:'a',email:'a@example.com'},payload());
  f.env.IROHA_NOTES_SPREADSHEET_ID='test-sheet'; let writes=0;
  await assert.rejects(syncLessonNoteSheet(f.env,async (_env,url) => {
    if(url.includes('values:batchGet')) return {valueRanges:[{values:[['other-event']]}]};
    if(url.includes('/values/')) return {values:[IROHA_NOTE_HEADERS]};
    writes++; return {};
  }),/row_moved/);
  assert.equal(writes,0);
});
test('履歴が増えたら行数と日時書式とフィルタ範囲を拡張する',async () => {
  const f=fixture();
  await saveLessonNote(f.env,{id:'a',email:'a@example.com'},payload());
  f.sql.exec('UPDATE iroha_lesson_note_revisions SET sequence=1000');
  f.env.IROHA_NOTES_SPREADSHEET_ID='test-sheet';
  let expansion; let write;
  await syncLessonNoteSheet(f.env,async (_env,url,init) => {
    if(url.includes('/values/')) return {values:[IROHA_NOTE_HEADERS]};
    if(url.includes('?fields=')) return {sheets:[{properties:{sheetId:1,title:'受講メモ履歴',gridProperties:{rowCount:1000}},filterViews:[{filterViewId:2,title:'受講メモを絞り込む',range:{sheetId:1,startRowIndex:0,endRowIndex:1000,startColumnIndex:0,endColumnIndex:15}}]}]};
    if(url.includes('values:batchGet')) return {valueRanges:[{}]};
    const body=JSON.parse(init.body);
    if(url.endsWith(':batchUpdate') && !url.includes('values:')) expansion=body.requests;
    else write=body;
    return {};
  });
  assert.equal(expansion[0].appendDimension.length,1000);
  assert.equal(expansion[2].repeatCell.cell.userEnteredFormat.numberFormat.type,'DATE_TIME');
  assert.equal(expansion[3].updateFilterView.filter.range.endRowIndex,2000);
  assert.equal(write.data[0].range,"'受講メモ履歴'!A1001:O1001");
});
test('学習履歴ではローカル受講メモを安全なテキストとして見返せる',async () => {
  const root='projects/totonoe/IROHA/';
  const dom=new JSDOM(readFileSync(root+'dashboard.html','utf8'),{url:'http://localhost/dashboard.html?view=history',runScripts:'outside-only'});
  try {
    dom.window.eval(readFileSync(root+'curriculum-store.js','utf8'));
    dom.window.TOTONOE_CURRICULUM_STORE.writeLearnerState({lessonDrafts:{'claude-01':{title:'Claude',takeaway:'<img src=x onerror=alert(1)>',doubts:'疑問点',action:'次に試す',updatedAt:'2026-10-02T00:00:00Z'}}});
    dom.window.eval(readFileSync(root+'lesson-notes.js','utf8'));
    assert.equal(dom.window.document.querySelectorAll('#irohaNotesList details').length,1);
    assert.match(dom.window.document.querySelector('#irohaNotesList').textContent,/疑問点/);
    assert.equal(dom.window.document.querySelector('#irohaNotesList img'),null);
  } finally {dom.window.close();}
});
test('本番画面は別会員のブラウザ内メモを使わず、会員APIから復元して保存する',async () => {
  const root='projects/totonoe/IROHA/';
  const dom=new JSDOM(readFileSync(root+'lesson.html','utf8'),{url:'https://basecraftas.com/projects/totonoe/IROHA/lesson.html?id=gpt-bas-01',runScripts:'outside-only'});
  try {
    dom.window.eval(readFileSync(root+'curriculum-store.js','utf8'));
    const store=dom.window.TOTONOE_CURRICULUM_STORE;
    const admin=store.readAdminState(); admin.lessons=[{...admin.lessons[0],workflowStatus:'published',folderStage:'delivery',providerAssetId:'1AbCdEfGhijKLMnOP'}];store.writeAdminState(admin);
    store.writeLearnerState({lessonDrafts:{'gpt-bas-01':{takeaway:'別会員のローカルメモ'}}});
    let posted;
    dom.window.fetch=async (_url,options) => {
      if(options.method==='POST') {posted=JSON.parse(options.body);return Response.json({note:{...posted,revision:2},sheetSync:'synced'});}
      return Response.json({owner:{id:'a'},note:{lessonId:'gpt-bas-01',takeaway:'本人の保存済みメモ',doubts:'本人の疑問点',action:'試すこと',revision:1}});
    };
    dom.window.eval(readFileSync(root+'lesson-notes.js','utf8'));
    dom.window.eval(readFileSync(root+'lesson.js','utf8'));
    await new Promise(resolve=>setTimeout(resolve,0));
    const form=dom.window.document.querySelector('#completionForm');
    assert.equal(form.elements.takeaway.value,'本人の保存済みメモ');
    form.elements.doubts.value='編集した疑問点';form.elements.doubts.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.document.querySelector('#saveLessonDraft').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(posted.baseRevision,1);assert.equal(posted.doubts,'編集した疑問点');
    assert.match(dom.window.document.querySelector('#lessonDraftStatus').textContent,/管理シートに保存/);
    assert.equal(store.readLearnerState().lessonDrafts['gpt-bas-01'].takeaway,'別会員のローカルメモ');
  } finally {dom.window.close();}
});
