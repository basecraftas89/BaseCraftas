import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { reserveTayoriAdmission, reserveEmailBudget, admissionWindow, weekendAdmissionWindow, tayoriCheckoutExpiry } from './src/enrollment-limits.js';
import { hashAuthValue } from './src/customer-auth.js';
import { loadWorker } from './test-support.mjs';

const worker = await loadWorker();
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/20260911_curriculum_foundation.sql',
    'migrations/20260918_customer_email_auth.sql', 'migrations/20260920_billing_dashboard.sql',
    'migrations/20260927_customer_password_auth.sql', 'migrations/20260930_tayori_daily_admission.sql']) {
    sql.exec(readFileSync(`apps/tsuzuri-studio-api/${file}`, 'utf8'));
  }
  const env = { ALLOW_DEV_AUTH:'true', STRIPE_MODE:'test', STRIPE_CHECKOUT_ENABLED:'true',
    TAYORI_DIRECT_ENROLLMENT_ENABLED:'true', TAYORI_DAILY_LIMIT_ENABLED:'true', CUSTOMER_EMAIL_BUDGET_ENABLED:'true',
    CUSTOMER_AUTH_SECRET:'0123456789abcdef0123456789abcdef',
    DB:{ prepare(query) { let args=[]; return {
      bind(...values){args=values;return this;},
      async first(){return sql.prepare(query).get(...args)||null;},
      async all(){return {results:sql.prepare(query).all(...args)};},
      async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},
    };} },
  };
  async function call(path, body, cookie, ip='203.0.113.1') {
    return worker.fetch(new Request(`https://test.local/api/totonoe-member/api${path}`, {
      method:'POST', headers:{'content-type':'application/json','origin':'https://test.local','sec-fetch-site':'same-origin','cf-connecting-ip':ip,...(cookie?{cookie}:{})}, body:JSON.stringify(body),
    }),env);
  }
  return {sql,env,call};
}

test('concurrent admissions never exceed 30; repeats remain usable at capacity',async()=>{
  const {sql,env}=fixture();
  try {
    const results=await Promise.allSettled(Array.from({length:100},(_,i)=>reserveTayoriAdmission(env,`hash${i}`)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,30);
    assert.equal(results.filter(r=>r.status==='rejected' && r.reason.message==='tayori_daily_limit_reached').length,70);
    await reserveTayoriAdmission(env,'hash0');
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM tayori_daily_admissions').get().n,30);
  } finally {sql.close();}
});

test('UTC day resets at 09:00 JST, not Japanese midnight',async()=>{
  const {sql,env}=fixture();
  const before=Date.parse('2026-10-01T08:59:59+09:00');
  try {
    for(let i=0;i<30;i++)await reserveTayoriAdmission(env,`hash${i}`,before);
    await assert.rejects(reserveTayoriAdmission(env,'new',before),e=>e.status===429 && e.retryAfter===1);
    assert.equal(admissionWindow(before).reset_at,'2026-10-01T00:00:00.000Z');
    await reserveTayoriAdmission(env,'new',before+1000);
  } finally {sql.close();}
});

test('60 onboarding mails leave 30 protected slots; total stays below 100',async()=>{
  const {sql,env}=fixture();const now=Date.parse('2026-10-01T12:00:00Z');
  const send=(i,category)=>reserveEmailBudget(env,{id:`mail${i}`,recipientHash:`recipient${i}`,category},now);
  try {
    const results=await Promise.allSettled(Array.from({length:80},(_,i)=>send(i,'onboarding')));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,60);
    for(let i=100;i<130;i++)await send(i,'member');
    await assert.rejects(send(131,'member'),/auth_email_daily_limit_reached/);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_email_budget').get().n,90);
    await reserveEmailBudget(env,{id:'tomorrow',recipientHash:'recipient131',category:'member'},now+86400000);
  } finally {sql.close();}
});

test('resends have a 60 second cooldown and a 5 per recipient per day cap',async()=>{
  const {sql,env}=fixture();const now=Date.parse('2026-10-01T12:00:00Z');
  const send=(i,time)=>reserveEmailBudget(env,{id:`mail${i}`,recipientHash:'same',category:'member'},time);
  try {
    await send(0,now);
    await assert.rejects(send(1,now+59000),/auth_email_cooldown/);
    for(let i=1;i<5;i++)await send(i,now+i*60000);
    await assert.rejects(send(5,now+300000),/auth_email_daily_limit_reached/);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_email_budget').get().n,5);
  } finally {sql.close();}
});

