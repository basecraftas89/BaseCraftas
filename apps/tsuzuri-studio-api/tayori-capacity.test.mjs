import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { loadWorker } from './test-support.mjs';
import { hashAuthValue } from './src/customer-auth.js';
import { claimTayoriCheckout, tayoriCapacityStatus, recordTayoriCapacityEvent, reconcileTayoriCapacity } from './src/tayori-capacity.js';

const worker = await loadWorker();
const saturday = Date.parse('2026-10-03T12:00:00+09:00');
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/20260911_curriculum_foundation.sql',
    'migrations/20260918_customer_email_auth.sql', 'migrations/20260920_billing_dashboard.sql',
    'migrations/20260927_customer_password_auth.sql', 'migrations/20260930_tayori_daily_admission.sql',
    'migrations/20260930_tayori_completed_capacity.sql']) sql.exec(readFileSync(`apps/tsuzuri-studio-api/${file}`, 'utf8'));
  const env = { ALLOW_DEV_AUTH:'true', STRIPE_MODE:'test', STRIPE_SECRET_KEY:'sk_test_fake',
    STRIPE_WEBHOOK_SECRET:'whsec_test_fake', STRIPE_PRICE_TAYORI_MONTHLY:'price_test',
    STRIPE_CHECKOUT_ENABLED:'true', TAYORI_DIRECT_ENROLLMENT_ENABLED:'true',
    TAYORI_DAILY_LIMIT_ENABLED:'true', TAYORI_COMPLETION_LIMIT_ENABLED:'true',
    CUSTOMER_AUTH_SECRET:'0123456789abcdef0123456789abcdef',
    DB:{prepare(query){let args=[];return {bind(...v){args=v;return this;},
      async first(){return sql.prepare(query).get(...args)||null;},
      async all(){return {results:sql.prepare(query).all(...args)};},
      async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}},
  };
  function seed(id, customer=id) {
    sql.prepare("INSERT OR IGNORE INTO customer_accounts(id,email,email_verified_at) VALUES(?,?,CURRENT_TIMESTAMP)").run(customer,`${customer}@example.com`);
    sql.prepare(`INSERT INTO stripe_checkout_attempts(id,customer_id,idempotency_key,plan_code,audience_type,fee_type,
      trial_days,recurring_amount_yen,entry_fee_yen,status) VALUES(?,?,?,'weekly_monthly','general','none',14,980,0,'pending')`).run(id,customer,`key-${id}`);
    return {id,customer_id:customer,plan_code:'weekly_monthly',livemode:0};
  }
  async function claim(id, now=saturday, customer=id) {
    const attempt=seed(id,customer);
    const params=new URLSearchParams({'metadata[attempt_id]':id,'metadata[customer_id]':customer,'metadata[plan_code]':'weekly_monthly'});
    const expiresAt=Math.floor(now/1000)+3600;
    params.set('expires_at',String(expiresAt));
    await claimTayoriCheckout(env,{attemptId:id,customerId:customer,expiresAt,params},now);
    return attempt;
  }
  function event(attempt,type='completed',time=saturday) {
    return {id:`evt_${attempt.id}_${type}`,object:'event',type:`checkout.session.${type}`,livemode:false,created:Math.floor(time/1000),
      data:{object:{id:`cs_test_${attempt.id}`,mode:'subscription',status:type==='completed'?'complete':'expired',
        customer:`cus_${attempt.customer_id}`,subscription:`sub_${attempt.id}`,
        metadata:{attempt_id:attempt.id,customer_id:attempt.customer_id,plan_code:'weekly_monthly'}}}};
  }
  async function send(event) {
    const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
    return worker.fetch(new Request('https://test.local/api/totonoe-member/api/stripe/webhook',{
      method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`},body}),env);
  }
  async function cookie(id) {
    sql.prepare("INSERT OR IGNORE INTO customer_accounts(id,email,email_verified_at) VALUES(?,?,CURRENT_TIMESTAMP)").run(id,`${id}@example.com`);
    const hash=await hashAuthValue(env.CUSTOMER_AUTH_SECRET,'session',`token-${id}`);
    sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))").run(`session-${id}`,id,hash);
    return `totonoe_session=token-${id}`;
  }
  async function call(path,body,cookie,ip='203.0.113.1') {
    return worker.fetch(new Request(`https://test.local/api/totonoe-member/api${path}`,{method:'POST',
      headers:{'content-type':'application/json',origin:'https://test.local','cf-connecting-ip':ip,...(cookie?{cookie}:{})},body:JSON.stringify(body)}),env);
  }
  return {sql,env,seed,claim,event,send,cookie,call};
}

