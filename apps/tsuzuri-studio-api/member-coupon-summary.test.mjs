import test from 'node:test';
import assert from 'node:assert/strict';
import { couponCategory, aggregateMemberCoupons } from './src/member-coupon-summary.js';

test('割引と無料トライアルは別判定、期限切れと不明情報を誤分類しない', () => {
  assert.equal(couponCategory({discounts:[{coupon:{percent_off:100}}]}), 'free_coupon');
  assert.equal(couponCategory({discounts:[{coupon:{percent_off:50}}]}), 'other_discount');
  assert.equal(couponCategory({discounts:[{coupon:{amount_off:980}}]}), 'other_discount');
  assert.equal(couponCategory({status:'trialing',discounts:[]}), 'no_coupon');
  assert.equal(couponCategory({discounts:['di_unexpanded']}), 'unknown');
  assert.equal(couponCategory({discounts:[{end:1,coupon:{percent_off:100}}]}), 'no_coupon');
  assert.equal(couponCategory({discounts:[],items:{data:[{discounts:['di_item']}]}}), 'unknown');
});

test('7名のクーポンと1名のトライアルを個人情報なしで照合、失敗は未確認', async () => {
  const rows=Array.from({length:8},(_,i)=>({customer_id:'private_customer_'+i,provider_subscription_id:'sub_'+i,product_code:'weekly'}));
  const env={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture',DB:{prepare(){return {bind(mode){assert.equal(mode,1);return {async all(){return {results:rows};}};}};}}};
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const id=new URL(url).pathname.split('/').at(-1);
    return Response.json({id,livemode:true,status:id==='sub_7'?'trialing':'active',customer:{email:'private@example.com'},discounts:id==='sub_7'?[]:[{coupon:{percent_off:100},promotion_code:'private_code'}]});
  };
  try{
    const data=await aggregateMemberCoupons(env);
    assert.deepEqual(data.groups[0],{product_code:'weekly',total:8,free_coupon:7,other_discount:0,no_coupon:1,unknown:0,no_coupon_trial:1});
    assert.doesNotMatch(JSON.stringify(data),/private|sub_|email|promotion_code/);
    globalThis.fetch=async()=>new Response('',{status:403});
    const failed=await aggregateMemberCoupons(env);
    assert.equal(failed.groups[0].unknown,8);
    assert.equal(failed.groups[0].no_coupon,0);
  }finally{globalThis.fetch=original;}
});
