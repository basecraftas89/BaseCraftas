import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolveBillingQuote,assertStripeTestConfiguration,verifyStripeWebhook} from './src/billing.js';
import {normalizeCustomerEmail,hashAuthValue,timingSafeTextEqual,buildStripeCheckoutParams} from './src/customer-auth.js';
import {loadWorker} from './test-support.mjs';

const worker=await loadWorker();

function stripeFixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260918_customer_email_auth.sql','utf8'));
  function prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
  const secret='whsec_tayori_test';
  const objects=new Map();
  const env={CUSTOMER_AUTH_SECRET:'0123456789abcdef0123456789abcdef',STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:secret,DB:{prepare,async batch(items){sql.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}},MEDIA:{async put(key,bytes,metadata){objects.set(key,{bytes,metadata});},async get(key){const value=objects.get(key);return value?{body:value.bytes}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}}};
  sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES('customer_tayori','tayori@example.com',CURRENT_TIMESTAMP)").run();
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,campaign_code,trial_days,recurring_amount_yen,entry_fee_yen,status,stripe_checkout_session_id) VALUES('attempt_tayori','customer_tayori','checkout:customer_tayori:test','weekly_monthly','general','none','none',0,980,0,'pending','cs_test_tayori')").run();
  async function send(event){
    const body=JSON.stringify(event);const timestamp=Math.floor(Date.now()/1000);const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
    return worker.fetch(new Request('https://test.local/api/totonoe-member/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`},body}),env);
  }
  return {sql,env,send,objects};
}

const qualificationPng=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64'));

test('料金はサーバー定義からだけ決まり、クライアント指定金額を使用しない',()=>{
  const quote=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'rejoin',recurringAmountYen:1,entryFeeAmountYen:1});
  assert.equal(quote.recurringAmountYen,2980);
  assert.equal(quote.entryFeeAmountYen,10000);
  assert.equal(quote.firstChargeAmountYen,12980);
  assert.deepEqual(quote.entitlementCodes,['curriculum_all_access','weekly_access']);
  assert.throws(()=>resolveBillingQuote({planCode:'weekly_monthly',feeType:'first'}),/weekly_has_no_entry_fee/);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_annual',feeType:'none'}),/curriculum_fee_required/);
});

test('初回入会は月額を初月に請求せず、お試し価格は入会費5000円だけを請求する',()=>{
  const standard=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'first'});
  assert.equal(standard.firstChargeAmountYen,50000);
  assert.equal(standard.trialPeriodDays,30);
  const campaign=resolveBillingQuote({
    planCode:'curriculum_monthly',
    audienceType:'therapist',
    feeType:'first',
    campaignCode:'trial_entry_5000',
  });
  assert.equal(campaign.entryFeeAmountYen,5000);
  assert.equal(campaign.firstChargeAmountYen,5000);
  assert.equal(campaign.trialPeriodDays,30);
  assert.equal(campaign.entryFeePriceEnv,'STRIPE_PRICE_ENTRY_CAMPAIGN_TRIAL');
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'first',campaignCode:'trial_entry_5000'}),/campaign_not_applicable/);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_monthly',feeType:'rejoin',campaignCode:'trial_entry_5000'}),/campaign_not_applicable/);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_annual',feeType:'first',campaignCode:'trial_entry_5000'}),/campaign_not_applicable/);
});

