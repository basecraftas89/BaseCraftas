import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import test from 'node:test';
import {loadWorker} from './test-support.mjs';

const worker=await loadWorker();

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260920_billing_dashboard.sql','utf8'));
  function prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
  const env={ALLOW_DEV_AUTH:'true',STRIPE_MODE:'test',CUSTOMER_AUTH_SECRET:'0123456789abcdef0123456789abcdef',DB:{prepare,async batch(items){sql.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}}};
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('admin','owner@example.com','Owner','admin','active')").run();
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('editor','editor@example.com','Editor','editor','active')").run();
  return {sql,env};
}

function call(env,path,method='GET',body=null,email='owner@example.com'){
  return worker.fetch(new Request('https://test.local/api/tsuzuri-studio'+path,{method,headers:{'x-column-studio-dev-email':email,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
}

test('現在の管理者だけを維持し、新規管理者・昇格・管理者停止を拒否する',async()=>{
  const {env}=fixture();
  let response=await call(env,'/api/members','POST',{name:'Second Admin',email:'second@example.com',role:'admin'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'admin_role_locked');
  response=await call(env,'/api/members/editor','PATCH',{role:'admin',status:'active'});
  assert.equal(response.status,409);
  response=await call(env,'/api/members/admin','PATCH',{role:'admin',status:'disabled'});
  assert.equal(response.status,409);
  response=await call(env,'/api/members/admin','PATCH',{role:'editor',status:'active'});
  assert.equal(response.status,409);
});

test('ウェイトリストは公開受付し、受付枠は管理者だけ10名単位で追加できる',async()=>{
  const {sql,env}=fixture();
  const join=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/public/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'wait@example.com',interest:'iroha_corporate',privacy_consent:true,source:'test'})}),env);
  assert.equal(join.status,201);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM waitlist_entries WHERE email='wait@example.com'").get().count,1);
  let response=await call(env,'/api/admin/waitlist');
  assert.equal(response.status,200);
  let data=await response.json();
  assert.equal(data.enrollment.capacity,10);
  assert.equal(data.entries.length,1);
  response=await call(env,'/api/admin/plan-capacity/increase','POST',{plan_code:'weekly_monthly'});
  assert.equal(response.status,200);
  data=await response.json();
  assert.equal(data.capacity,20);
  response=await call(env,'/api/admin/plan-capacity/increase','POST',{plan_code:'weekly_monthly'},'editor@example.com');
  assert.equal(response.status,403);
});

test('課金集計は管理者限定で、人数・当月実績・継続月額を同じ絞り込みで返す',async()=>{
  const {sql,env}=fixture();
  sql.prepare("INSERT INTO customer_accounts(id,email) VALUES('customer_weekly','weekly@example.com')").run();
  sql.prepare("INSERT INTO customer_accounts(id,email) VALUES('customer_iroha','iroha@example.com')").run();
  sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,audience_type,status,provider_subscription_id,recurring_amount_yen,fee_type,livemode) VALUES('sub_weekly','customer_weekly','weekly','monthly','general','active','sub_test_weekly',1480,'none',0)").run();
  sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,audience_type,status,provider_subscription_id,recurring_amount_yen,entry_fee_yen,fee_type,livemode) VALUES('sub_iroha','customer_iroha','curriculum','monthly','therapist','trialing','sub_test_iroha',2980,4800,'first',0)").run();
  sql.prepare("INSERT INTO billing_transactions(id,provider_transaction_id,stripe_invoice_id,stripe_event_id,customer_id,subscription_id,product_code,audience_type,transaction_type,amount_yen,status,occurred_at,livemode) VALUES('tx_recurring','invoice:in_recurring','in_recurring','evt_recurring','customer_weekly','sub_weekly','weekly','general','recurring',1480,'paid','2026-09-05T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO billing_transactions(id,provider_transaction_id,stripe_invoice_id,stripe_event_id,customer_id,subscription_id,product_code,audience_type,transaction_type,amount_yen,status,occurred_at,livemode) VALUES('tx_entry','invoice:in_entry','in_entry','evt_entry','customer_iroha','sub_iroha','curriculum','therapist','entry_fee',4800,'paid','2026-09-06T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO billing_transactions(id,provider_transaction_id,stripe_invoice_id,stripe_event_id,customer_id,subscription_id,product_code,audience_type,transaction_type,amount_yen,status,occurred_at,livemode) VALUES('tx_refund','refund:ch_refund','in_entry','evt_refund','customer_iroha','sub_iroha','curriculum','therapist','refund',-800,'refunded','2026-09-07T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO subscription_status_events(id,stripe_event_id,subscription_id,customer_id,product_code,audience_type,status,effective_at,livemode) VALUES('status_weekly','evt_status_weekly','sub_weekly','customer_weekly','weekly','general','active','2026-08-01T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO subscription_status_events(id,stripe_event_id,subscription_id,customer_id,product_code,audience_type,status,effective_at,livemode) VALUES('status_iroha','evt_status_iroha','sub_iroha','customer_iroha','curriculum','therapist','trialing','2026-09-01T00:00:00Z',0)").run();

  let response=await call(env,'/api/admin/billing-summary?month=2026-09&range=6m');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.environment,'test');
  assert.equal(data.kpis.active_customers,2);
  assert.equal(data.kpis.selected_month_net_yen,5480);
  assert.equal(data.kpis.recurring_monthly_yen,4460);
  assert.equal(data.kpis.trialing_customers,1);
  assert.equal(data.monthly.find((item)=>item.month==='2026-09').refund_yen,-800);
  assert.equal(data.breakdown.find((item)=>item.label==='IROHA 個人').recurring_monthly_yen,2980);

  response=await call(env,'/api/admin/billing-summary?month=2026-09&range=6m','GET',null,'editor@example.com');
  assert.equal(response.status,403);
});

test('Studioに管理者限定の課金画面と実データ未取得時の表示がある',()=>{
  const html=readFileSync('apps/tsuzuri-studio/index.html','utf8');
  const script=readFileSync('apps/tsuzuri-studio/script.js','utf8');
  assert.match(html,/data-view="billing"/);
  assert.match(html,/現在の有効会員/);
  assert.match(html,/当月決済額/);
  assert.match(html,/継続課金予定額/);
  assert.match(html,/月別決済額と会員数/);
  assert.match(script,/\/api\/admin\/billing-summary/);
  assert.match(script,/\/api\/admin\/waitlist/);
  assert.match(html,/10名枠を追加/);
  assert.match(script,/決済履歴はまだありません/);
  assert.doesNotMatch(html,/メンバー・担当マップ|今週のフォーカス|決定ログ/);
});