test('35 code requests consume zero seats, including after 30 legacy email claims',async()=>{
  const f=fixture();
  try {
    for(let i=0;i<30;i++)f.sql.prepare('INSERT INTO tayori_daily_admissions(day,email_hash) VALUES(?,?)').run(new Date().toISOString().slice(0,10),`old${i}`);
    for(let i=0;i<35;i++)assert.equal((await f.call('/customer/auth/request-code',{email:`new${i}@example.com`,signup_product:'weekly'},null,`203.0.113.${i+1}`)).status,202);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM tayori_checkout_capacity').get().n,0);
    assert.equal((await tayoriCapacityStatus(f.env)).completed_weekend,0);
  } finally {f.sql.close();}
});

test('9 completed plus 100 concurrent checkouts reserve exactly the last seat',async()=>{
  const f=fixture();
  try {
    for(let i=0;i<9;i++){const a=await f.claim(`done${i}`);await recordTayoriCapacityEvent(f.env,f.event(a),a);}
    const result=await Promise.allSettled(Array.from({length:100},(_,i)=>f.claim(`next${i}`)));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(result.filter(r=>r.status==='rejected'&&r.reason.message==='tayori_capacity_pending').length,99);
    const state=await tayoriCapacityStatus(f.env,saturday);
    assert.equal(state.completed_weekend,9);assert.equal(state.remaining,0);assert.equal(state.capacity_state,'pending');assert.equal(state.weekend_limit,10);
    const a={id:'next0',customer_id:'next0',plan_code:'weekly_monthly',livemode:0};
    await recordTayoriCapacityEvent(f.env,f.event(a),a);
    await assert.rejects(f.claim('over'),/tayori_daily_limit_reached/);
  } finally {f.sql.close();}
});

test('expired event releases an abandoned hold, duplicate completion and late expiry never uncount it',async()=>{
  const f=fixture();
  try {
    const a=await f.claim('abandoned');
    await recordTayoriCapacityEvent(f.env,f.event(a,'expired'),a);
    assert.equal((await tayoriCapacityStatus(f.env,saturday)).remaining,10);
    const b=await f.claim('complete');
    await recordTayoriCapacityEvent(f.env,f.event(b),b);
    await recordTayoriCapacityEvent(f.env,f.event(b),b);
    await recordTayoriCapacityEvent(f.env,f.event(b,'expired'),b);
    assert.equal((await tayoriCapacityStatus(f.env,saturday)).completed_weekend,1);
    assert.equal((await tayoriCapacityStatus(f.env,saturday)).remaining,9);
  } finally {f.sql.close();}
});

test('Saturday and Sunday share 10 seats; midnight and delayed webhooks do not reopen seats',async()=>{
  const f=fixture();
  try {
    const late=Date.parse('2026-10-03T23:50:00+09:00'),sunday=Date.parse('2026-10-04T00:10:00+09:00');
    for(let i=0;i<10;i++)await f.claim(`cross${i}`,late);
    assert.equal((await tayoriCapacityStatus(f.env,late)).remaining,0);
    assert.equal((await tayoriCapacityStatus(f.env,sunday)).remaining,0);
    await assert.rejects(f.claim('sunday31',sunday),/tayori_capacity_pending/);
    const a={id:'cross0',customer_id:'cross0',plan_code:'weekly_monthly',livemode:0};
    await recordTayoriCapacityEvent(f.env,f.event(a,'completed',sunday),a);
    assert.equal((await tayoriCapacityStatus(f.env,late)).remaining,0);
    assert.equal((await tayoriCapacityStatus(f.env,sunday)).completed_weekend,1);
    assert.equal((await tayoriCapacityStatus(f.env,sunday+86400000)).completed_weekend,1);
  } finally {f.sql.close();}
});

