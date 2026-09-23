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
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('admin_primary','kansai89414@gmail.com','神藤 俊希','admin','active')").run();
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('admin_workspace','toshiki.kanto.workspace@gmail.com','神藤 俊希','admin','active')").run();
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('editor','editor@example.com','Editor','editor','active')").run();
  return {sql,env};
}

function call(env,path,method='GET',body=null,email='kansai89414@gmail.com'){
  return worker.fetch(new Request('https://test.local/api/tsuzuri-studio'+path,{method,headers:{'x-column-studio-dev-email':email,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
}

test('指定された2アカウントだけを固定管理者として維持する',async()=>{
  const {sql,env}=fixture();
  let response=await call(env,'/api/members','POST',{name:'Second Admin',email:'second@example.com',role:'admin'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'admin_role_locked');
  response=await call(env,'/api/members/editor','PATCH',{role:'admin',status:'active'});
  assert.equal(response.status,409);
  response=await call(env,'/api/members/admin_primary','PATCH',{role:'admin',status:'disabled'});
  assert.equal(response.status,409);
  response=await call(env,'/api/members/admin_workspace','PATCH',{role:'editor',status:'active'});
  assert.equal(response.status,409);
  assert.deepEqual(sql.prepare("SELECT email FROM members WHERE role='admin' AND status='active' ORDER BY email").all().map((row)=>row.email),['kansai89414@gmail.com','toshiki.kanto.workspace@gmail.com']);
});

test('管理者マイグレーションは指定2アカウントを有効化し、旧管理者を編集者へ戻す',()=>{
  const {sql}=fixture();
  sql.prepare("INSERT INTO members(id,email,name,role,status) VALUES('legacy_admin','legacy@example.com','Legacy','admin','active')").run();
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260922_fixed_admin_accounts.sql','utf8'));
  assert.equal(sql.prepare("SELECT role FROM members WHERE id='legacy_admin'").get().role,'editor');
  assert.deepEqual(sql.prepare("SELECT email FROM members WHERE role='admin' AND status='active' ORDER BY email").all().map((row)=>row.email),['kansai89414@gmail.com','toshiki.kanto.workspace@gmail.com']);
});

test('ウェイトリストは人数上限なしで公開受付し、管理者一覧に反映する',async()=>{
  const {sql,env}=fixture();
  for(let index=0;index<12;index+=1){
    const join=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/public/waitlist',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':`203.0.113.${index+1}`},body:JSON.stringify({email:`wait${index}@example.com`,interest:'tayori_personal',privacy_consent:true,source:'test'})}),env);
    assert.equal(join.status,201);
  }
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM waitlist_entries WHERE interest='tayori_personal'").get().count,12);
  const response=await call(env,'/api/admin/waitlist');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.entries.length,12);
  assert.equal('enrollment' in data,false);
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

test('テスト表示リセットはテスト課金データだけを削除し、本番・顧客・ウェイトリスト・監査履歴を保持する',async()=>{
  const {sql,env}=fixture();
  sql.prepare("INSERT INTO customer_accounts(id,email) VALUES('customer_test','test@example.com')").run();
  sql.prepare("INSERT INTO customer_accounts(id,email) VALUES('customer_live','live@example.com')").run();
  sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,audience_type,status,provider_subscription_id,recurring_amount_yen,fee_type,livemode) VALUES('sub_test','customer_test','weekly','monthly','general','active','sub_test_reset',980,'none',0)").run();
  sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,audience_type,status,provider_subscription_id,recurring_amount_yen,fee_type,livemode) VALUES('sub_live','customer_live','weekly','monthly','general','active','sub_live_keep',980,'none',1)").run();
  sql.prepare("INSERT INTO customer_entitlements(id,customer_id,entitlement_code,source_subscription_id,status,starts_at) VALUES('ent_test','customer_test','weekly_access','sub_test','active','2026-09-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO customer_entitlements(id,customer_id,entitlement_code,source_subscription_id,status,starts_at) VALUES('ent_live','customer_live','weekly_access','sub_live','active','2026-09-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO billing_transactions(id,provider_transaction_id,stripe_event_id,customer_id,subscription_id,product_code,audience_type,transaction_type,amount_yen,status,occurred_at,livemode) VALUES('tx_test','invoice:test','evt_test','customer_test','sub_test','weekly','general','recurring',980,'paid','2026-09-05T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO billing_transactions(id,provider_transaction_id,stripe_event_id,customer_id,subscription_id,product_code,audience_type,transaction_type,amount_yen,status,occurred_at,livemode) VALUES('tx_live','invoice:live','evt_live','customer_live','sub_live','weekly','general','recurring',980,'paid','2026-09-05T00:00:00Z',1)").run();
  sql.prepare("INSERT INTO subscription_status_events(id,stripe_event_id,subscription_id,customer_id,product_code,audience_type,status,effective_at,livemode) VALUES('status_test','evt_test','sub_test','customer_test','weekly','general','active','2026-09-01T00:00:00Z',0)").run();
  sql.prepare("INSERT INTO subscription_status_events(id,stripe_event_id,subscription_id,customer_id,product_code,audience_type,status,effective_at,livemode) VALUES('status_live','evt_live','sub_live','customer_live','weekly','general','active','2026-09-01T00:00:00Z',1)").run();
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen,livemode,status) VALUES('attempt_test','customer_test','reset:test','weekly_monthly','general','none',980,0,0,'completed')").run();
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen,livemode,status) VALUES('attempt_live','customer_live','reset:live','weekly_monthly','general','none',980,0,1,'completed')").run();
  sql.prepare("INSERT INTO plan_capacity_reservations(id,plan_code,customer_id,checkout_attempt_id,status,expires_at) VALUES('reservation_test','weekly_monthly','customer_test','attempt_test','converted','2026-09-30T00:00:00Z')").run();
  sql.prepare("INSERT INTO stripe_webhook_events(event_id,event_type,livemode,status) VALUES('evt_test_audit','checkout.session.completed',0,'processed')").run();
  sql.prepare("INSERT INTO waitlist_entries(id,email,interest,status,source,consent_at) VALUES('wait_keep','wait@example.com','tayori_personal','waiting','test','2026-09-01T00:00:00Z')").run();

  let response=await call(env,'/api/admin/billing-test-data/reset','POST',{},'editor@example.com');
  assert.equal(response.status,403);
  env.STRIPE_MODE='live';
  response=await call(env,'/api/admin/billing-test-data/reset','POST',{});
  assert.equal(response.status,409);
  env.STRIPE_MODE='test';
  response=await call(env,'/api/admin/billing-test-data/reset','POST',{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.deleted.subscriptions,1);
  assert.equal(data.deleted.transactions,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM customer_subscriptions WHERE livemode=0").get().count,0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM customer_subscriptions WHERE livemode=1").get().count,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM customer_accounts").get().count,2);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM waitlist_entries").get().count,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM stripe_webhook_events WHERE event_id='evt_test_audit'").get().count,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM customer_entitlements WHERE id='ent_live'").get().count,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='billing.test_data.reset'").get().count,1);
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
  assert.match(html,/テスト表示をリセット/);
  assert.match(script,/\/api\/admin\/billing-test-data\/reset/);
  assert.match(script,/本番データ、顧客アカウント、ウェイトリスト、コンテンツ/);
  assert.doesNotMatch(html,/TAYORI受付枠|10名枠を追加|enrollmentCapacity/);
  assert.doesNotMatch(script,/plan-capacity|increaseCapacity|enrollmentCapacity/);
  assert.match(script,/決済履歴はまだありません/);
  assert.doesNotMatch(html,/メンバー・担当マップ|今週のフォーカス|決定ログ/);
});

test('管理メニューは全権限で場所を確認でき、操作は管理者だけに制限する',()=>{
  const html=readFileSync('apps/tsuzuri-studio/index.html','utf8');
  const script=readFileSync('apps/tsuzuri-studio/script.js','utf8');
  for(const view of ['members','billing','settings']) assert.match(html,new RegExp(`class="nav-item admin-nav-item"[^>]+data-view="${view}"`));
  assert.match(script,/この画面は管理者専用です。管理者アカウントで再ログインしてください。/);
});
