import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolveBillingQuote,addCalendarMonthsUtc,assertStripeTestConfiguration,verifyStripeWebhook} from './src/billing.js';
import {normalizeCustomerEmail,hashAuthValue,timingSafeTextEqual,buildStripeCheckoutParams,resolveIrohaFirstPromotion,createStripeCheckoutSession,cancelReplacedTayoriSubscription} from './src/customer-auth.js';
import {loadWorker} from './test-support.mjs';

const worker=await loadWorker();

function stripeFixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('apps/tsuzuri-studio-api/schema.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260918_customer_email_auth.sql','utf8'));
  sql.exec(readFileSync('apps/tsuzuri-studio-api/migrations/20260920_billing_dashboard.sql','utf8'));
  function prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
  const secret='whsec_tayori_test';
  const objects=new Map();
  const env={CUSTOMER_AUTH_SECRET:'0123456789abcdef0123456789abcdef',STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:secret,DB:{prepare,async batch(items){sql.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}},MEDIA:{async put(key,bytes,metadata){objects.set(key,{bytes,metadata});},async get(key){const value=objects.get(key);return value?{body:value.bytes}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}}};
  sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES('customer_tayori','tayori@example.com',CURRENT_TIMESTAMP)").run();
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,campaign_code,trial_days,recurring_amount_yen,entry_fee_yen,status,stripe_checkout_session_id) VALUES('attempt_tayori','customer_tayori','checkout:customer_tayori:test','weekly_monthly','general','none','none',14,980,0,'pending','cs_test_tayori')").run();
  async function send(event){
    const body=JSON.stringify(event);const timestamp=Math.floor(Date.now()/1000);const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
    return worker.fetch(new Request('https://test.local/api/totonoe-member/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`},body}),env);
  }
  return {sql,env,send,objects};
}

const qualificationPng=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64'));

test('IROHA加入でTAYORIを即時解約し、通知の再送・逆順でも二重契約と権限復活を防ぐ',async()=>{
  const f=stripeFixture();
  f.env.STRIPE_SECRET_KEY='sk_test_replacement';
  const created=Math.floor(Date.now()/1000);
  const complete=(id,attempt,plan,subscription)=>({id,object:'event',type:'checkout.session.completed',livemode:false,created,data:{object:{id:`cs_test_${attempt}`,mode:'subscription',status:'complete',customer:'cus_member',subscription,metadata:{attempt_id:attempt,customer_id:'customer_tayori',plan_code:plan}}}});
  assert.equal((await f.send(complete('evt_weekly','attempt_tayori','weekly_monthly','sub_weekly'))).status,200);
  f.sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,trial_days,recurring_amount_yen,entry_fee_yen,status) VALUES('attempt_iroha','customer_tayori','iroha-upgrade','curriculum_monthly','general','first',90,2980,5000,'pending')").run();
  const original=globalThis.fetch;let deletes=0;let fail=true;
  const stripeSub={id:'sub_weekly',object:'subscription',livemode:false,status:'active',metadata:{customer_id:'customer_tayori',plan_code:'weekly_monthly'}};
  globalThis.fetch=async(url,init={})=>{
    assert.equal(String(url),'https://api.stripe.com/v1/subscriptions/sub_weekly');
    if(fail)return Response.json({error:{code:'api_error'}},{status:503});
    if(init.method==='DELETE'){
      deletes++;assert.equal(init.body.get('invoice_now'),'false');assert.equal(init.body.get('prorate'),'false');
      return Response.json({...stripeSub,status:'canceled',canceled_at:created});
    }
    return Response.json(stripeSub);
  };
  try {
    const upgrade=complete('evt_iroha','attempt_iroha','curriculum_monthly','sub_iroha');
    assert.equal((await f.send(upgrade)).status,502);
    assert.equal(f.sql.prepare("SELECT status FROM subscription_replacements").get().status,'pending');
    fail=false;
    assert.equal((await f.send(upgrade)).status,200);
    assert.equal((await f.send(upgrade)).status,200);
    assert.equal(deletes,1);
    assert.equal(f.sql.prepare("SELECT status FROM customer_subscriptions WHERE product_code='weekly'").get().status,'canceled');
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM customer_entitlements WHERE source_subscription_id='subscription_attempt_iroha' AND status='active'").get().n,2);
    const late={id:'evt_late_weekly',object:'event',type:'customer.subscription.updated',livemode:false,created:created-1,data:{object:{...stripeSub,customer:'cus_member',metadata:{...stripeSub.metadata,attempt_id:'attempt_tayori'}}}};
    assert.equal((await f.send(late)).status,200);
    const paid={id:'evt_late_invoice',object:'event',type:'invoice.paid',livemode:false,created,data:{object:{id:'in_old_weekly',parent:{subscription_details:{subscription:'sub_weekly'}},amount_paid:980,currency:'jpy',billing_reason:'subscription_cycle'}}};
    assert.equal((await f.send(paid)).status,200);
    assert.equal(f.sql.prepare("SELECT status FROM customer_subscriptions WHERE product_code='weekly'").get().status,'canceled');
    assert.equal(f.sql.prepare("SELECT status FROM customer_entitlements WHERE source_subscription_id='subscription_attempt_tayori'").get().status,'revoked');
    const token='upgrade_guard';const hash=await hashAuthValue(f.env.CUSTOMER_AUTH_SECRET,'session',token);
    f.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('guard','customer_tayori',?,datetime('now','+1 day'))").run(hash);
    f.env.STRIPE_CHECKOUT_ENABLED='true';f.env.TAYORI_DIRECT_ENROLLMENT_ENABLED='true';
    const guarded=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local',cookie:`totonoe_session=${token}`},body:JSON.stringify({plan_code:'weekly_monthly',request_id:'123e4567-e89b-12d3-a456-426614174000'})}),f.env);
    assert.equal(guarded.status,409);assert.equal((await guarded.json()).error,'tayori_included_in_iroha');
    const deleted={id:'evt_iroha_end',object:'event',type:'customer.subscription.deleted',livemode:false,created,data:{object:{id:'sub_iroha',status:'canceled',customer:'cus_member',metadata:{attempt_id:'attempt_iroha',customer_id:'customer_tayori',plan_code:'curriculum_monthly'}}}};
    assert.equal((await f.send(deleted)).status,200);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM customer_subscriptions WHERE status IN ('active','trialing')").get().n,0);
  } finally {globalThis.fetch=original;f.sql.close();}
});