test('same person cannot reserve two concurrent seats; live/test counts are isolated',async()=>{
  const f=fixture();
  try {
    await f.claim('one');
    await assert.rejects(f.claim('two',saturday,'one'),/tayori_checkout_pending/);
    f.env.STRIPE_MODE='live';
    assert.equal((await tayoriCapacityStatus(f.env,saturday)).remaining,10);
  } finally {f.sql.close();}
});

test('expired local timer cannot release a completed-but-undelivered or unreachable Stripe session',async()=>{
  const f=fixture(),original=globalThis.fetch;
  try {
    for(const id of ['complete','expired','unreachable']){await f.claim(id);f.sql.prepare('UPDATE stripe_checkout_attempts SET stripe_checkout_session_id=? WHERE id=?').run(`cs_test_${id}`,id);}
    globalThis.fetch=async url=>{
      const id=String(url).split('cs_test_')[1];
      if(id==='unreachable')throw new Error('network');
      return Response.json({id:`cs_test_${id}`,livemode:false,status:id==='complete'?'complete':'expired',metadata:{attempt_id:id,customer_id:id,plan_code:'weekly_monthly'}});
    };
    await reconcileTayoriCapacity(f.env,30,saturday+3600001);
    assert.equal(f.sql.prepare("SELECT status FROM tayori_checkout_capacity WHERE attempt_id='expired'").get().status,'released');
    assert.equal(f.sql.prepare("SELECT status FROM tayori_checkout_capacity WHERE attempt_id='complete'").get().status,'held');
    assert.equal(f.sql.prepare("SELECT status FROM tayori_checkout_capacity WHERE attempt_id='unreachable'").get().status,'held');
  } finally {globalThis.fetch=original;f.sql.close();}
});

test('API timeout retains seat; retry replays identical Stripe key and parameters, never consumes another seat',async()=>{
  const f=fixture(),original=globalThis.fetch;let first,second,calls=0;
  try {
    const cookie=await f.cookie('retry');
    globalThis.fetch=async(url,options)=>{
      calls++;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
      const captured={key:options.headers['idempotency-key'],body:options.body.toString()};
      if(calls===1){first=captured;throw new Error('timeout');}second=captured;
      return Response.json({id:'cs_test_retry',url:'https://checkout.stripe.com/c/pay/cs_test_retry',livemode:false,customer:'cus_retry'});
    };
    const payload=()=>({plan_code:'weekly_monthly',request_id:crypto.randomUUID()});
    assert.equal((await f.call('/customer/billing/checkout',payload(),cookie)).status,500);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM tayori_checkout_capacity WHERE status='held'").get().n,1);
    const retry=await f.call('/customer/billing/checkout',payload(),cookie);
    assert.equal(retry.status,200);assert.deepEqual(second,first);assert.equal(calls,2);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM tayori_checkout_capacity').get().n,1);
    assert.equal((await f.call('/customer/billing/checkout',payload(),cookie)).status,200);assert.equal(calls,2);
  } finally {globalThis.fetch=original;f.sql.close();}
});

test('signed completion counts once; invalid metadata and late expiry cannot change completed admission',async()=>{
  const f=fixture();
  try {
    const a=await f.claim('signed',Date.now());
    const event=f.event(a,'completed',Date.now());
    assert.equal((await f.send(event)).status,200);
    assert.equal((await f.send(event)).status,200);
    assert.equal((await tayoriCapacityStatus(f.env)).completed_weekend,1);
    assert.equal((await f.send(f.event(a,'expired',Date.now()))).status,200);
    assert.equal(f.sql.prepare("SELECT status FROM stripe_checkout_attempts WHERE id='signed'").get().status,'completed');
    const bad=f.event(a,'expired',Date.now());bad.id='evt_bad';bad.data.object.metadata.customer_id='other';
    assert.equal((await f.send(bad)).status,400);
    assert.equal((await tayoriCapacityStatus(f.env)).completed_weekend,1);
  } finally {f.sql.close();}
});

