import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import test from 'node:test';
import {loadWorker} from './test-support.mjs';

const worker=await loadWorker();

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
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

test('Studioの閲覧者が期間指定したCloudflare流入・入口・ページ遷移を確認できる',async()=>{
  const env=fixture();
  let requestBody;
  env.ANALYTICS_FETCH=async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return new Response(JSON.stringify({data:{viewer:{accounts:[{
      entries:[
        {dimensions:{date:'2026-09-16',refererHost:'',requestPath:'/projects/totonoe/'},sum:{visits:5}},
        {dimensions:{date:'2026-09-23',refererHost:'chatgpt.com',requestPath:'/projects/totonoe/tsuzuri/article/'},sum:{visits:2}},
      ],
      previousEntries:[
        {dimensions:{refererHost:'',requestPath:'/projects/totonoe/'},sum:{visits:4}},
        {dimensions:{refererHost:'youtube.com',requestPath:'/projects/totonoe/tsumami/'},sum:{visits:1}},
      ],
      journeys:[
        {count:4,dimensions:{refererPath:'/projects/totonoe/',requestPath:'/projects/totonoe/tayori'}},
        {count:2,dimensions:{refererPath:'/projects/totonoe/tayori',requestPath:'/projects/totonoe/tayori'}},
      ],
      daily:[{dimensions:{date:'2026-09-16'},sum:{visits:3}},{dimensions:{date:'2026-09-23'},sum:{visits:4}}],
    }]}}}),{headers:{'content-type':'application/json'}});
  };
  const response=await call(env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.kpis,{visits:7,identified_visits:2,direct_visits:5,ai_visits:2});
  assert.deepEqual(data.comparison.kpis,{visits:5,identified_visits:1,direct_visits:4,ai_visits:0});
  assert.equal(data.comparison.start,'2026-09-08');
  assert.equal(data.comparison.end,'2026-09-15');
  assert.equal(data.sources.find((item)=>item.label==='ChatGPT').visits,2);
  assert.equal(data.landings.find((item)=>item.path==='/projects/totonoe/').visits,5);
  assert.deepEqual(data.entries[1],{date:'2026-09-23',referer_host:'chatgpt.com',source:'ChatGPT',request_path:'/projects/totonoe/tsuzuri/article/',landing_page:'TSUZURI記事：article',visits:2});
  assert.deepEqual(data.journeys,[{from_path:'/projects/totonoe/',from_label:'ToToNoE+ トップ',to_path:'/projects/totonoe/tayori',to_label:'たより｜TAYORI',count:4}]);
  assert.equal(data.daily.length,8);
  assert.equal(data.daily[1].visits,0);
  assert.equal(requestBody.variables.start,'2026-09-16');
  assert.equal(requestBody.variables.previousStart,'2026-09-08');
  assert.match(requestBody.query,/previousEntries/);
  assert.match(requestBody.query,/refererPath requestPath/);
  assert.match(requestBody.query,/dimensions\{date refererHost requestPath\}/);
  assert.equal(response.headers.get('cache-control'),'private, max-age=300');
});

test('Analytics設定不足と93日を超える期間を拒否する',async()=>{
  const env=fixture();
  delete env.CLOUDFLARE_ANALYTICS_API_TOKEN;
  let response=await call(env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'analytics_not_configured');
  env.CLOUDFLARE_ANALYTICS_API_TOKEN='test-token';
  response=await call(env,'/api/analytics-summary?start=2026-01-01&end=2026-09-23');
  assert.equal(response.status,400);
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