test('IROHA未成立ではTAYORIを止めず、加入後に届いたTAYORI完了通知も解約対象にする',async()=>{
  const f=stripeFixture();f.env.STRIPE_SECRET_KEY='sk_test_replacement';
  f.sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,trial_days,recurring_amount_yen,entry_fee_yen,status) VALUES('attempt_iroha','customer_tayori','iroha-late','curriculum_monthly','general','first',90,2980,5000,'pending')").run();
  const created=Math.floor(Date.now()/1000);
  const event=(id,type,object)=>({id,object:'event',type,livemode:false,created,data:{object}});
  const meta={attempt_id:'attempt_iroha',customer_id:'customer_tayori',plan_code:'curriculum_monthly'};
  assert.equal((await f.send(event('evt_incomplete','customer.subscription.created',{id:'sub_iroha',status:'incomplete',metadata:meta}))).status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_replacements').get().n,0);
  assert.equal((await f.send(event('evt_join','customer.subscription.updated',{id:'sub_iroha',status:'trialing',metadata:meta}))).status,200);
  assert.equal(f.sql.prepare('SELECT status FROM subscription_replacements').get().status,'pending');
  assert.equal((await f.send(event('evt_end','customer.subscription.deleted',{id:'sub_iroha',status:'canceled',metadata:meta}))).status,200);
  const original=globalThis.fetch;let deleted=0;
  globalThis.fetch=async(url,init={})=>{
    assert.equal(String(url),'https://api.stripe.com/v1/subscriptions/sub_late');
    if(init.method==='DELETE')deleted++;
    return Response.json({id:'sub_late',livemode:false,status:init.method==='DELETE'?'canceled':'trialing',metadata:{customer_id:'customer_tayori',plan_code:'weekly_monthly'}});
  };
  try {
    const response=await f.send(event('evt_late','checkout.session.completed',{id:'cs_test_tayori',mode:'subscription',status:'complete',subscription:'sub_late',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}));
    assert.equal(response.status,200);assert.equal(deleted,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM customer_subscriptions WHERE status != 'canceled'").get().n,0);
  } finally {globalThis.fetch=original;f.sql.close();}
});

test('自動解約は同一会員のTAYORIだけを対象とし、すでに解約済みなら再度削除しない',async()=>{
  const original=globalThis.fetch;const env={STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_replacement'};
  try {
    for(const metadata of [{customer_id:'other',plan_code:'weekly_monthly'},{customer_id:'member',plan_code:'curriculum_monthly'}]){
      globalThis.fetch=async(_url,init={})=>{assert.notEqual(init.method,'DELETE');return Response.json({id:'sub_test',livemode:false,status:'active',metadata});};
      await assert.rejects(cancelReplacedTayoriSubscription(env,'sub_test','member'),/stripe_replacement_verification_failed/);
    }
    globalThis.fetch=async(_url,init={})=>{assert.notEqual(init.method,'DELETE');return Response.json({id:'sub_test',livemode:false,status:'canceled',metadata:{customer_id:'member',plan_code:'weekly_monthly'}});};
    assert.equal((await cancelReplacedTayoriSubscription(env,'sub_test','member')).status,'canceled');
  } finally {globalThis.fetch=original;}
});

test('料金はサーバー定義からだけ決まり、クライアント指定金額を使用しない',()=>{
  const quote=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'rejoin',recurringAmountYen:1,entryFeeAmountYen:1});
  assert.equal(quote.recurringAmountYen,2980);
  assert.equal(quote.entryFeeAmountYen,0);
  assert.equal(quote.firstChargeAmountYen,2980);
  assert.deepEqual(quote.entitlementCodes,['curriculum_all_access','weekly_access']);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'first'}).entryFeeAmountYen,0);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'first'}).entryFeeAmountYen,0);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'rejoin'}).entryFeeAmountYen,0);
  const weeklyGeneral=resolveBillingQuote({planCode:'weekly_monthly',audienceType:'general'});
  const weeklyTherapist=resolveBillingQuote({planCode:'weekly_monthly',audienceType:'therapist'});
  assert.equal(weeklyGeneral.recurringAmountYen,980);
  assert.equal(weeklyGeneral.recurringPriceEnv,'STRIPE_PRICE_TAYORI_MONTHLY');
  assert.equal(weeklyGeneral.firstChargeAmountYen,0);
  assert.equal(weeklyGeneral.trialPeriodDays,14);
  assert.equal(weeklyTherapist.recurringAmountYen,980);
  assert.equal(weeklyTherapist.recurringPriceEnv,'STRIPE_PRICE_TAYORI_MONTHLY');
  assert.equal(weeklyTherapist.firstChargeAmountYen,0);
  assert.equal(weeklyTherapist.trialPeriodDays,14);
  assert.throws(()=>resolveBillingQuote({planCode:'weekly_monthly',feeType:'first'}),/weekly_has_no_entry_fee/);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_annual',feeType:'none'}),/invalid_plan/);
});

