import {validateRecurrence,recurrenceForSave,nextOccurrence,occurrenceId,scheduleChanges,recurrenceWithdrawal} from './gantt-recurrence.js';
import {TEAM_NAMES,normalizeOwners} from './studio-team.js';
import {validateKptLinks} from './gantt-kpt.js';
export const GANTT_CATEGORIES={"たより": "たより（メルマガ・現場実装）", "いろは": "いろは（基礎学習・eラーニング）", "ほどく（仮称）": "ほどく（法人研修・業務診断）", "ねづく（仮称）": "ねづく（スクール・実践コミュニティ）", "つづり": "つづり（コラム）", "つまみ": "つまみ（動画）", "発信・集客": "発信・集客（SNS・セミナー）", "事業全体": "事業全体（運営・基盤）", "将来構想": "将来構想（新しい取り組み）"};
// Shared task board. Authentication is supplied by the existing Studio requireRole.
const statuses=['unconfirmed','planned','ongoing','waiting','done'];
const certainties=['target','tentative','confirmed','undated'];
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export function validateTask(input) {
  if(!input||typeof input!=='object')throw new Error('入力内容を確認してください');
  const task={};
  for(const [key,max] of Object.entries({title:160,service:60,owner:120,notes:3000,dependency:80})){
    if(input[key]!=null&&typeof input[key]!=='string')throw new Error('文字で入力してください');
    task[key]=(input[key]||'').trim();if(task[key].length>max)throw new Error('入力が長すぎます');
  }
  if(!Object.hasOwn(GANTT_CATEGORIES,task.service))throw new Error('カテゴリーを選んでください');
  if(!task.title||!task.service)throw new Error('企画名と分野を入力してください');
  if(!statuses.includes(input.status)||!certainties.includes(input.certainty))throw new Error('状態を選んでください');
  task.status=input.status;task.certainty=input.certainty;
  for(const key of ['start','end']){task[key]=input[key]||'';if(task[key]&&(!/^20\d\d-\d\d-\d\d$/.test(task[key])||!Number.isFinite(Date.parse(task[key]))||new Date(task[key]).toISOString().slice(0,10)!==task[key]))throw new Error('日付を確認してください');}
  if(Boolean(task.start)!==Boolean(task.end)||task.start>task.end)throw new Error('開始日と終了日を確認してください');
  if((task.certainty==='undated')!==!task.start)throw new Error('日程未定は日付を空欄にしてください');
  task.progress=input.progress==null?null:input.progress;
  if(task.progress!==null&&(!Number.isInteger(task.progress)||task.progress<0||task.progress>100))throw new Error('進捗率は0〜100で入力してください');
  if(task.status==='done')task.progress=100;
  if(task.status!=='done'&&task.progress===100)throw new Error('進捗100%は完了を選んでください');
  if(input.collaborators!=null&&(!Array.isArray(input.collaborators)||input.collaborators.length>9||input.collaborators.some(n=>!TEAM_NAMES.includes(n))))throw Error('協力メンバーを確認してください');task.collaborators=[...new Set(input.collaborators||[])].filter(n=>n!==task.owner);
  task.kptLinks=validateKptLinks(input.kptLinks);
  task.recurrence=validateRecurrence(input.recurrence,task);
  return task;
}
export async function ganttRequest(request,env,requireRole,id='') {
  const read=request.method==='GET';
  const auth=await requireRole(request,env,read?['admin','editor','viewer']:['admin','editor']);
  if(auth.error)return auth.error;
  if(read&&!id){const result=await env.DB.prepare('SELECT id, payload, revision, updated_at FROM studio_gantt_tasks ORDER BY created_at, id').all();return reply({tasks:result.results.filter(r=>new URL(request.url).searchParams.get('includeWithdrawn')==='1'||!JSON.parse(r.payload).withdrawnAt).map(r=>({...normalizeOwners(JSON.parse(r.payload)),id:r.id,revision:r.revision,updated_at:r.updated_at}))});}
  if(!['POST','PATCH','DELETE'].includes(request.method))return reply({error:'method_not_allowed'},405);
  if((request.method==='POST'&&id)||(request.method!=='POST'&&!id))return reply({error:'not_found'},404);
  let input;try{const reader=request.body?.getReader();if(!reader)throw Error('empty');let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();return reply({error:'request_too_large'},413)}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'invalid_json'},400)}
  if(request.method!=='POST'&&(!Number.isInteger(input?.revision)||input.revision<1))return reply({error:'revision_required'},400);
  if(request.method==='DELETE'){const existing=await env.DB.prepare('SELECT payload FROM studio_gantt_tasks WHERE id=?').bind(id).first();if(existing&&JSON.parse(existing.payload).recurrence)return reply({message:'繰り返し作業は取り下げ・停止を選んでください。履歴は残ります。'},400);const r=await env.DB.prepare('DELETE FROM studio_gantt_tasks WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE json_extract(payload, \'$.dependency\')=?)').bind(id,input.revision,id).run();return r.meta.changes?reply({ok:true}):reply({error:'conflict',message:'他の更新または後続タスクがあります。再読み込みして確認してください。'},409);}
  if(request.method==='PATCH'&&input.kptLinks===undefined){const existing=await env.DB.prepare('SELECT payload FROM studio_gantt_tasks WHERE id=?').bind(id).first();if(existing)input.kptLinks=JSON.parse(existing.payload).kptLinks||[];}
  const oldRowForRepeat=id?await env.DB.prepare('SELECT payload, revision FROM studio_gantt_tasks WHERE id=?').bind(id).first():null;
  const oldRepeat=oldRowForRepeat?JSON.parse(oldRowForRepeat.payload):null;
  if(request.method==='PATCH'&&input.repeatAction!==undefined){
   if(!oldRowForRepeat||oldRowForRepeat.revision!==input.revision)return reply({message:'他のメンバーが更新しました。再読み込みしてください。'},409);
   const rows=(await env.DB.prepare('SELECT id,payload,revision FROM studio_gantt_tasks').all()).results;
   let plan;try{plan=await recurrenceWithdrawal(rows,id,input.repeatAction,new Date().toISOString());}catch(e){return reply({message:e.message},400);}
   const selected=plan.updated.find(x=>x.row.id===id),strip=t=>{const {id,...p}=t;return JSON.stringify(p);},payload=strip(selected.task),revision=input.revision+1;
   const guards=plan.snapshots.map(()=> 'EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').join(' AND '),args=plan.snapshots.flatMap(r=>[r.id,r.revision,r.payload]);
   const first=env.DB.prepare('UPDATE studio_gantt_tasks SET payload=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND '+guards).bind(payload,auth.email,id,input.revision,...args);
   const rest=plan.updated.filter(x=>x.row.id!==id).map(x=>env.DB.prepare('UPDATE studio_gantt_tasks SET payload=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').bind(strip(x.task),auth.email,x.row.id,x.row.revision,id,revision,payload));
   if(plan.nextTask){const {id:nextId,...p}=plan.nextTask;rest.push(env.DB.prepare('INSERT OR IGNORE INTO studio_gantt_tasks(id,payload,updated_by) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').bind(nextId,JSON.stringify(p),auth.email,id,revision,payload));}
   const results=await env.DB.batch([first,...rest]);if(!results[0].meta.changes)return reply({message:'他のメンバーが更新しました。再読み込みしてください。'},409);
   return reply({task:{...selected.task,revision},updatedTasks:plan.updated.map(x=>({...x.task,revision:x.row.revision+1})),nextTask:plan.nextTask?{...plan.nextTask,revision:1}:null});
  }
  if(oldRepeat?.withdrawnAt)return reply({message:'取り下げ済みの作業は履歴として閲覧できます。'},400);
  if(request.method==='PATCH'&&input.recurrence===undefined&&oldRepeat?.recurrence)input.recurrence=oldRepeat.recurrence;
  let task;try{task=validateTask(input)}catch(e){return reply({error:'invalid_task',message:e.message},400)}
  if(request.method==='PATCH'){const oldRow=await env.DB.prepare('SELECT payload FROM studio_gantt_tasks WHERE id=?').bind(id).first();if(oldRow){const old=JSON.parse(oldRow.payload);if(input.collaborators===undefined)task.collaborators=old.collaborators||[];for(const key of ['kptSourceId','kptSourceTitle','kptDue','kptDone','kptPreviousStatus','kptPreviousProgress','legacyOwner'])if(old[key]!==undefined)task[key]=old[key];if(old.kptSourceId)task.kptLinks=old.kptLinks;if(old.kptLinks?.length){if(old.kptDone){task.status='done';task.progress=100;}else if(task.status==='done')return reply({message:'Tryの達成はKPT画面で更新してください。'},400);}}}
  if(task.dependency){const rows=await env.DB.prepare('SELECT id, payload FROM studio_gantt_tasks').all();const byId=new Map(rows.results.map(r=>[r.id,JSON.parse(r.payload)]));let dep=task.dependency;const seen=new Set([id]);if(!byId.has(dep))return reply({error:'invalid_dependency'},400);while(dep){if(seen.has(dep))return reply({error:'dependency_cycle'},400);seen.add(dep);dep=byId.get(dep)?.dependency;}}
  if(task.recurrence&&(task.kptSourceId||task.kptLinks?.length))return reply({message:'KPTのTryは繰り返しにせず、KPTで管理してください。'},400);
  task.recurrence=recurrenceForSave(task,oldRepeat);
  for(const key of ['repeatNextId','repeatParentId','repeatStopped','repeatStoppedAt'])if(oldRepeat?.[key])task[key]=oldRepeat[key];
  if(request.method==='POST')id=crypto.randomUUID();
  if(request.method==='PATCH'&&(!oldRowForRepeat||oldRowForRepeat.revision!==input.revision))return reply({message:'他のメンバーが更新しました。再読み込みしてください。'},409);
  let following=[];let seriesRows=[];
  if(oldRepeat?.recurrence&&(oldRepeat.start!==task.start||oldRepeat.end!==task.end)){
   seriesRows=(await env.DB.prepare('SELECT id,payload,revision FROM studio_gantt_tasks').all()).results;
   try{following=scheduleChanges(task,{...oldRepeat,id},input.scheduleScope,seriesRows);}catch(e){return reply({message:e.message},400);}
  }
  let next=task.status==='done'?nextOccurrence({...task,id}):null;
  if(next){next.id=await occurrenceId(id);task.repeatNextId=next.id;}
  const payload=JSON.stringify(task),revision=request.method==='POST'?1:input.revision+1;
  const snapshots=following.length?[oldRowForRepeat,...following.map(x=>x.row)]:[];
  const guards=following.length?' AND '+snapshots.map((r,i)=>'EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').join(' AND '):'';
  const guardArgs=following.length?[[id,oldRowForRepeat],...following.map(x=>[x.row.id,x.row])].flatMap(([key,r])=>[key,r.revision,r.payload]):[];
  const write=request.method==='POST'?env.DB.prepare('INSERT INTO studio_gantt_tasks(id,payload,updated_by) VALUES(?,?,?)').bind(id,payload,auth.email):env.DB.prepare('UPDATE studio_gantt_tasks SET payload=?, revision=revision+1, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?'+guards).bind(payload,auth.email,id,input.revision,...guardArgs);
  let result;
  if(following.length){
   const updates=following.map(x=>env.DB.prepare('UPDATE studio_gantt_tasks SET payload=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').bind(JSON.stringify((({id,...t})=>t)(x.task)),auth.email,x.row.id,x.row.revision,id,revision,payload));
   result=(await env.DB.batch([write,...updates]))[0];
  }else if(next){
   const {id:nextId,...nextPayload}=next;
   const insert=env.DB.prepare('INSERT OR IGNORE INTO studio_gantt_tasks(id,payload,updated_by) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM studio_gantt_tasks WHERE id=? AND revision=? AND payload=?)').bind(nextId,JSON.stringify(nextPayload),auth.email,id,revision,payload);
   result=(await env.DB.batch([write,insert]))[0];
  }else result=await write.run();
  if(!result.meta.changes)return reply({message:'他のメンバーが更新しました。再読み込みしてください。'},409);
  if(next)next={...next,revision:1};
  return reply({task:{...task,id,revision},nextTask:next,updatedTasks:following.map(x=>({...x.task,revision:x.row.revision+1})),scheduleScope:input.scheduleScope},request.method==='POST'?201:200);
}
