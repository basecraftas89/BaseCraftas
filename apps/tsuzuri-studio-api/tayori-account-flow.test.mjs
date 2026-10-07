import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {runInNewContext} from 'node:vm';
import siteWorker from '../site-worker/worker.js';

test('初回・変更はメール確認後に設定し、マイページへ戻る', async () => {
  const dom = new JSDOM(readFileSync('projects/totonoe/TAYORI/login.html','utf8'), {
    url:'https://basecraftas.com/projects/totonoe/TAYORI/login.html?setup=1&return=%2Fprojects%2Ftotonoe%2FIROHA%2Fmypage.html', runScripts:'outside-only',
  });
  const w = dom.window;
  const calls=[];
  w.fetch=async (url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};};
  w.eval(readFileSync('projects/totonoe/TAYORI/login.js','utf8'));
  const doc=w.document;
  assert.match(doc.querySelector('h1').textContent,/初回設定・変更/);
  const email=doc.querySelector('#memberLoginEmailForm');
  assert.equal(email.hidden,false);
  email.elements.email.value='member@example.com';
  email.dispatchEvent(new w.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls[0].url,'/api/totonoe-member/api/customer/auth/request-code');
  const code=doc.querySelector('#memberLoginCodeForm');
  assert.equal(code.hidden,false);
  assert.equal(doc.querySelector('#memberLoginPasswordSetupForm').hidden,true);
  code.elements.code.value='123456';
  code.dispatchEvent(new w.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls[1].url,'/api/totonoe-member/api/customer/auth/verify-code');
  const setup=doc.querySelector('#memberLoginPasswordSetupForm');
  assert.equal(setup.hidden,false);
  setup.elements.password.value='test-only-password';
  setup.elements.password_confirm.value='not-matching-password';
  setup.dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.match(doc.querySelector('#memberLoginStatus').textContent,/一致しません/);
  assert.equal(calls.length,2);
  dom.window.close();
});

test('会員ページから戻されたログイン画面は認証状態で自動移動せず入力を受け付ける', async () => {
  const script = readFileSync('projects/totonoe/TAYORI/login.js', 'utf8');
  let destination = '';
  let fetchCount = 0;
  const form = { addEventListener() {} };
  runInNewContext(script, {
    location: {
      protocol: 'https:',
      search: '?return=%2Fprojects%2Ftotonoe%2FIROHA%2Fdashboard.html',
      replace(path) { destination = path; },
    },
    URLSearchParams,
    document: { querySelector: () => form },
    window: { setTimeout() {} },
    fetch: async () => { fetchCount += 1; return { ok: true, json: async () => ({ authenticated: true }) }; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(destination, '');
  assert.equal(fetchCount, 0);
});

test('共通マイページはCookieをService Bindingへ渡し匿名と権限なしを拒否する', async () => {
  const url='https://basecraftas.com/projects/totonoe/IROHA/mypage.html';
  for (const [profile,status] of [[{has_weekly_access:true},200],[{has_weekly_access:false},302],[null,302]]) {
    const env={ASSETS:{fetch:async()=>new Response('private account')}, MEMBER_API:{fetch:async req=>{
      assert.equal(req.headers.get('cookie'),'totonoe_session=test');
      assert.equal(new URL(req.url).pathname,'/api/totonoe-member/api/customer/profile');
      return profile ? Response.json({profile}) : Response.json({error:'authentication_required'},{status:401});
    }}};
    const result=await siteWorker.fetch(new Request(url,{headers:{cookie:'totonoe_session=test'}}),env);
    assert.equal(result.status,status);
    assert.match(result.headers.get('cache-control'),/no-store/);
  }
});

test('マイページの限定公開と無料クーポン・初回設定案内', () => {
  const config=readFileSync('apps/tayori-site/wrangler.toml','utf8');
  assert.match(config,/IROHA\/mypage\*/);
  assert.doesNotMatch(config,/pattern = "basecraftas.com\/projects\/totonoe\/IROHA\/\*"/);
  const build=readFileSync('apps/tayori-site/build-assets.mjs','utf8');
  assert.match(build,/\["mypage.html", "mypage.js", "member-shell.js", "curriculum.css"\]/);
  const mypage=readFileSync('projects/totonoe/IROHA/mypage.html','utf8');
  assert.match(mypage,/login.html\?setup=1&amp;return=%2Fprojects%2Ftotonoe%2FIROHA%2Fmypage.html/);
  const complete=readFileSync('projects/totonoe/TAYORI/checkout-complete.html','utf8');
  assert.match(complete,/100％割引/);
  assert.match(complete,/無料期間終了後も月額0円/);
  assert.match(complete,/パスワード自体はメールで送りません/);
});