test('IROHA初回・再入会ともに入会費なしで月額のみ請求する',()=>{
  const general=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'first'});
  assert.equal(general.recurringAmountYen,2980);
  assert.equal(general.entryFeeAmountYen,0);
  assert.equal(general.firstChargeAmountYen,0);
  assert.equal(general.trialPeriodDays,30);
  const therapist=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'first'});
  assert.equal(therapist.recurringAmountYen,2980);
  assert.equal(therapist.entryFeeAmountYen,0);
  assert.equal(therapist.firstChargeAmountYen,0);
  assert.equal(therapist.trialPeriodDays,30);
  assert.equal(therapist.entryFeePriceEnv,null);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'general',feeType:'rejoin'}).entryFeeAmountYen,0);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'first',campaignCode:'trial_entry_5000'}),/invalid_campaign/);
});

test('IROHA初回コードだけが申込時から3暦月無料になり、月末も正しく扱う',()=>{
  const start=Date.parse('2026-01-31T12:34:56.000Z');
  assert.equal(addCalendarMonthsUtc(start,3),Date.parse('2026-04-30T12:34:56.000Z')/1000);
  assert.equal(addCalendarMonthsUtc(Date.parse('2027-11-30T00:00:00.000Z'),3),Date.parse('2028-02-29T00:00:00.000Z')/1000);
  const promoted=resolveBillingQuote({planCode:'curriculum_monthly',feeType:'first',campaignCode:'iroha_first_waiver_5000',nowMs:start});
  assert.equal(promoted.trialEndSeconds,Date.parse('2026-04-30T12:34:56.000Z')/1000);
  assert.equal(promoted.entryFeeAmountYen,0);
  assert.equal(promoted.campaignCode,'iroha_first_waiver_5000');
  assert.ok(promoted.trialPeriodDays>=89 && promoted.trialPeriodDays<=92);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',feeType:'first',nowMs:start}).trialPeriodDays,30);
  assert.equal(resolveBillingQuote({planCode:'curriculum_monthly',feeType:'rejoin',nowMs:start}).trialPeriodDays,0);
  assert.throws(()=>resolveBillingQuote({planCode:'curriculum_monthly',feeType:'rejoin',campaignCode:'iroha_first_waiver_5000',nowMs:start}),/campaign_not_applicable/);
});