test('第1段階ではStripeテストキーだけを許可する',()=>{
  assert.doesNotThrow(()=>assertStripeTestConfiguration({STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_example'}));
  assert.throws(()=>assertStripeTestConfiguration({STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example'}),/stripe_test_mode_required/);
  assert.throws(()=>assertStripeTestConfiguration({STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example'}),/stripe_test_secret_missing/);
});

test('Stripe署名は生本文・時刻・HMACを検証してからJSONを返す',async()=>{
  const secret='whsec_test_secret';
  const timestamp=1789092000;
  const body=JSON.stringify({id:'evt_test_123',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_test'}}});
  const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
  const verified=await verifyStripeWebhook(body,`t=${timestamp},v1=${signature}`,secret,{nowSeconds:timestamp});
  assert.equal(verified.event.id,'evt_test_123');
  await assert.rejects(()=>verifyStripeWebhook(body+' ',`t=${timestamp},v1=${signature}`,secret,{nowSeconds:timestamp}),/invalid_stripe_signature/);
  await assert.rejects(()=>verifyStripeWebhook(body,`t=${timestamp},v1=${signature}`,secret,{nowSeconds:timestamp+301}),/stale_stripe_signature/);
});

test('D1にWebhook冪等性とCheckout試行の制約を追加する',()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.prepare("INSERT INTO customer_accounts(id,email) VALUES('customer_1','member@example.com')").run();
  sql.prepare("INSERT INTO stripe_webhook_events(event_id,event_type,livemode) VALUES('evt_1','invoice.paid',0)").run();
  assert.throws(()=>sql.prepare("INSERT INTO stripe_webhook_events(event_id,event_type,livemode) VALUES('evt_1','invoice.paid',0)").run());
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen) VALUES('attempt_1','customer_1','checkout_1','curriculum_monthly','general','first',2980,50000)").run();
  assert.throws(()=>sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen) VALUES('attempt_2','customer_1','checkout_1','curriculum_monthly','general','first',2980,50000)").run());
});

test('認証情報は正規化し、用途別HMACで照合する',async()=>{
  assert.equal(normalizeCustomerEmail(' User@Example.COM '),'user@example.com');
  assert.throws(()=>normalizeCustomerEmail('invalid-address'),/invalid_email/);
  const secret='0123456789abcdef0123456789abcdef';
  const first=await hashAuthValue(secret,'otp:challenge_1','123456');
  const same=await hashAuthValue(secret,'otp:challenge_1','123456');
  const other=await hashAuthValue(secret,'session','123456');
  assert.equal(timingSafeTextEqual(first,same),true);
  assert.equal(timingSafeTextEqual(first,other),false);
});

test('CheckoutパラメータはサーバーPrice IDとセラピスト初回30日無料だけから組み立てる',()=>{
  const quote=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'first',campaignCode:'trial_entry_5000'});
  const params=buildStripeCheckoutParams({
    quote,
    env:{STRIPE_PRICE_CURRICULUM_MONTHLY:'price_monthly123',STRIPE_PRICE_ENTRY_CAMPAIGN_TRIAL:'price_entry123'},
    customer:{id:'customer_1',email:'member@example.com',stripe_customer_id:null},
    attemptId:'attempt_1',
    successUrl:'https://basecraftas.com/success',
    weirdClientAmount:1,
    cancelUrl:'https://basecraftas.com/cancel',
  });
  assert.equal(params.get('line_items[0][price]'),'price_monthly123');
  assert.equal(params.get('line_items[1][price]'),'price_entry123');
  assert.equal(params.get('subscription_data[trial_period_days]'),'30');
  assert.equal(params.get('customer_email'),'member@example.com');
  assert.equal(params.get('metadata[attempt_id]'),'attempt_1');
});

test('顧客認証テーブルとCheckout URL監査列を追加する',()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260918_customer_email_auth.sql','utf8'));
  sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES('customer_auth_1','verified@example.com',CURRENT_TIMESTAMP)").run();
  sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('session_1','customer_auth_1','hash_1',datetime('now','+30 days'))").run();
  sql.prepare("INSERT INTO customer_auth_challenges(id,email,code_hash,request_key,expires_at) VALUES('challenge_1','verified@example.com','hash','request',datetime('now','+10 minutes'))").run();
  const columns=sql.prepare("PRAGMA table_info(stripe_checkout_attempts)").all().map((column)=>column.name);
  assert.equal(columns.includes('checkout_url'),true);
});

test('資格画像は非公開R2に保存され、管理者審査後だけセラピスト認証になる',async()=>{
  const fixture=stripeFixture();
  fixture.env.ALLOW_DEV_AUTH='true';
  fixture.sql.prepare("INSERT INTO members(id,email,role,status) VALUES('admin_qualification','admin@example.com','admin','active')").run();
  const token='qualification-session-token';
  const tokenHash=await hashAuthValue(fixture.env.CUSTOMER_AUTH_SECRET,'session',token);
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('session_qualification','customer_tayori',?,datetime('now','+30 days'))").run(tokenHash);

  const form=new FormData();
  form.append('applicant_name','山田 太郎');
  form.append('profession','理学療法士');
  form.append('privacy_consent','accepted');
  form.append('file',new File([qualificationPng],'license.png',{type:'image/png'}));
  const submitted=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/qualification',{method:'POST',headers:{cookie:`totonoe_session=${token}`},body:form}),fixture.env);
  assert.equal(submitted.status,201);
  const submittedBody=await submitted.json();
  assert.equal(submittedBody.submission.status,'pending');
  assert.equal(Object.hasOwn(submittedBody.submission,'private_r2_object_key'),false);
  assert.equal(fixture.objects.size,1);
  assert.equal(fixture.sql.prepare("SELECT therapist_status FROM customer_accounts WHERE id='customer_tayori'").get().therapist_status,'pending');

  const status=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/qualification',{headers:{cookie:`totonoe_session=${token}`}}),fixture.env);
  const statusBody=await status.json();
  assert.equal(statusBody.submission.status,'pending');
  assert.equal(JSON.stringify(statusBody).includes('private_r2_object_key'),false);

  const adminHeaders={'x-column-studio-dev-email':'admin@example.com'};
  const listed=await worker.fetch(new Request('https://test.local/api/tsuzuri-studio/api/admin/qualifications',{headers:adminHeaders}),fixture.env);
  assert.equal(listed.status,200);
  const listBody=await listed.json();
  assert.equal(listBody.submissions.length,1);
  assert.equal(JSON.stringify(listBody).includes('private_r2_object_key'),false);
  const image=await worker.fetch(new Request(`https://test.local/api/tsuzuri-studio/api/admin/qualifications/${submittedBody.submission.id}/image`,{headers:adminHeaders}),fixture.env);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('cache-control'),'private, no-store');

  fixture.env.RESEND_API_KEY='re_test_qualification';
  fixture.env.RESEND_FROM_EMAIL='ToToNoE+ <no-reply@auth.basecraftas.com>';
  const originalFetch=globalThis.fetch;let emailPayload;
  let reviewed;
  try{
    globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.resend.com/emails');emailPayload=JSON.parse(init.body);return new Response(JSON.stringify({id:'email_qualification'}),{status:200,headers:{'content-type':'application/json'}});};
    reviewed=await worker.fetch(new Request(`https://test.local/api/tsuzuri-studio/api/admin/qualifications/${submittedBody.submission.id}`,{method:'PATCH',headers:{...adminHeaders,'content-type':'application/json'},body:JSON.stringify({status:'verified',review_note:'確認済み'})}),fixture.env);
  }finally{globalThis.fetch=originalFetch;}
  assert.equal(reviewed.status,200);
  assert.equal((await reviewed.json()).notification_sent,true);
  assert.match(emailPayload.subject,/資格確認が完了/);
  assert.equal(fixture.sql.prepare("SELECT therapist_status FROM customer_accounts WHERE id='customer_tayori'").get().therapist_status,'verified');
  assert.equal(fixture.sql.prepare("SELECT display_name FROM customer_accounts WHERE id='customer_tayori'").get().display_name,'山田 太郎');
  assert.ok(fixture.sql.prepare("SELECT purge_after FROM qualification_submissions WHERE id=?").get(submittedBody.submission.id).purge_after);
});

test('TAYORI LPは問い合わせではなくメール認証付き月額980円Checkoutへ進む',()=>{
  const html=readFileSync('projects/totonoe/weekly.html','utf8');
  const script=readFileSync('projects/totonoe/tayori-checkout.js','utf8');
  assert.match(html,/data-tayori-checkout/);
  assert.match(html,/月額980円/);
  assert.match(html,/入会金なし/);
  assert.doesNotMatch(html,/href="\.\.\/\.\.\/contact\.html" class="btn btn-cta">個人で購読する/);
  assert.match(script,/plan_code:\s*"weekly_monthly"/);
  assert.match(script,/customer\/auth\/request-code/);
  assert.match(script,/customer\/auth\/verify-code/);
});

test('署名済みTAYORI Checkout完了通知だけが契約とWeekly権限を付与し、重複通知は安全に無視する',async()=>{
  const fixture=stripeFixture();
  const event={id:'evt_tayori_complete',object:'event',type:'checkout.session.completed',livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_test_tayori',object:'checkout.session',mode:'subscription',status:'complete',customer:'cus_tayori',subscription:'sub_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  const response=await fixture.send(event);
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'processed');
  const subscription=fixture.sql.prepare("SELECT product_code,billing_interval,status,recurring_amount_yen,provider_subscription_id FROM customer_subscriptions WHERE customer_id='customer_tayori'").get();
  assert.deepEqual({...subscription},{product_code:'weekly',billing_interval:'monthly',status:'active',recurring_amount_yen:980,provider_subscription_id:'sub_tayori'});
  assert.equal(fixture.sql.prepare("SELECT status FROM customer_entitlements WHERE customer_id='customer_tayori' AND entitlement_code='weekly_access'").get().status,'active');
  assert.equal(fixture.sql.prepare("SELECT status FROM stripe_checkout_attempts WHERE id='attempt_tayori'").get().status,'completed');
  const duplicate=await fixture.send(event);
  assert.equal((await duplicate.json()).duplicate,true);
  assert.equal(fixture.sql.prepare("SELECT COUNT(*) count FROM customer_subscriptions").get().count,1);
});

test('解約WebhookはTAYORI権限を失効し、無効署名とlive通知は拒否する',async()=>{
  const fixture=stripeFixture();
  const complete={id:'evt_tayori_seed',object:'event',type:'checkout.session.completed',livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_test_tayori',mode:'subscription',status:'complete',customer:'cus_tayori',subscription:'sub_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  assert.equal((await fixture.send(complete)).status,200);
  const deleted={id:'evt_tayori_deleted',object:'event',type:'customer.subscription.deleted',livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:'sub_tayori',status:'canceled',customer:'cus_tayori',canceled_at:Math.floor(Date.now()/1000),metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  assert.equal((await fixture.send(deleted)).status,200);
  assert.equal(fixture.sql.prepare("SELECT status FROM customer_subscriptions WHERE provider_subscription_id='sub_tayori'").get().status,'canceled');
  assert.equal(fixture.sql.prepare("SELECT status FROM customer_entitlements WHERE customer_id='customer_tayori' AND entitlement_code='weekly_access'").get().status,'revoked');

  const body=JSON.stringify({...deleted,id:'evt_bad_signature'});
  const invalid=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':'t=1789092000,v1='+'0'.repeat(64)},body}),fixture.env);
  assert.equal(invalid.status,400);
  const live={...deleted,id:'evt_live_rejected',livemode:true};
  assert.equal((await fixture.send(live)).status,400);
});

test('認証済み会員だけが自分のStripe Customer Portalを作成できる',async()=>{
  const fixture=stripeFixture();
  const authSecret='0123456789abcdef0123456789abcdef';
  const sessionToken='session-token-for-tayori-member';
  const tokenHash=await hashAuthValue(authSecret,'session',sessionToken);
  fixture.env.CUSTOMER_AUTH_SECRET=authSecret;
  fixture.env.STRIPE_SECRET_KEY='sk_test_portal';
  fixture.env.PUBLIC_SITE_ORIGIN='https://basecraftas.com';
  fixture.sql.prepare("UPDATE customer_accounts SET stripe_customer_id='cus_tayori' WHERE id='customer_tayori'").run();
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('session_tayori','customer_tayori',?,datetime('now','+1 day'))").run(tokenHash);
  fixture.sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,status,provider_subscription_id,recurring_amount_yen,fee_type) VALUES('subscription_tayori','customer_tayori','weekly','monthly','active','sub_tayori',980,'none')").run();
  const originalFetch=globalThis.fetch;
  let portalParams;
  globalThis.fetch=async(input,init={})=>{
    assert.equal(String(input),'https://api.stripe.com/v1/billing_portal/sessions');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer sk_test_portal');
    portalParams=new URLSearchParams(String(init.body));
    return new Response(JSON.stringify({id:'bps_tayori',object:'billing_portal.session',livemode:false,url:'https://billing.stripe.com/p/session/test_TAYORI123'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const request=new Request('https://test.local/api/totonoe-member/api/customer/billing/portal',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin',cookie:`totonoe_session=${sessionToken}`},body:'{}'});
    const response=await worker.fetch(request,fixture.env);
    assert.equal(response.status,201);
    assert.equal((await response.json()).portal_url,'https://billing.stripe.com/p/session/test_TAYORI123');
    assert.equal(portalParams.get('customer'),'cus_tayori');
    assert.equal(portalParams.get('return_url'),'https://basecraftas.com/projects/totonoe/IROHA/mypage.html?billing=returned');
  }finally{globalThis.fetch=originalFetch;}

  const unauthenticated=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/portal',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin'},body:'{}'}),fixture.env);
  assert.equal(unauthenticated.status,401);
});

test('会員画面は再ログインと契約管理の導線を備える',()=>{
  const weekly=readFileSync('projects/totonoe/TAYORI/index.html','utf8');
  const login=readFileSync('projects/totonoe/TAYORI/login.html','utf8');
  const loginScript=readFileSync('projects/totonoe/TAYORI/login.js','utf8');
  const mypage=readFileSync('projects/totonoe/IROHA/mypage.html','utf8');
  const mypageScript=readFileSync('projects/totonoe/IROHA/mypage.js','utf8');
  assert.match(weekly,/登録メールでログイン/);
  assert.match(weekly,/href="\.\.\/IROHA\/dashboard\.html"/);
  assert.match(weekly,/href="\.\.\/IROHA\/mypage\.html"/);
  assert.doesNotMatch(weekly,/href="\.\.\/curriculum\//);
  assert.match(login,/memberLoginEmailForm/);
  assert.match(loginScript,/\/request-code/);
  assert.match(loginScript,/\/verify-code/);
  assert.match(mypage,/manageBillingButton/);
  assert.match(mypage,/data-requires-curriculum/);
  assert.match(mypageScript,/customer\/billing\/portal/);
  assert.match(mypageScript,/customer\/auth\/logout/);
});

test('公開サービス導線はLPに入り、購入者ページは会員区分で保護される',()=>{
  const home=readFileSync('projects/totonoe/index.html','utf8');
  const service=readFileSync('projects/totonoe/service.html','utf8');
  const tayoriLp=readFileSync('projects/totonoe/weekly.html','utf8');
  const irohaLp=readFileSync('projects/totonoe/IROHA/index.html','utf8');
  const dashboard=readFileSync('projects/totonoe/IROHA/dashboard.html','utf8');
  const mypage=readFileSync('projects/totonoe/IROHA/mypage.html','utf8');
  const shell=readFileSync('projects/totonoe/IROHA/member-shell.js','utf8');
  const loginScript=readFileSync('projects/totonoe/TAYORI/login.js','utf8');

  assert.match(home,/href="weekly\.html" class="btn btn-ghost">詳細・料金を見る/);
  assert.match(service,/href="weekly\.html" class="btn btn-ghost">詳細・料金を見る/);
  assert.doesNotMatch(home,/href="TAYORI\/"/);
  assert.doesNotMatch(service,/href="TAYORI\/"/);
  assert.match(tayoriLp,/TAYORI\/login\.html\?return=%2Fprojects%2Ftotonoe%2FTAYORI%2F/);
  assert.match(irohaLp,/TAYORI\/login\.html\?return=%2Fprojects%2Ftotonoe%2FIROHA%2Fdashboard\.html/);
  assert.doesNotMatch(irohaLp,/href="dashboard\.html"/);
  assert.match(dashboard,/<html lang="ja" class="member-access-pending">/);
  assert.match(dashboard,/data-page-entitlement="curriculum"/);
  assert.match(mypage,/data-page-entitlement="member"/);
  assert.match(shell,/required === "curriculum" \? access\.has_curriculum_access/);
  assert.match(shell,/access\.has_weekly_access \|\| access\.has_curriculum_access/);
  assert.ok(loginScript.includes('TAYORI\\/(?:index\\.html)?'));
  assert.ok(loginScript.includes('IROHA\\/(?:mypage|dashboard|lesson)\\.html'));
});
