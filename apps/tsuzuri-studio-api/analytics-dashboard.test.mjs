import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import test from 'node:test';
import {loadWorker} from './test-support.mjs';

const worker=await loadWorker();

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20261005_journey_analytics.sql','utf8'));
  sql.exec('CREATE TABLE IF NOT EXISTS customer_subscriptions(id TEXT,provider_subscription_id TEXT,livemode INTEGER);CREATE TABLE IF NOT EXISTS billing_transactions(subscription_id TEXT,livemode INTEGER,status TEXT,amount_yen INTEGER,occurred_at TEXT);');
  function prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
  const env={ALLOW_DEV_AUTH:'true',DB:{prepare},CLOUDFLARE_ANALYTICS_API_TOKEN:'test-token',CLOUDFLARE_ACCOUNT_ID:'account-id',CLOUDFLARE_WEB_ANALYTICS_SITE_TAG:'site-tag'};
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('viewer','viewer@example.com','Viewer','viewer','active')").run();
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('editor','editor@example.com','Editor','editor','active')").run();
  return env;
}

function call(env,path='/api/analytics-summary?start=2026-09-16&end=2026-09-23'){
  return worker.fetch(new Request('https://test.local/api/tsuzuri-studio'+path,{headers:{'x-column-studio-dev-email':'viewer@example.com'}}),env);
}

function callAs(env,path,{email='editor@example.com',method='GET',body}={}){
  return worker.fetch(new Request('https://test.local/api/tsuzuri-studio'+path,{method,headers:{'x-column-studio-dev-email':email,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
}

test('Studioの閲覧者は開始後の自社集計を確認でき、旧Cloudflareデータを混在させない',async()=>{
  const env=fixture();env.ANALYTICS_FETCH=async()=>{throw Error('Legacy analytics must not be fetched');};
  const response=await call(env,'/api/analytics-summary?start=2026-10-01&end=2026-10-05');
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.quality.source,'first_party');assert.equal(data.kpis.visits,0);assert.equal(data.comparison,null);assert.deepEqual(data.links,[]);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('93日を超える計測期間を拒否する',async()=>{
  assert.equal((await call(fixture(),'/api/analytics-summary?start=2026-01-01&end=2026-10-05')).status,400);
});

test('編集者が施策を記録・更新し、閲覧者が期間内の施策を確認できる',async()=>{
  const env=fixture(),payload={occurred_on:'2026-09-19',title:'XでTAYORI紹介投稿',channel:'x',initiative_type:'social_post',destination_path:'/projects/totonoe/tayori',objective:'認知を増やす',hypothesis:'具体例で遷移が増える',primary_owner_id:'kojima-ken',collaborator_ids:['shindo-toshiki'],reference_url:'https://x.com/example/status/1',notes:'個人情報なし',result_status:'partial',learning:'具体例への反応が良かった',next_action:'誘導先を本文に入れる',review_on:'2026-09-26'};
  let response=await callAs(env,'/api/analytics-initiatives',{email:'viewer@example.com',method:'POST',body:payload});
  assert.equal(response.status,403);
  response=await callAs(env,'/api/analytics-initiatives',{method:'POST',body:payload});
  assert.equal(response.status,201);
  const created=(await response.json()).initiative;
  assert.equal(created.title,payload.title);
  assert.equal(created.primary_owner_id,'kojima-ken');
  assert.deepEqual(created.collaborator_ids,['shindo-toshiki']);
  assert.equal(created.result_status,'partial');
  response=await call(env,'/api/analytics-initiatives?start=2026-09-16&end=2026-09-23');
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).initiatives.map((item)=>item.id),[created.id]);
  response=await callAs(env,'/api/analytics-initiatives/'+created.id,{method:'PATCH',body:{title:'X投稿を更新',notes:'結果確認中'}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).initiative.title,'X投稿を更新');
  response=await callAs(env,'/api/analytics-initiatives/'+created.id,{method:'PATCH',body:{reference_url:'javascript:alert(1)'}});
  assert.equal(response.status,400);
});

test('Studio本体にアクセス解析の統合画面と期間指定がある',()=>{
  const html=readFileSync('apps/tsuzuri-studio/index.html','utf8');
  const script=readFileSync('apps/tsuzuri-studio/script.js','utf8');
  assert.match(html,/data-view="analytics"/);
  assert.match(html,/どのページを経て、どこへ進んだか/);
  assert.match(html,/id="analyticsRange"/);
  assert.match(html,/id="analyticsStart"/);
  assert.match(html,/id="analyticsEnd"/);
  assert.match(html,/何日に、どの媒体から来たか/);
  assert.match(html,/data-action="export-analytics-csv"/);
  assert.match(html,/data-action="new-analytics-initiative"/);
  assert.match(html,/id="analyticsInitiativeForm"/);
  assert.match(html,/id="analyticsHeatmap"/);
  assert.match(html,/id="analyticsOwnerFilter"/);
  assert.match(html,/id="analyticsInitiativePrimaryOwner"/);
  assert.match(html,/id="analyticsInitiativeLearning"/);
  assert.match(script,/\/api\/analytics-summary/);
  assert.match(script,/\/api\/analytics-initiatives/);
  assert.match(script,/analyticsSample/);
  assert.match(script,/totonoe-traffic-/);
  assert.match(script,/totonoe-initiatives-/);
  assert.match(script,/\/api\/totonoe-studio/);
});