test('IROHAは職種共通プランとし、申込APIは準備中の月額設定だけに限定する',()=>{
  const workerSource=readFileSync('apps/tsuzuri-studio-api/src/worker.js','utf8');
  const configSource=readFileSync('projects/totonoe/IROHA/curriculum-config.js','utf8');
  assert.match(workerSource,/\["weekly_monthly", "curriculum_monthly"\]\.includes\(planCode\)/);
  assert.doesNotMatch(workerSource,/\["weekly_monthly", "curriculum_monthly", "curriculum_annual"\]\.includes\(planCode\)/);
  assert.match(configSource,/monthly:\s*2980/);
  assert.doesNotMatch(configSource,/annual:/);
  assert.throws(()=>resolveBillingQuote({planCode:"curriculum_annual",feeType:"first"}),/invalid_plan/);
  assert.match(configSource,/first:\s*0/);
  assert.match(configSource,/rejoin:\s*0/);
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
  sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen) VALUES('attempt_1','customer_1','checkout_1','curriculum_monthly','general','first',2980,48000)").run();
  assert.throws(()=>sql.prepare("INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,recurring_amount_yen,entry_fee_yen) VALUES('attempt_2','customer_1','checkout_1','curriculum_monthly','general','first',2980,48000)").run());
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

test('CheckoutパラメータはサーバーPrice IDとプラン別の無料期間だけから組み立てる',()=>{
  const quote=resolveBillingQuote({planCode:'curriculum_monthly',audienceType:'therapist',feeType:'first'});
  const params=buildStripeCheckoutParams({
    quote,
    env:{STRIPE_PRICE_CURRICULUM_MONTHLY:'price_monthly123',STRIPE_PRICE_IROHA_FIRST:'price_entry123'},
    customer:{id:'customer_1',email:'member@example.com',stripe_customer_id:null},
    attemptId:'attempt_1',
    successUrl:'https://basecraftas.com/success',
    weirdClientAmount:1,
    cancelUrl:'https://basecraftas.com/cancel',
  });
  assert.equal(params.get('line_items[0][price]'),'price_monthly123');
  assert.equal(params.get('line_items[1][price]'),null);
  assert.equal(params.get('subscription_data[trial_period_days]'),'30');
  assert.equal(params.get('customer_email'),'member@example.com');
  assert.equal(params.get('metadata[attempt_id]'),'attempt_1');

  const tayoriQuote=resolveBillingQuote({planCode:'weekly_monthly',audienceType:'general'});
  const tayoriParams=buildStripeCheckoutParams({
    quote:tayoriQuote,
    env:{STRIPE_PRICE_TAYORI_MONTHLY:'price_weekly123'},
    customer:{id:'customer_2',email:'tayori@example.com',stripe_customer_id:null},
    attemptId:'attempt_2',
    successUrl:'https://basecraftas.com/tayori/success',
    cancelUrl:'https://basecraftas.com/tayori/cancel',
  });
  assert.equal(tayoriParams.get('line_items[0][price]'),'price_weekly123');
  assert.equal(tayoriParams.get('allow_promotion_codes'),'true');
  assert.equal(params.get('allow_promotion_codes'),null);
  assert.equal(tayoriParams.get('subscription_data[trial_period_days]'),'14');
  assert.equal(tayoriParams.get('payment_method_collection'),'always');
  assert.equal(tayoriParams.get('payment_method_types[0]'),'card');
});

test('IROHA初回免除コードはIROHA初回にのみ適用し、TAYORI購入歴は制限に使わない',()=>{
  const env={IROHA_FIRST_PROMOTION_CODE:'IROHA-START',IROHA_FIRST_PROMOTION_ID:'promo_entry123',STRIPE_PRICE_CURRICULUM_MONTHLY:'price_monthly123',STRIPE_PRICE_IROHA_FIRST:'price_entry123'};
  const promotionCodeId=resolveIrohaFirstPromotion({code:'iroha-start',planCode:'curriculum_monthly',feeType:'first',env});
  assert.equal(promotionCodeId,'promo_entry123');
  const quote=resolveBillingQuote({planCode:'curriculum_monthly',feeType:'first',campaignCode:'iroha_first_waiver_5000',nowMs:Date.parse('2026-01-31T12:34:56.000Z')});
  const params=buildStripeCheckoutParams({quote,env,customer:{id:'customer_1',email:'member@example.com'},attemptId:'attempt_1',successUrl:'https://basecraftas.com/success',cancelUrl:'https://basecraftas.com/cancel',promotionCodeId,appliedCampaignCode:'iroha_first_waiver_5000'});
  assert.equal(params.get('discounts[0][promotion_code]'),null);
  assert.equal(params.get('subscription_data[trial_end]'),String(Date.parse('2026-04-30T12:34:56.000Z')/1000));
  assert.equal(params.get('subscription_data[trial_period_days]'),null);
  assert.equal(params.get('metadata[campaign_code]'),'iroha_first_waiver_5000');
  assert.equal(params.get('payment_method_collection'),'always');
  assert.throws(()=>resolveIrohaFirstPromotion({code:'IROHA-START',planCode:'curriculum_monthly',feeType:'rejoin',env}),/promotion_not_applicable/);
  assert.throws(()=>resolveIrohaFirstPromotion({code:'IROHA-START',planCode:'weekly_monthly',feeType:'none',env}),/promotion_not_applicable/);
  assert.throws(()=>resolveIrohaFirstPromotion({code:'WRONG-CODE',planCode:'curriculum_monthly',feeType:'first',env}),/invalid_promotion_code/);
  assert.throws(()=>resolveIrohaFirstPromotion({code:{value:'IROHA-START'},planCode:'curriculum_monthly',feeType:'first',env}),/invalid_promotion_code/);
  assert.throws(()=>resolveIrohaFirstPromotion({code:'IROHA-START',planCode:'curriculum_monthly',feeType:'first',env:{}}),/iroha_promotion_not_ready/);
  assert.throws(()=>buildStripeCheckoutParams({quote:resolveBillingQuote({planCode:'curriculum_monthly',feeType:'rejoin'}),env:{...env,STRIPE_PRICE_IROHA_REJOIN:'price_entry123'},customer:{id:'customer_1',email:'member@example.com'},attemptId:'attempt_2',successUrl:'https://basecraftas.com/success',cancelUrl:'https://basecraftas.com/cancel',promotionCodeId}),/promotion_not_applicable/);
});

test('ライブCheckoutはライブ鍵とライブSessionを照合し、決済情報の収集を必須にする',async()=>{
  const quote=resolveBillingQuote({planCode:'weekly_monthly'});
  const params=buildStripeCheckoutParams({quote,env:{STRIPE_PRICE_TAYORI_MONTHLY:'price_live123'},customer:{id:'customer_live',email:'live@example.com'},attemptId:'attempt_live',successUrl:'https://basecraftas.com/success',cancelUrl:'https://basecraftas.com/cancel'});
  assert.equal(params.get('payment_method_collection'),'always');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{
    assert.match(new Headers(init.headers).get('authorization'),/^Bearer (?:sk|rk)_live_/);
    return Response.json({id:'cs_live_123',livemode:true,url:'https://checkout.stripe.com/c/pay/cs_live_123'});
  };
  try{
    await assert.rejects(createStripeCheckoutSession({STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_test_wrong'},params,'checkout:live:test'),/stripe_secret_mode_mismatch/);
    assert.equal((await createStripeCheckoutSession({STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_example'},params,'checkout:live:test')).id,'cs_live_123');
    assert.equal((await createStripeCheckoutSession({STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_example'},params,'checkout:live:restricted')).id,'cs_live_123');
  }finally{globalThis.fetch=originalFetch;}
});

test('ライブ決済の受付は別の準備フラグがない限り閉じる',async()=>{
  const fixture=stripeFixture();
  fixture.env.STRIPE_MODE='live';
  fixture.env.STRIPE_CHECKOUT_ENABLED='true';
  const response=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin'},body:'{}'}),fixture.env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'stripe_live_not_ready');
});

test('TAYORIの公開受付状態は会員APIから取得でき、準備中はfalseを返す',async()=>{
  const fixture=stripeFixture();
  const response=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/public/tayori-enrollment-status'),fixture.env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{enabled:false,mode:'test'});
});

test('ライブ署名通知はライブ試用権限だけを有効化し、テスト通知は拒否する',async()=>{
  const fixture=stripeFixture();
  fixture.env.STRIPE_MODE='live';
  fixture.sql.prepare("UPDATE stripe_checkout_attempts SET livemode=1,stripe_checkout_session_id='cs_live_tayori' WHERE id='attempt_tayori'").run();
  const live={id:'evt_live_tayori',object:'event',type:'checkout.session.completed',livemode:true,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_live_tayori',mode:'subscription',status:'complete',customer:'cus_live_tayori',subscription:'sub_live_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  const rejected=await fixture.send({...live,id:'evt_test_mismatch',livemode:false});
  assert.equal(rejected.status,400);
  const accepted=await fixture.send(live);
  assert.equal(accepted.status,200);
  assert.equal(fixture.sql.prepare("SELECT status,livemode FROM customer_subscriptions WHERE provider_subscription_id='sub_live_tayori'").get().status,'trialing');
  assert.equal(fixture.sql.prepare("SELECT livemode FROM customer_subscriptions WHERE provider_subscription_id='sub_live_tayori'").get().livemode,1);
  assert.equal(fixture.sql.prepare("SELECT status FROM customer_entitlements WHERE customer_id='customer_tayori' AND entitlement_code='weekly_access'").get().status,'active');
});

test('TAYORI直接申込は本人確認後、個別案内なしで14日間無料のCheckoutを作成する',async()=>{
  const fixture=stripeFixture();
  const token='test_customer_session_token';
  const hash=await hashAuthValue(fixture.env.CUSTOMER_AUTH_SECRET,'session',token);
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('tayori_signup_session','customer_tayori',?,datetime('now','+1 day'))").run(hash);
  fixture.env.STRIPE_CHECKOUT_ENABLED='true';
  fixture.env.STRIPE_SECRET_KEY='sk_test_checkout';
  fixture.env.STRIPE_PRICE_TAYORI_MONTHLY='price_weekly123';
  fixture.env.PUBLIC_SITE_ORIGIN='https://basecraftas.com';
  const requestId='123e4567-e89b-12d3-a456-426614174000';
  const checkout=()=>worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin',cookie:`totonoe_session=${token}`},body:JSON.stringify({plan_code:'weekly_monthly',request_id:requestId})}),fixture.env);
  let response=await checkout();
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'tayori_invitation_required');
  fixture.env.TAYORI_DIRECT_ENROLLMENT_ENABLED='true';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{
    const params=new URLSearchParams(String(init.body));
    assert.equal(params.get('payment_method_collection'),'always');
    assert.equal(params.get('subscription_data[trial_period_days]'),'14');
    return Response.json({id:'cs_test_tayori_signup',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_tayori_signup'});
  };
  try{
    response=await checkout();
    assert.equal(response.status,201);
    assert.match((await response.json()).checkout_url,/checkout\.stripe\.com/);
    assert.equal(fixture.sql.prepare("SELECT livemode FROM stripe_checkout_attempts WHERE stripe_checkout_session_id='cs_test_tayori_signup'").get().livemode,0);
    const attempt=fixture.sql.prepare("SELECT id FROM stripe_checkout_attempts WHERE stripe_checkout_session_id='cs_test_tayori_signup'").get();
    const event={id:'evt_signup_completed',object:'event',type:'checkout.session.completed',livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_test_tayori_signup',mode:'subscription',status:'complete',customer:'cus_signup',subscription:'sub_signup',metadata:{attempt_id:attempt.id,customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
    assert.equal((await fixture.send(event)).status,200);
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS count FROM waitlist_entries").get().count,0);
    assert.equal(fixture.sql.prepare("SELECT status FROM customer_subscriptions WHERE provider_subscription_id='sub_signup'").get().status,'trialing');
  }finally{globalThis.fetch=originalFetch;}
});

test('本番Checkoutは既存のテスト用Stripe顧客IDを再利用しない',async()=>{
  const fixture=stripeFixture();
  const token='live_customer_session_token';
  const hash=await hashAuthValue(fixture.env.CUSTOMER_AUTH_SECRET,'session',token);
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('live_signup_session','customer_tayori',?,datetime('now','+1 day'))").run(hash);
  fixture.sql.prepare("UPDATE customer_accounts SET stripe_customer_id='cus_test_only' WHERE id='customer_tayori'").run();
  fixture.sql.prepare("UPDATE stripe_checkout_attempts SET stripe_customer_id='cus_test_only', status='completed' WHERE id='attempt_tayori'").run();
  Object.assign(fixture.env,{STRIPE_MODE:'live',STRIPE_LIVE_READY:'true',STRIPE_CHECKOUT_ENABLED:'true',TAYORI_DIRECT_ENROLLMENT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_checkout',STRIPE_PRICE_TAYORI_MONTHLY:'price_liveweekly',PUBLIC_SITE_ORIGIN:'https://basecraftas.com'});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{
    const params=new URLSearchParams(String(init.body));
    assert.equal(params.get('customer'),null);
    assert.equal(params.get('customer_email'),'tayori@example.com');
    assert.equal(params.get('line_items[0][price]'),'price_liveweekly');
    assert.equal(params.get('subscription_data[trial_period_days]'),'14');
    return Response.json({id:'cs_live_new_customer',livemode:true,url:'https://checkout.stripe.com/c/pay/cs_live_new_customer'});
  };
  try{
    const response=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin',cookie:`totonoe_session=${token}`},body:JSON.stringify({plan_code:'weekly_monthly',request_id:'123e4567-e89b-12d3-a456-426614174001'})}),fixture.env);
    assert.equal(response.status,201);
    assert.equal(fixture.sql.prepare("SELECT livemode FROM stripe_checkout_attempts WHERE stripe_checkout_session_id='cs_live_new_customer'").get().livemode,1);
  }finally{globalThis.fetch=originalFetch;}
});

test('TAYORI本番受付を開いてもIROHAの購入APIは閉じたままにする',async()=>{
  const fixture=stripeFixture();
  const token='iroha_closed_session_token';
  const hash=await hashAuthValue(fixture.env.CUSTOMER_AUTH_SECRET,'session',token);
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('iroha_closed_session','customer_tayori',?,datetime('now','+1 day'))").run(hash);
  Object.assign(fixture.env,{STRIPE_MODE:'live',STRIPE_LIVE_READY:'true',STRIPE_CHECKOUT_ENABLED:'true',TAYORI_DIRECT_ENROLLMENT_ENABLED:'true'});
  const response=await worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin',cookie:`totonoe_session=${token}`},body:JSON.stringify({plan_code:'curriculum_monthly',request_id:'123e4567-e89b-12d3-a456-426614174002'})}),fixture.env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'iroha_enrollment_not_enabled');
});

test('IROHAのコードは初回のみCheckoutに渡し、再入会時は拒否する',async()=>{
  const fixture=stripeFixture();
  const token='iroha_first_promotion_session';
  const hash=await hashAuthValue(fixture.env.CUSTOMER_AUTH_SECRET,'session',token);
  fixture.sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES('iroha_first_promotion_session','customer_tayori',?,datetime('now','+1 day'))").run(hash);
  Object.assign(fixture.env,{STRIPE_CHECKOUT_ENABLED:'true',IROHA_ENROLLMENT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_checkout',STRIPE_PRICE_CURRICULUM_MONTHLY:'price_monthly123',STRIPE_PRICE_IROHA_FIRST:'price_entry123',STRIPE_PRICE_IROHA_REJOIN:'price_entry123',IROHA_FIRST_PROMOTION_CODE:'IROHA-START',IROHA_FIRST_PROMOTION_ID:'promo_entry123',PUBLIC_SITE_ORIGIN:'https://basecraftas.com'});
  const checkout=(requestId,code)=>worker.fetch(new Request('https://test.local/api/totonoe-member/api/customer/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local','sec-fetch-site':'same-origin',cookie:`totonoe_session=${token}`},body:JSON.stringify({plan_code:'curriculum_monthly',request_id:requestId,promotion_code:code})}),fixture.env);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{
    const params=new URLSearchParams(String(init.body));
    assert.equal(params.get('discounts[0][promotion_code]'),null);
    assert.equal(params.get('line_items[1][price]'),null);
    assert.ok(Number(params.get('subscription_data[trial_end]'))>Math.floor(Date.now()/1000)+80*86400);
    return Response.json({id:'cs_test_iroha_first',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_iroha_first'});
  };
  try{
    const first=await checkout('123e4567-e89b-12d3-a456-426614174003','IROHA-START');
    assert.equal(first.status,201);
    assert.equal((await first.json()).quote.first_charge_yen,0);
    assert.equal(fixture.sql.prepare("SELECT campaign_code FROM stripe_checkout_attempts WHERE stripe_checkout_session_id='cs_test_iroha_first'").get().campaign_code,'iroha_first_waiver_5000');
    const duplicate=await checkout('123e4567-e89b-12d3-a456-426614174005','IROHA-START');
    assert.equal(duplicate.status,409);
    assert.equal((await duplicate.json()).error,'checkout_already_pending');
    fixture.sql.prepare("UPDATE stripe_checkout_attempts SET status='completed' WHERE stripe_checkout_session_id='cs_test_iroha_first'").run();
    fixture.sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,status,recurring_amount_yen,entry_fee_yen,fee_type) VALUES('iroha_prior','customer_tayori','curriculum','monthly','canceled',2980,5000,'first')").run();
    const rejoin=await checkout('123e4567-e89b-12d3-a456-426614174004','IROHA-START');
    assert.equal(rejoin.status,400);
    assert.equal((await rejoin.json()).error,'promotion_not_applicable');
  }finally{globalThis.fetch=originalFetch;}
});

test('無料トライアル開始時の0円請求は契約をactiveへ早期変更しない',async()=>{
  const fixture=stripeFixture();
  const created=Math.floor(Date.now()/1000);
  const complete={id:'evt_trial_seed',object:'event',type:'checkout.session.completed',livemode:false,created,data:{object:{id:'cs_test_tayori',mode:'subscription',status:'complete',customer:'cus_tayori',subscription:'sub_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  assert.equal((await fixture.send(complete)).status,200);
  const trialInvoice={id:'evt_trial_invoice',object:'event',type:'invoice.paid',livemode:false,created,data:{object:{id:'in_trial_zero',subscription:'sub_tayori',currency:'jpy',amount_paid:0,amount_due:0,billing_reason:'subscription_create',status_transitions:{paid_at:created}}}};
  assert.equal((await fixture.send(trialInvoice)).status,200);
  assert.equal(fixture.sql.prepare("SELECT status FROM customer_subscriptions WHERE provider_subscription_id='sub_tayori'").get().status,'trialing');
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

test('資格確認APIは公開・管理画面のどちらからも利用できない',async()=>{
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
  assert.equal(submitted.status,404);
  const disabledAdminHeaders={'x-column-studio-dev-email':'admin@example.com'};
  const disabledList=await worker.fetch(new Request('https://test.local/api/tsuzuri-studio/api/admin/qualifications',{headers:disabledAdminHeaders}),fixture.env);
  assert.equal(disabledList.status,404);
  return;
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

test('TAYORI LPは980円・14日無料・人数上限なしのウェイトリストを案内する',()=>{
  const html=readFileSync('projects/totonoe/tayori.html','utf8');
  const workerSource=readFileSync('apps/tsuzuri-studio-api/src/worker.js','utf8');
  const workerConfig=readFileSync('apps/tsuzuri-studio-api/wrangler.toml','utf8');
  assert.match(html,/月額 980円/);
  assert.match(html,/14日間無料トライアル/);
  assert.match(html,/<h3>個人プラン<\/h3>\s*<div class="tayori-single-price"/);
  assert.doesNotMatch(html,/class="weekly-plan-list"/);
  assert.match(html,/決済情報の登録が必要/);
  assert.match(html,/無料期間中に解約手続きを完了しなかった場合/);
  assert.match(html,/月額980円（税込）が自動で請求され、以後毎月自動更新されます/);
  assert.match(html,/有料動画・有料セミナー/);
  assert.match(html,/外部講師(?:の|による)セミナーはTAYORI会員には別途料金が必要/);
  assert.match(html,/IROHA会員は追加料金なし/);
  assert.doesNotMatch(html,/全有料セミナー/);
  assert.match(html,/tayori-editor-hero-1600\.webp/);
  assert.match(html,/tayori-editor-hero-800\.webp/);
  assert.match(html,/totonoe-tayori-benefits-v4\.webp/);
  assert.doesNotMatch(html,/weekly-lp-intro/);
  assert.match(html,/data-waitlist-form/);
  assert.doesNotMatch(html,/初回先着10名|現在の受付枠|残り\d+名|入会金なし|いつでも解約可能|資格証明|10名ずつ追加枠/);
  assert.doesNotMatch(html,/資格確認済みセラピスト|月額 1,480円/);
  assert.doesNotMatch(html,/data-tayori-checkout/);
  assert.doesNotMatch(html,/tayoriCheckoutDialog/);
  assert.doesNotMatch(html,/tayori-checkout\.js/);
  assert.doesNotMatch(workerSource,/plan_full|reserveWeeklyCapacity|\/api\/public\/enrollment|\/api\/admin\/plan-capacity\/increase/);
  assert.match(workerConfig,/STRIPE_CHECKOUT_ENABLED = "true"/);
  assert.match(workerConfig,/TAYORI_DIRECT_ENROLLMENT_ENABLED = "true"/);
  assert.match(workerConfig,/IROHA_ENROLLMENT_ENABLED = "false"/);
});

test('プライバシーポリシーは公開中の申込サービス表記を維持する',()=>{
  const privacy=readFileSync('projects/totonoe/privacy.html','utf8');
  assert.match(privacy,/Peatix \/ Therapis10\.com等の申込サービス/);
  assert.match(privacy,/最終改定日：2026年9月22日/);
});

test('署名済みTAYORI Checkout完了通知だけが契約とWeekly権限を付与し、重複通知は安全に無視する',async()=>{
  const fixture=stripeFixture();
  const event={id:'evt_tayori_complete',object:'event',type:'checkout.session.completed',livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_test_tayori',object:'checkout.session',mode:'subscription',status:'complete',customer:'cus_tayori',subscription:'sub_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  const response=await fixture.send(event);
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'processed');
  const subscription=fixture.sql.prepare("SELECT product_code,billing_interval,status,recurring_amount_yen,provider_subscription_id FROM customer_subscriptions WHERE customer_id='customer_tayori'").get();
  assert.deepEqual({...subscription},{product_code:'weekly',billing_interval:'monthly',status:'trialing',recurring_amount_yen:980,provider_subscription_id:'sub_tayori'});
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

test('Stripeの入金・返金Webhookを月次課金台帳に重複なく反映する',async()=>{
  const fixture=stripeFixture();
  const created=Math.floor(Date.now()/1000);
  const complete={id:'evt_billing_seed',object:'event',type:'checkout.session.completed',livemode:false,created,data:{object:{id:'cs_test_tayori',mode:'subscription',status:'complete',customer:'cus_tayori',subscription:'sub_tayori',metadata:{attempt_id:'attempt_tayori',customer_id:'customer_tayori',plan_code:'weekly_monthly'}}}};
  assert.equal((await fixture.send(complete)).status,200);

  const paid={id:'evt_invoice_paid_tayori',object:'event',type:'invoice.paid',livemode:false,created,data:{object:{id:'in_tayori_202609',subscription:'sub_tayori',currency:'jpy',amount_paid:1480,amount_due:1480,billing_reason:'subscription_cycle',status_transitions:{paid_at:created}}}};
  assert.equal((await fixture.send(paid)).status,200);
  assert.equal((await fixture.send(paid)).status,200);
  const invoiceRow=fixture.sql.prepare("SELECT transaction_type, amount_yen, status FROM billing_transactions WHERE provider_transaction_id='invoice:in_tayori_202609'").get();
  assert.equal(invoiceRow.transaction_type,'recurring');
  assert.equal(invoiceRow.amount_yen,1480);
  assert.equal(invoiceRow.status,'paid');
  assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS count FROM billing_transactions WHERE stripe_invoice_id='in_tayori_202609'").get().count,1);

  const refunded={id:'evt_charge_refunded_tayori',object:'event',type:'charge.refunded',livemode:false,created:created+60,data:{object:{id:'ch_tayori_202609',invoice:'in_tayori_202609',amount_refunded:480}}};
  assert.equal((await fixture.send(refunded)).status,200);
  const refundRow=fixture.sql.prepare("SELECT transaction_type, amount_yen, status FROM billing_transactions WHERE provider_transaction_id='refund:ch_tayori_202609'").get();
  assert.equal(refundRow.transaction_type,'refund');
  assert.equal(refundRow.amount_yen,-480);
  assert.equal(refundRow.status,'refunded');
  assert.equal(fixture.sql.prepare("SELECT SUM(amount_yen) AS net_yen FROM billing_transactions WHERE stripe_invoice_id='in_tayori_202609' AND status IN ('paid','refunded')").get().net_yen,1000);
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
  fixture.sql.prepare("UPDATE stripe_checkout_attempts SET stripe_customer_id='cus_tayori', status='completed' WHERE id='attempt_tayori'").run();
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
    assert.equal(portalParams.get('return_url'),'https://basecraftas.com/projects/totonoe/TAYORI/index.html?billing=returned');
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

test('IROHA公開導線は準備中になり、購入者ページは会員区分で保護される',()=>{
  const home=readFileSync('projects/totonoe/index.html','utf8');
  const service=readFileSync('projects/totonoe/service.html','utf8');
  const tayoriLp=readFileSync('projects/totonoe/tayori.html','utf8');
  const irohaLp=readFileSync('projects/totonoe/IROHA/index.html','utf8');
  const dashboard=readFileSync('projects/totonoe/IROHA/dashboard.html','utf8');
  const mypage=readFileSync('projects/totonoe/IROHA/mypage.html','utf8');
  const shell=readFileSync('projects/totonoe/IROHA/member-shell.js','utf8');
  const loginScript=readFileSync('projects/totonoe/TAYORI/login.js','utf8');

  assert.match(home,/href="tayori\.html" class="btn btn-ghost">たよりを見る/);
  assert.match(service,/href="tayori\.html" class="btn btn-ghost">たよりを見る/);
  assert.match(home,/href="tsuzuri\/" class="btn btn-ghost">コラムを読む/);
  assert.match(service,/href="contents\.html"/);
  assert.doesNotMatch(home,/href="TAYORI\/"/);
  assert.doesNotMatch(service,/href="TAYORI\/"/);
  assert.match(tayoriLp,/TAYORI\/login\.html\?return=%2Fprojects%2Ftotonoe%2FTAYORI%2F/);
  assert.match(service,/class="service-card is-coming-soon" id="iroha"/);
  assert.doesNotMatch(home,/href="IROHA\/#iroha-waitlist"/);
  assert.doesNotMatch(service,/href="IROHA\/#iroha-waitlist"/);
  assert.match(irohaLp,/現在、公開に向けて準備中です/);
  assert.match(irohaLp,/初回入会費 5,000円／再入会費 2,500円/);
  assert.match(irohaLp,/data-interest="iroha_corporate"/);
  assert.doesNotMatch(irohaLp,/購入|会員ログイン|href="dashboard\.html"|qualificationForm/);
  assert.match(dashboard,/<html lang="ja" class="member-access-pending">/);
  assert.match(dashboard,/data-page-entitlement="curriculum"/);
  assert.match(mypage,/data-page-entitlement="member"/);
  assert.match(shell,/required === "curriculum" \? access\.has_curriculum_access/);
  assert.match(shell,/access\.has_weekly_access \|\| access\.has_curriculum_access/);
  assert.ok(loginScript.includes('TAYORI\\/(?:index\\.html)?'));
  assert.ok(loginScript.includes('IROHA\\/(?:mypage|dashboard|lesson)(?:\\.html)?'));
});
