import {recordServiceUsage} from './business-metrics.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clock=env=>env.IROHA_TEST_NOW ? Number(env.IROHA_TEST_NOW) : Date.now();
const iso=ms=>new Date(ms).toISOString();
export async function registerClaudeStaffPreview(env,auth,googleRequest) {
  if(!auth.access.staff_access || env.IROHA_ENROLLMENT_ENABLED==='true')throw fail('staff_preview_only',403);
  const metadata=await googleRequest(env,'https://www.googleapis.com/drive/v3/files/1LJP_caa6k9A-v1H7gCBmSpDdZqNQ8A87?fields=id,name,parents,trashed,mimeType,videoMediaMetadata');
  const duration=Number(metadata.videoMediaMetadata?.durationMillis)/1000;
  if(metadata.trashed || !metadata.parents?.includes('1AzKcjCMlT67_LtUzWVQXsZRquo1EhDd_') || metadata.mimeType!=='video/mp4' || !Number.isFinite(duration) || duration<=0)throw fail('preview_media_unavailable',502);
  const detail=JSON.stringify({title:'動画・メモの接続確認（運営専用）',code:'CLA-PREVIEW-01',categoryId:'llm',curriculumTitle:'Claude（確認用）',tool:'Claude',module:'01_基礎',level:'画面確認',videoFileName:metadata.name,estimatedMinutes:Math.ceil(duration/60)});
  await env.DB.prepare('INSERT INTO iroha_delivery_lessons(id,curriculum_key,metadata_json,drive_file_id,parent_folder_id,duration_seconds,sort_order,published,staff_preview) VALUES(?,?,?,?,?,?,1,1,1) ON CONFLICT(id) DO NOTHING')
    .bind('claude-basic-layout-preview','staff:claude-preview',detail,metadata.id,'1AzKcjCMlT67_LtUzWVQXsZRquo1EhDd_',duration).run();
  return {lessonId:'claude-basic-layout-preview'};
}
export async function deliveryCatalog(env,auth) {
  const rows=(await env.DB.prepare('SELECT * FROM iroha_delivery_lessons WHERE published=1 ORDER BY curriculum_key,sort_order,id').all()).results || [];
  const progress=(await env.DB.prepare('SELECT * FROM iroha_lesson_progress WHERE customer_id=?').bind(auth.customer.id).all()).results || [];
  const visible=rows.filter(row=>row.staff_preview ? auth.access.staff_access : (env.IROHA_ENROLLMENT_ENABLED==='true' || auth.access.staff_access));
  return {rows:visible,progress};
}
export function lessonAllowed(rows,progress,id) {
  const target=rows.find(row=>row.id===id);
  if(!target)return false;
  const siblings=rows.filter(row=>row.curriculum_key===target.curriculum_key);
  const index=siblings.findIndex(row=>row.id===id);
  return siblings.slice(0,index).every(row=>progress.some(p=>p.lesson_id===row.id && p.completed_at));
}
export async function requireDeliveryLesson(env,auth,id) {
  const {rows,progress}=await deliveryCatalog(env,auth);
  const lesson=rows.find(row=>row.id===id);
  if(!lesson)throw fail('lesson_not_available',404);
  if(!lessonAllowed(rows,progress,id))throw fail('previous_lesson_required',403);
  return {lesson,progress:progress.find(row=>row.lesson_id===id)};
}
export function memberCatalog(catalog) {
  return {lessons:catalog.rows.map(row=>({...JSON.parse(row.metadata_json),id:row.id,sortOrder:row.sort_order,workflowStatus:'published',folderStage:'delivery',
    videoProvider:'secure_drive',playbackUrl:'/api/totonoe-member/api/curriculum/media/'+encodeURIComponent(row.id),durationSeconds:row.duration_seconds,staffPreview:Boolean(row.staff_preview),
    allowed:lessonAllowed(catalog.rows,catalog.progress,row.id)})),
    progress:Object.fromEntries(catalog.progress.map(p=>[p.lesson_id,{status:p.completed_at?'completed':'in_progress',playbackCompletedAt:p.video_completed_at,completedAt:p.completed_at,
      watchedUntilSeconds:p.watched_until_seconds,badgeEligible:Boolean(p.completed_at && !catalog.rows.find(row=>row.id===p.lesson_id)?.staff_preview)}]))};
}
export async function startPlayback(env,auth,id) {
  const {lesson,progress}=await requireDeliveryLesson(env,auth,id);
  if(!lesson.staff_preview)await recordServiceUsage(env,auth,"curriculum","lesson_start",id);
  const now=clock(env),sessionId=crypto.randomUUID();
  const resume=Math.min(progress?.watched_until_seconds || 0,lesson.duration_seconds);
  await env.DB.prepare('DELETE FROM iroha_playback_sessions WHERE expires_at < ?').bind(iso(now)).run();
  await env.DB.prepare('INSERT INTO iroha_playback_sessions(id,customer_id,lesson_id,position_seconds,watched_until_seconds,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?)')
    .bind(sessionId,auth.customer.id,id,resume,resume,iso(now),iso(now+6*3600000)).run();
  return {sessionId,sequence:0,resumeSeconds:resume,durationSeconds:lesson.duration_seconds,videoCompletedAt:progress?.video_completed_at || null};
}
export async function playbackHeartbeat(env,auth,id,payload) {
  const now=clock(env);
  const session=await env.DB.prepare('SELECT * FROM iroha_playback_sessions WHERE id=? AND customer_id=? AND expires_at>?').bind(id,auth.customer.id,iso(now)).first();
  if(!session)throw fail('playback_session_expired',404);
  const {lesson}=await requireDeliveryLesson(env,auth,session.lesson_id);
  const position=payload?.positionSeconds;
  const replay=payload?.sequence===session.sequence && Math.abs(position-session.position_seconds)<0.01;
  if(!Number.isFinite(position)||position<0||position>lesson.duration_seconds+1||!Number.isSafeInteger(payload?.sequence)||(!replay && payload.sequence!==session.sequence+1))throw fail('invalid_playback_update',409);
  const gap=(now-Date.parse(session.last_seen_at))/1000;
  const elapsed=Math.max(0,Math.min(30,gap));
  if(gap>45 && position>session.watched_until_seconds+0.5)throw fail('playback_connection_lost',409);
  // The browser may revisit watched parts. New parts must advance continuously,
  // at no more than 2x real elapsed time; a hidden or disconnected page cannot
  // claim minutes of playback in a single update.
  if(position>session.watched_until_seconds+0.5 && position-session.position_seconds>elapsed*2+0.5)throw fail('playback_seek_rejected',409);
  const watched=Math.min(lesson.duration_seconds,Math.max(session.watched_until_seconds,position));
  const changed=replay ? {meta:{changes:1}} : await env.DB.prepare('UPDATE iroha_playback_sessions SET position_seconds=?,watched_until_seconds=?,sequence=?,last_seen_at=? WHERE id=? AND customer_id=? AND sequence=?')
    .bind(position,watched,payload.sequence,iso(now),id,auth.customer.id,session.sequence).run();
  if(!changed.meta.changes)throw fail('playback_update_conflict',409);
  const finished=payload.ended===true && position>=lesson.duration_seconds-0.5 && watched>=lesson.duration_seconds-0.5;
  await env.DB.prepare(`INSERT INTO iroha_lesson_progress(customer_id,lesson_id,watched_until_seconds,video_completed_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(customer_id,lesson_id) DO UPDATE SET watched_until_seconds=MAX(iroha_lesson_progress.watched_until_seconds,excluded.watched_until_seconds),
    video_completed_at=COALESCE(iroha_lesson_progress.video_completed_at,excluded.video_completed_at),updated_at=excluded.updated_at`)
    .bind(auth.customer.id,session.lesson_id,watched,finished?iso(now):null,iso(now)).run();
  const record=await env.DB.prepare('SELECT * FROM iroha_lesson_progress WHERE customer_id=? AND lesson_id=?').bind(auth.customer.id,session.lesson_id).first();
  return {sequence:payload.sequence,watchedUntilSeconds:record.watched_until_seconds,videoCompletedAt:record.video_completed_at};
}
export async function completeDeliveryLesson(env,auth,id) {
  const {lesson,progress}=await requireDeliveryLesson(env,auth,id);
  if(!progress?.video_completed_at)throw fail('video_completion_required',409);
  const note=await env.DB.prepare('SELECT takeaway,action FROM iroha_lesson_notes WHERE customer_id=? AND lesson_id=?').bind(auth.customer.id,id).first();
  if(!note?.takeaway.trim()||!note?.action.trim())throw fail('learning_output_required',409);
  await env.DB.prepare('UPDATE iroha_lesson_progress SET completed_at=COALESCE(completed_at,?),updated_at=? WHERE customer_id=? AND lesson_id=?')
    .bind(iso(clock(env)),iso(clock(env)),auth.customer.id,id).run();
  return {completed:true,staffPreview:Boolean(lesson.staff_preview),...memberCatalog(await deliveryCatalog(env,auth))};
}
export async function streamDeliveryLesson(request,env,auth,id,driveToken) {
  const {lesson}=await requireDeliveryLesson(env,auth,id);
  const token=await driveToken(env);
  const fileUrl='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(lesson.drive_file_id);
  const metadataResponse=await fetch(fileUrl+'?fields=id,parents,trashed,mimeType,videoMediaMetadata',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(!metadataResponse.ok)throw fail('lesson_media_unavailable',502);
  const metadata=await metadataResponse.json();
  if(metadata.trashed||!metadata.parents?.includes(lesson.parent_folder_id)||!String(metadata.mimeType).startsWith('video/'))throw fail('lesson_not_available',404);
  const actual=Number(metadata.videoMediaMetadata?.durationMillis)/1000;
  if(!Number.isFinite(actual)||Math.abs(actual-lesson.duration_seconds)>1)throw fail('lesson_media_changed',409);
  const headers=new Headers({authorization:'Bearer '+token});
  const range=request.headers.get('range');
  if(range && !/^bytes=\d*-\d*$/.test(range))throw fail('invalid_range',416);
  if(range)headers.set('range',range);
  // Do not apply a short metadata timeout to the streaming video body.
  const upstream=await fetch(fileUrl+'?alt=media',{headers});
  if(![200,206,416].includes(upstream.status))throw fail('lesson_media_unavailable',502);
  const responseHeaders=new Headers({'content-type':metadata.mimeType,'cache-control':'private, no-store','accept-ranges':'bytes','x-content-type-options':'nosniff'});
  for(const name of ['content-range','content-length'])if(upstream.headers.has(name))responseHeaders.set(name,upstream.headers.get(name));
  return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
}
