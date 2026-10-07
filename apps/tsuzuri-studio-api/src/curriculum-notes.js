export const IROHA_NOTE_HEADERS = ['記録ID','保存日時（JST）','会員ID','会員メール','表示名','レッスンID','分野','カリキュラム','レッスン名','学んだこと・気づいたこと','疑問点','次に試すこと','保存方法','版番号','レッスンURL'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
function text(value, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw fail('invalid_note_text');
  return value;
}
function metadata(payload) {
  return JSON.stringify({ title:text(payload.title,240), category:text(payload.category,120), curriculumTitle:text(payload.curriculumTitle,200) });
}
export function noteForMember(row) {
  if (!row) return null;
  return { lessonId:row.lesson_id, ...JSON.parse(row.metadata_json), takeaway:row.takeaway, doubts:row.doubts, action:row.action,
    revision:row.revision, updatedAt:row.updated_at || row.created_at };
}
export async function getLessonNote(env, customerId, lessonId) {
  if (!validId(lessonId)) throw fail('invalid_lesson_id');
  return noteForMember(await env.DB.prepare('SELECT * FROM iroha_lesson_notes WHERE customer_id = ? AND lesson_id = ?').bind(customerId, lessonId).first());
}
export async function listLessonNotes(env, customerId, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw fail('invalid_offset');
  const rows = (await env.DB.prepare("SELECT * FROM iroha_lesson_notes WHERE customer_id = ? AND (takeaway <> '' OR doubts <> '' OR action <> '') ORDER BY updated_at DESC, lesson_id LIMIT 51 OFFSET ?").bind(customerId,offset).all()).results || [];
  return { notes:rows.slice(0,50).map(noteForMember), nextOffset:rows.length > 50 ? offset+50 : null };
}
export async function saveLessonNote(env, customer, payload) {
  if (!payload || typeof payload !== 'object') throw fail('invalid_note');
  if (!validId(payload.lessonId) || !validId(payload.mutationId)) throw fail('invalid_note_id');
  if (!Number.isSafeInteger(payload.baseRevision) || payload.baseRevision < 0 || payload.baseRevision > 1000000) throw fail('invalid_revision');
  const content = { takeaway:text(payload.takeaway,10000), doubts:text(payload.doubts,10000), action:text(payload.action,10000), metadata_json:metadata(payload) };
  const previousMutation = await env.DB.prepare('SELECT * FROM iroha_lesson_note_revisions WHERE customer_id = ? AND mutation_id = ?').bind(customer.id,payload.mutationId).first();
  if (previousMutation) {
    if (previousMutation.lesson_id !== payload.lessonId || Object.keys(content).some(key => content[key] !== previousMutation[key])) throw fail('mutation_reused',409);
    return { note:noteForMember(previousMutation), eventId:previousMutation.id, replayed:true };
  }
  const current = await env.DB.prepare('SELECT * FROM iroha_lesson_notes WHERE customer_id = ? AND lesson_id = ?').bind(customer.id,payload.lessonId).first();
  if ((current?.revision || 0) !== payload.baseRevision) return { conflict:true, note:noteForMember(current) };
  if (current && Object.keys(content).every(key => content[key] === current[key])) return { note:noteForMember(current), unchanged:true };
  const now = new Date().toISOString();
  const revision = payload.baseRevision + 1;
  const eventId = crypto.randomUUID();
  const kind = payload.saveKind === 'manual' ? 'manual' : 'autosave';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO iroha_lesson_notes(customer_id,lesson_id,metadata_json,takeaway,doubts,action,revision,last_mutation_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(customer_id,lesson_id) DO UPDATE SET
      metadata_json=excluded.metadata_json,takeaway=excluded.takeaway,doubts=excluded.doubts,action=excluded.action,
      revision=excluded.revision,last_mutation_id=excluded.last_mutation_id,updated_at=excluded.updated_at WHERE iroha_lesson_notes.revision=?`)
      .bind(customer.id,payload.lessonId,content.metadata_json,content.takeaway,content.doubts,content.action,revision,payload.mutationId,now,payload.baseRevision),
    env.DB.prepare(`INSERT OR IGNORE INTO iroha_lesson_note_revisions(id,customer_id,lesson_id,email,display_name,metadata_json,takeaway,doubts,action,save_kind,revision,mutation_id,created_at)
      SELECT ?,customer_id,lesson_id,?,?,metadata_json,takeaway,doubts,action,?,revision,?,updated_at
      FROM iroha_lesson_notes WHERE customer_id=? AND lesson_id=? AND last_mutation_id=?`)
      .bind(eventId,customer.email,customer.display_name || '',kind,payload.mutationId,customer.id,payload.lessonId,payload.mutationId),
  ]);
  const event = await env.DB.prepare('SELECT * FROM iroha_lesson_note_revisions WHERE mutation_id = ? AND customer_id = ?').bind(payload.mutationId,customer.id).first();
  if (!event) return { conflict:true, note:await getLessonNote(env,customer.id,payload.lessonId) };
  return { note:noteForMember(event), eventId:event.id };
}
export async function syncLessonNoteSheet(env, googleRequest, eventId = null) {
  const spreadsheetId = env.IROHA_NOTES_SPREADSHEET_ID;
  if (!spreadsheetId) return { status:'pending', synced:0 };
  const rows = (await env.DB.prepare(`SELECT * FROM iroha_lesson_note_revisions WHERE sheet_synced_at IS NULL ${eventId ? 'AND id = ?' : ''} ORDER BY sequence LIMIT 25`)
    .bind(...(eventId ? [eventId] : [])).all()).results || [];
  if (!rows.length) return { status:'synced', synced:0 };
  const sheetName = env.IROHA_NOTES_SHEET_NAME || '受講メモ履歴';
  const qualified = "'"+sheetName.replace(/'/g,"''")+"'!";
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
  const header = await googleRequest(env,base+'/values/'+encodeURIComponent(qualified+'A1:O1'));
  if (IROHA_NOTE_HEADERS.some((title,index) => title !== header.values?.[0]?.[index])) throw fail('iroha_notes_sheet_header_mismatch',503);
  const maxRow = Math.max(...rows.map(row => row.sequence + 1));
  if (maxRow > 1000) {
    const info = await googleRequest(env,base+'?fields=sheets(properties(sheetId,title,gridProperties(rowCount)),filterViews)');
    const sheet = info.sheets?.find(sheet => sheet.properties.title === sheetName);
    const properties = sheet?.properties;
    if (!properties) throw fail('iroha_notes_sheet_missing',503);
    if (maxRow > properties.gridProperties.rowCount) {
      const oldCount = properties.gridProperties.rowCount;
      const length = Math.max(1000,maxRow-oldCount);
      const endRowIndex = oldCount+length;
      const requests = [
        {appendDimension:{sheetId:properties.sheetId,dimension:'ROWS',length}},
        {repeatCell:{range:{sheetId:properties.sheetId,startRowIndex:oldCount,endRowIndex,startColumnIndex:0,endColumnIndex:15},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP'}},fields:'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment'}},
        {repeatCell:{range:{sheetId:properties.sheetId,startRowIndex:oldCount,endRowIndex,startColumnIndex:1,endColumnIndex:2},cell:{userEnteredFormat:{numberFormat:{type:'DATE_TIME',pattern:'yyyy/mm/dd hh:mm:ss'}}},fields:'userEnteredFormat.numberFormat'}},
        ...(sheet.filterViews || []).filter(view => view.title === '受講メモを絞り込む').map(view => ({updateFilterView:{filter:{filterViewId:view.filterViewId,range:{...view.range,endRowIndex}},fields:'range'}})),
      ];
      await googleRequest(env,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
    }
  }
  const data = rows.map(row => {
    const meta = JSON.parse(row.metadata_json);
    const values = [row.id, Date.parse(row.created_at)/86400000+25569+9/24,row.customer_id,row.email,row.display_name,row.lesson_id,
      meta.category,meta.curriculumTitle,meta.title,row.takeaway,row.doubts,row.action,row.save_kind === 'manual' ? '手動保存':'自動保存',row.revision,
      String(env.PUBLIC_SITE_ORIGIN || 'https://basecraftas.com')+'/projects/totonoe/IROHA/lesson.html?id='+encodeURIComponent(row.lesson_id)];
    return { range:qualified+'A'+(row.sequence+1)+':O'+(row.sequence+1), values:[values] };
  });
  const rowChecks = await googleRequest(env,base+'/values:batchGet?'+rows.map(row => 'ranges='+encodeURIComponent(qualified+'A'+(row.sequence+1))).join('&'));
  if (!Array.isArray(rowChecks.valueRanges) || rowChecks.valueRanges.length !== rows.length) throw fail('iroha_notes_sheet_check_failed',503);
  if (rows.some((row,index) => rowChecks.valueRanges[index]?.values?.[0]?.[0] && rowChecks.valueRanges[index].values[0][0] !== row.id)) throw fail('iroha_notes_sheet_row_moved',503);
  // Fixed row positions make retries safe even if Google's response is lost after a successful write.
  await googleRequest(env,base+'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
  await env.DB.batch(rows.map(row => env.DB.prepare('UPDATE iroha_lesson_note_revisions SET sheet_synced_at = ? WHERE id = ?').bind(new Date().toISOString(),row.id)));
  return { status:'synced',synced:rows.length };
}