test('31st signup fails before email/Stripe; verified direct checkout cannot bypass the cap',async()=>{
  const {sql,env,call}=fixture();
  try {
    for(let i=0;i<30;i++)await reserveTayoriAdmission(env,`occupied${i}`);
    const denied=await call('/customer/auth/request-code',{email:'new@example.com',signup_product:'weekly'});
    assert.equal(denied.status,429);assert.equal((await denied.json()).error,'tayori_daily_limit_reached');
    assert.ok(Number(denied.headers.get('retry-after'))>0);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_auth_challenges').get().n,0);
    // A user who verified elsewhere still cannot start checkout without a slot.
    sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES ('new','new@example.com',CURRENT_TIMESTAMP)").run();
    const tokenHash=await hashAuthValue(env.CUSTOMER_AUTH_SECRET,'session','test-token');
    sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES ('session','new',?,datetime('now','+1 hour'))").run(tokenHash);
    const checkout=await call('/customer/billing/checkout',{plan_code:'weekly_monthly',request_id:crypto.randomUUID()},'totonoe_session=test-token');
    assert.equal(checkout.status,429);assert.equal((await checkout.json()).error,'tayori_daily_limit_reached');
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM stripe_checkout_attempts').get().n,0);
  } finally {sql.close();}
});

test('existing member password setup and password login survive a full admission day',async()=>{
  const {sql,env,call}=fixture();
  try {
    for(let i=0;i<30;i++)await reserveTayoriAdmission(env,`occupied${i}`);
    env.TAYORI_WEEKEND_ONLY='true';
    sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES ('member','member@example.com',CURRENT_TIMESTAMP)").run();
    sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,status,recurring_amount_yen) VALUES ('sub','member','weekly','monthly','active',980)").run();
    const codeResponse=await call('/customer/auth/request-code',{email:'member@example.com',signup_product:'weekly'});
    assert.equal(codeResponse.status,202);
    const {dev_code:code}=await codeResponse.json();
    const verified=await call('/customer/auth/verify-code',{email:'member@example.com',code});
    assert.equal(verified.status,200);
    const password='test-only-long-password';
    const setup=await call('/customer/auth/password/set',{password},verified.headers.get('set-cookie'));
    assert.equal(setup.status,200);
    const login=await call('/customer/auth/password/login',{email:'member@example.com',password});
    assert.equal(login.status,200);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM tayori_daily_admissions').get().n,30);
  } finally {sql.close();}
});

test('provider sends are budgeted and failures do not refund possibly delivered mail',async()=>{
  const {sql,env,call}=fixture(); const original=globalThis.fetch;
  env.ALLOW_DEV_AUTH='false';env.RESEND_API_KEY='re_test_only';env.RESEND_FROM_EMAIL='test@example.com';
  let sent=0;
  globalThis.fetch=async(url)=>{assert.equal(url,'https://api.resend.com/emails');sent++;return Response.json({error:'test failure'},{status:503});};
  try {
    const failed=await call('/customer/auth/request-code',{email:'new@example.com',signup_product:'weekly'});
    assert.equal(failed.status,502);assert.equal(sent,1);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_email_budget').get().n,1);
    const again=await call('/customer/auth/request-code',{email:'new@example.com',signup_product:'weekly'});
    assert.equal(again.status,429);assert.equal((await again.json()).error,'auth_email_cooldown');assert.equal(sent,1);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM tayori_daily_admissions').get().n,1);
    for(let i=1;i<60;i++)await reserveEmailBudget(env,{id:`seed${i}`,recipientHash:`seed${i}`,category:'onboarding'});
    const newUser=await call('/customer/auth/request-code',{email:'blocked@example.com'});
    assert.equal(newUser.status,429);assert.equal((await newUser.json()).error,'auth_email_daily_limit_reached');
    sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES ('member','member@example.com',CURRENT_TIMESTAMP)").run();
    sql.prepare("INSERT INTO customer_subscriptions(id,customer_id,product_code,billing_interval,status,recurring_amount_yen) VALUES ('sub','member','weekly','monthly','active',980)").run();
    globalThis.fetch=async()=>{sent++;return Response.json({id:'mock-email'});};
    const member=await call('/customer/auth/request-code',{email:'member@example.com'});
    assert.equal(member.status,202);assert.equal(sent,2);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM customer_email_budget WHERE category='member'").get().n,1);
  } finally {globalThis.fetch=original;sql.close();}
});

test('signup form reports daily limit and never advances to checkout',async()=>{
  const dom=new JSDOM(readFileSync('projects/totonoe/TAYORI/subscribe.html','utf8'),{url:'https://basecraftas.com/projects/totonoe/TAYORI/subscribe',runScripts:'outside-only'});
  try {
    const w=dom.window;
    w.fetch=async(url,options)=>{
      if(url.endsWith('/tayori-enrollment-status'))return Response.json({enabled:true,mode:'live'});
      assert.equal(JSON.parse(options.body).signup_product,'weekly');
      return Response.json({error:'tayori_daily_limit_reached'},{status:429});
    };
    w.eval(readFileSync('projects/totonoe/TAYORI/subscribe.js','utf8'));
    await new Promise(r=>setTimeout(r,0));
    const form=w.document.querySelector('#emailForm');form.elements.email.value='new@example.com';
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));
    await new Promise(r=>setTimeout(r,0));
    assert.match(w.document.querySelector('#signupStatus').textContent,/10名.*ウェイトリスト.*翌週土曜6:30/);
    assert.equal(w.document.querySelector('#codeForm').hidden,true);
    assert.equal(w.document.querySelector('#checkoutForm').hidden,true);
    assert.equal(form.querySelector('button').disabled,false);
  } finally {dom.window.close();}
});

