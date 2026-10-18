export const REPEAT_LABELS={daily:'毎日',weekly:'毎週',biweekly:'2週間ごと',monthly:'毎月'};
const date=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const day=86400000;
export function validateRecurrence(input,task){
 if(input==null||input.frequency==='none')return null;
 if(typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(REPEAT_LABELS,input.frequency))throw Error('繰り返し期間を選んでください。');
 if(!date(task.start)||!date(task.end))throw Error('繰り返す作業には開始日と終了日を設定してください。');
 if(task.kptLinks?.length||task.kptSourceId)throw Error('KPTのTryは繰り返しにせず、KPTで管理してください。');
 const until=input.until||'';if(until&&(!date(until)||until<task.end))throw Error('繰り返しの終了日は今回の終了日以降にしてください。');
 return {frequency:input.frequency,until};
}
export function recurrenceForSave(task,old){
 const requested=task.recurrence;
 if(!requested)return null;
 const same=old?.recurrence&&old.recurrence.frequency===requested.frequency&&old.start===task.start&&old.end===task.end;
 return {...requested,anchorStart:same?old.recurrence.anchorStart:task.start,anchorEnd:same?old.recurrence.anchorEnd:task.end,index:same?old.recurrence.index||0:0};
}
export function nextOccurrence(task){
 const r=task.recurrence;if(!r||task.repeatNextId||task.withdrawnAt||task.repeatStopped)return null;
 const index=(r.index||0)+1,anchor=r.anchorEnd||task.end;
 if(!date(anchor))return null;
 let end;
 if(r.frequency==='monthly'){
  const d=new Date(anchor+'T00:00:00Z'),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+index);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));end=d.toISOString().slice(0,10);
 }else{const interval={daily:1,weekly:7,biweekly:14}[r.frequency];if(!interval)return null;end=new Date(Date.parse(anchor)+interval*index*day).toISOString().slice(0,10);}
 const start=new Date(Date.parse(end)-(Date.parse(r.anchorEnd||task.end)-Date.parse(r.anchorStart||task.start))).toISOString().slice(0,10);
 if(!date(start)||!date(end)||r.until&&end>r.until)return null;
 const {id,revision,updated_at,repeatNextId,repeatParentId,...fields}=task;
 return {...fields,start,end,status:'planned',progress:0,dependency:'',recurrence:{...r,index},repeatParentId:task.id};
}
export async function occurrenceId(parentId){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('gantt-repeat:'+parentId));return 'repeat-'+Array.from(new Uint8Array(bytes)).slice(0,16).map(v=>v.toString(16).padStart(2,'0')).join('');}

// Date-only series edits preserve task content, status and ownership.
export function scheduleChanges(task,old,scope,rows){
 if(!old?.recurrence||old.start===task.start&&old.end===task.end)return [];
 if(!['once','following'].includes(scope))throw Error('日程変更の範囲を選んでください。');
 if(scope==='once'){
  if(task.recurrence?.frequency!==old.recurrence.frequency)throw Error('今回だけの日程変更では、繰り返し期間を変更できません。');
  task.recurrence={...old.recurrence,until:task.recurrence.until};return [];
 }
 if(!task.recurrence)throw Error('日程をまとめて変更する場合は繰り返しを設定してください。');
 const children=[];let current=old;const seen=new Set([old.id]);
 for(;;){
  const found=rows.filter(r=>JSON.parse(r.payload).repeatParentId===current.id);
  const nextId=current.repeatNextId||found[0]?.id;
  if(found.length>1)throw Error('後続の作業が複数あります。個別に確認してください。');
  if(!nextId)break;
  const row=rows.find(r=>r.id===nextId);if(!row||seen.has(nextId))throw Error('後続の作業を確認できません。再読み込みしてください。');
  seen.add(nextId);const next={...JSON.parse(row.payload),id:row.id};
  if(next.status==='done')throw Error('次回以降に完了済みの作業があります。今回だけ変更してください。');
  if(next.kptSourceId||next.kptLinks?.length)throw Error('後続のTryはKPTで管理してください。');
  if(children.length>=49)throw Error('一度に変更できるのは50件までです。');
  children.push({row,task:next});current=next;
 }
 task.recurrence={...task.recurrence,anchorStart:task.start,anchorEnd:task.end,index:0};
 let cursor=task;
 for(const child of children){
  const next=nextOccurrence({...cursor,repeatNextId:undefined});
  if(!next)throw Error('変更後の日程が繰り返し終了日を超えます。終了日を見直してください。');
  child.task={...child.task,start:next.start,end:next.end,recurrence:next.recurrence};cursor=child.task;
 }
 return children;
}

// Soft withdrawal retains history; only ordinary recurring tasks are eligible.
export async function recurrenceWithdrawal(rows,id,action,at){
 if(!['skip','stop'].includes(action))throw Error('取り下げる範囲を選んでください。');
 const byId=new Map(rows.map(r=>[r.id,{...JSON.parse(r.payload),id:r.id}])),selected=byId.get(id);
 if(!selected?.recurrence||selected.kptSourceId||selected.kptLinks?.length)throw Error('通常の繰り返し作業を選んでください。');
 if(selected.withdrawnAt||selected.repeatStopped)throw Error('この作業はすでに取り下げ・停止されています。再読み込みしてください。');
 if(action==='skip'&&selected.status==='done')throw Error('完了済みの作業は取り下げできません。');
 const chain=[],seen=new Set();let current=selected;
 while(current){
  if(seen.has(current.id)||chain.length>=25)throw Error('繰り返し作業のつながりを確認してください。一度に25件までです。');
  seen.add(current.id);chain.push(current);
  const children=[...byId.values()].filter(t=>t.repeatParentId===current.id);
  if(children.length>1)throw Error('次回の作業が複数あるため個別に確認してください。');
  const nextId=current.repeatNextId||children[0]?.id;
  if(nextId&&!byId.has(nextId))throw Error('次回の作業を確認できません。再読み込みしてください。');
  current=nextId?byId.get(nextId):null;
 }
 const updated=[],change=t=>{const row=rows.find(r=>r.id===t.id);updated.push({row,task:t});};let nextTask=null;
 if(action==='skip'){
  let nextId=selected.repeatNextId||chain[1]?.id;
  if(!nextId){nextTask=nextOccurrence(selected);if(nextTask){nextTask.id=await occurrenceId(selected.id);nextId=nextTask.id;}}
  change({...selected,withdrawnAt:at,withdrawalReason:'once',...(nextId?{repeatNextId:nextId}:{})});
 }else{
  for(const t of chain){
   if(t.id!==id&&t.status==='done')continue;
   if(t.kptSourceId||t.kptLinks?.length)throw Error('後続のTryはKPTで管理してください。');
   change({...t,repeatStopped:true,repeatStoppedAt:at,...(t.status==='done'?{}:{withdrawnAt:t.withdrawnAt||at,withdrawalReason:'series'})});
  }
 }
 return {updated,nextTask,snapshots:chain.map(t=>rows.find(r=>r.id===t.id))};
}