test('10 completed rejects email and direct checkout but existing-member login stays available',async()=>{
  const f=fixture();
  try {
    for(let i=0;i<10;i++){const a=await f.claim(`full${i}`,Date.now());await recordTayoriCapacityEvent(f.env,f.event(a,'completed',Date.now()),a);}
    const denied=await f.call('/customer/auth/request-code',{email:'new@example.com',signup_product:'weekly'});
    assert.equal(denied.status,429);assert.equal((await denied.json()).error,'tayori_daily_limit_reached');
    const cookie=await f.cookie('direct');
    const checkout=await f.call('/customer/billing/checkout',{plan_code:'weekly_monthly',request_id:crypto.randomUUID()},cookie);
    assert.equal(checkout.status,429);assert.equal((await checkout.json()).error,'tayori_daily_limit_reached');
    f.sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,status,recurring_amount_yen) VALUES('sub','full0','weekly','monthly','active',980)").run();
    assert.equal((await f.call('/customer/auth/request-code',{email:'full0@example.com',signup_product:'weekly'},null,'203.0.113.2')).status,202);
  } finally {f.sql.close();}
});

test('Saturday 6 plus Sunday 4 close the weekend; next Saturday opens 10',async()=>{
  const f=fixture();f.env.TAYORI_WEEKEND_ONLY='true';
  try {
    const sunday=saturday+86400000;
    for(let i=0;i<10;i++) {
      const now=i<6?saturday:sunday;
      const a=await f.claim(`week${i}`,now);
      await recordTayoriCapacityEvent(f.env,f.event(a,'completed',now),a);
    }
    const state=await tayoriCapacityStatus(f.env,sunday);
    assert.equal(state.completed_weekend,10);assert.equal(state.capacity_state,'full');
    assert.equal(state.reset_at,'2026-10-09T21:30:00.000Z');
    await assert.rejects(f.claim('eleven',sunday),/tayori_daily_limit_reached/);
    const next=Date.parse('2026-10-10T06:30:00+09:00');
    await assert.rejects(f.claim('early',next-1),/tayori_weekend_closed/);
    assert.equal((await tayoriCapacityStatus(f.env,next)).remaining,10);
    await f.claim('nextweek',next);
    assert.equal((await tayoriCapacityStatus(f.env,next)).remaining,9);
  } finally {f.sql.close();}
});

test('waitlist requires consent and stores no paid contract',async()=>{
  const f=fixture();
  try {
    const data={email:'waiting@example.com',interest:'tayori_personal',source:'/projects/totonoe/TAYORI/subscribe'};
    assert.equal((await f.call('/public/waitlist',data)).status,400);
    assert.equal((await f.call('/public/waitlist',{...data,privacy_consent:true})).status,201);
    assert.equal((await f.call('/public/waitlist',{...data,privacy_consent:true})).status,201);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM waitlist_entries').get().n,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stripe_checkout_attempts').get().n,0);
  } finally {f.sql.close();}
});

test('definitive Stripe validation failure returns the temporary seat',async()=>{
  const f=fixture(),original=globalThis.fetch;
  try {
    const cookie=await f.cookie('invalid');
    globalThis.fetch=async()=>Response.json({error:{type:'invalid_request_error',code:'resource_missing'}},{status:400});
    assert.equal((await f.call('/customer/billing/checkout',{plan_code:'weekly_monthly',request_id:crypto.randomUUID()},cookie)).status,502);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM tayori_checkout_capacity WHERE status='held'").get().n,0);
  } finally {globalThis.fetch=original;f.sql.close();}
});