test('weekend opening boundaries and Stripe deadlines use Japan time',()=>{
  const env={TAYORI_WEEKEND_ONLY:'true'};
  for(const [time,open] of [
    ['2026-10-02T23:59:59+09:00',false],['2026-10-03T06:29:59+09:00',false],
    ['2026-10-03T06:30:00+09:00',true],['2026-10-03T23:59:59+09:00',true],
    ['2026-10-04T00:00:00+09:00',true],['2026-10-04T23:29:59+09:00',true],
    ['2026-10-04T23:30:00+09:00',false],['2026-10-05T00:00:00+09:00',false],
  ])assert.equal(weekendAdmissionWindow(Date.parse(time)).open,open,time);
  assert.equal(weekendAdmissionWindow(Date.parse('2026-10-05T00:00:00+09:00')).opens_at,'2026-10-09T21:30:00.000Z');
  assert.equal(tayoriCheckoutExpiry(env,Date.parse('2026-10-04T23:20:00+09:00')),Date.parse('2026-10-05T00:00:00+09:00')/1000);
  assert.throws(()=>tayoriCheckoutExpiry(env,Date.parse('2026-10-05T00:00:00+09:00')),/tayori_weekend_closed/);
});

test('Saturday and Sunday have independent 30-person quotas; mail still uses UTC',async()=>{
  const {env,sql}=fixture();env.TAYORI_WEEKEND_ONLY='true';
  try {
    const sat=Date.parse('2026-10-03T22:00:00+09:00'),sun=Date.parse('2026-10-04T01:00:00+09:00');
    for(const time of [sat,sun]){
      const results=await Promise.allSettled(Array.from({length:50},(_,i)=>reserveTayoriAdmission(env,`hash${i}`,time)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,30);
    }
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM tayori_daily_admissions').get().n,60);
    assert.equal(admissionWindow(sat).day,admissionWindow(sun).day);
    await assert.rejects(reserveTayoriAdmission(env,'closed',Date.parse('2026-10-05T12:00:00+09:00')),/tayori_weekend_closed/);
  } finally {sql.close();}
});

test('closed weekend signup UI shows next date without requesting a code',async()=>{
  const dom=new JSDOM(readFileSync('projects/totonoe/TAYORI/subscribe.html','utf8'),{url:'https://basecraftas.com/projects/totonoe/TAYORI/subscribe',runScripts:'outside-only'});
  try {
    let calls=0;
    dom.window.fetch=async()=>{calls++;return Response.json({enabled:true,mode:'live',weekend_only:true,accepting:false,next_open_at:'2026-10-02T21:30:00Z'});};
    dom.window.eval(readFileSync('projects/totonoe/TAYORI/subscribe.js','utf8'));
    await new Promise(r=>setTimeout(r,0));
    assert.equal(calls,1);assert.equal(dom.window.document.querySelector('#emailForm').hidden,true);
    assert.match(dom.window.document.querySelector('#signupStatus').textContent,/受付時間外.*10\/3.*06:30/);
  } finally {dom.window.close();}
});

test('checkout receives an expiry and even a reused link cannot bypass weekday API gating',async()=>{
  const {env,sql,call}=fixture();const originalNow=Date.now,originalFetch=globalThis.fetch;
  env.TAYORI_WEEKEND_ONLY='true';env.STRIPE_SECRET_KEY='sk_test_weekend';env.STRIPE_PRICE_TAYORI_MONTHLY='price_weekend';
  try {
    sql.prepare("INSERT INTO customer_accounts(id,email,email_verified_at) VALUES ('new','new@example.com',CURRENT_TIMESTAMP)").run();
    const hash=await hashAuthValue(env.CUSTOMER_AUTH_SECRET,'session','weekend-token');
    sql.prepare("INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at) VALUES ('session','new',?,datetime('now','+1 day'))").run(hash);
    Date.now=()=>Date.parse('2026-10-04T23:20:00+09:00');
    let requests=0;
    globalThis.fetch=async(url,init)=>{
      assert.equal(String(url),'https://api.stripe.com/v1/checkout/sessions');requests++;
      const params=new URLSearchParams(init.body);
      assert.equal(Number(params.get('expires_at')),Date.parse('2026-10-05T00:00:00+09:00')/1000);
      return Response.json({id:'cs_test_weekend',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_weekend'});
    };
    const payload={plan_code:'weekly_monthly',request_id:crypto.randomUUID()};
    assert.equal((await call('/customer/billing/checkout',payload,'totonoe_session=weekend-token')).status,201);
    Date.now=()=>Date.parse('2026-10-05T10:00:00+09:00');
    const denied=await call('/customer/billing/checkout',payload,'totonoe_session=weekend-token');
    assert.equal(denied.status,429);assert.equal((await denied.json()).error,'tayori_weekend_closed');
    const mail=await call('/customer/auth/request-code',{email:'blocked@example.com',signup_product:'weekly'});
    assert.equal(mail.status,429);assert.equal((await mail.json()).error,'tayori_weekend_closed');
    assert.equal(requests,1);
  } finally {Date.now=originalNow;globalThis.fetch=originalFetch;sql.close();}
});
