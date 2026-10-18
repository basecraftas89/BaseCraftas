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
 const r=task.recurrence;if(!r||task.repeatNextId)return null;
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
