import {couponCategory} from './member-coupon-summary.js';
const active=s=>['active','trialing'].includes(s.status);
const month=(row,n)=>row.billing_interval==='annual'?Math.round(n/12):Math.round(n);
export async function adjustBillingMembership(summary,rows,env){
 const live=env.STRIPE_MODE==='live',states=new Map();
 // Read-only Stripe verification. A failed read must never inflate the forecast.
 await Promise.all(rows.filter(active).map(async row=>{
  let state={category:'unknown',monthly_yen:null,trial:row.status==='trialing',cancel:false};
  try{
   if(!new RegExp(`^(?:sk|rk)_${live?'live':'test'}_`).test(env.STRIPE_SECRET_KEY||'')||!/^sub_[A-Za-z0-9_]+$/.test(row.provider_subscription_id))throw Error('unavailable');
   const r=await (env.BILLING_COUPON_FETCH||fetch)(`https://api.stripe.com/v1/subscriptions/${row.provider_subscription_id}?expand%5B%5D=discounts`,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20'},signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error('unavailable');const sub=await r.json();
   if(sub.id!==row.provider_subscription_id||sub.livemode!==live)throw Error('mismatch');
   if(!active(sub)){states.set(row.id,{...state,category:'inactive',monthly_yen:0});return;}
   const category=couponCategory(sub);let amount=Number(row.recurring_amount_yen||0);
   const prices=sub.items?.data;
   if(prices?.length && prices.every(i=>i.price?.currency==='jpy' && Number.isFinite(i.price.unit_amount) && i.price.recurring?.interval=== (row.billing_interval==='annual'?'year':'month') && (i.price.recurring.interval_count||1)===1))amount=prices.reduce((n,i)=>n+i.price.unit_amount*(i.quantity||1),0);
   if(category==='unknown')throw Error('unresolved_discount');
   for(const d of sub.discounts||(sub.discount?[sub.discount]:[])){
    if(d.deleted||(d.end&&d.end<=Date.now()/1000))continue;const c=d.coupon||d.source?.coupon;
    if(c.applies_to&&(!sub.items?.data?.length||sub.items.data.some(i=>!c.applies_to.products?.includes(typeof i.price?.product==='string'?i.price.product:i.price?.product?.id))))throw Error('product_specific_discount');
    if(c.percent_off!=null)amount*=Math.max(0,1-Number(c.percent_off)/100);
    else if(c.amount_off!=null&&c.currency==='jpy')amount=Math.max(0,amount-Number(c.amount_off));
    else throw Error('unsupported_discount');
   }
   state={category,monthly_yen:category==='free_coupon'?0:month(row,amount),trial:sub.status==='trialing',cancel:sub.cancel_at_period_end===true||Number(row.cancel_at_period_end)===1};
   const frees=(sub.discounts||(sub.discount?[sub.discount]:[])).filter(d=>!d.deleted&&(!d.end||d.end>Date.now()/1000)&&Number((d.coupon||d.source?.coupon)?.percent_off)===100);
   state.free_until=category==='free_coupon'?(frees.length&&frees.every(d=>d.end)?new Date(Math.max(...frees.map(d=>d.end))*1000).toISOString():null):(state.trial&&sub.trial_end?new Date(sub.trial_end*1000).toISOString():null);
   await env.BILLING_COUPON_OBSERVER?.(row,state);
  }catch{ /* Unknown is visible and excluded from confirmed forecast. */ }
  states.set(row.id,state);
 }));
 const group=items=>{const bins=new Map(),result={total:0,free_coupon:0,other_discount:0,trial_without_coupon:0,paid_without_coupon:0,unknown:0,cancel_scheduled:0,recurring_monthly_yen:0,current_paid_monthly_yen:0};
  for(const row of items.filter(active)){const s=states.get(row.id);if(!s||s.category==='inactive')continue;const key=row.customer_id;let bin=bins.get(key);if(!bin){bin={categories:new Set(),cancel:false};bins.set(key,bin);}bin.categories.add(s.category==='no_coupon'?(s.trial?'trial_without_coupon':'paid_without_coupon'):s.category);bin.cancel ||= s.cancel;
   if(s.monthly_yen!==null){if(!s.cancel)result.recurring_monthly_yen+=s.monthly_yen;if(!s.trial)result.current_paid_monthly_yen+=s.monthly_yen;}
  }
  for(const b of bins.values()){result.total++;result[b.categories.size===1?[...b.categories][0]:'unknown']++;if(b.cancel)result.cancel_scheduled++;}return result;};
 const attributes=group(rows);
 summary.kpis.active_customers=attributes.total;
 summary.kpis.recurring_monthly_yen=attributes.recurring_monthly_yen;
 summary.kpis.current_paid_monthly_yen=attributes.current_paid_monthly_yen;
 summary.membership=attributes;
 summary.breakdown=summary.breakdown.map(g=>{const attrs=group(rows.filter(r=>r.product_code===g.product_code));return {...g,recurring_monthly_yen:attrs.recurring_monthly_yen,membership:attrs};});
 summary.quality.coupon_verified=attributes.unknown===0;
 summary.quality.forecast_definition='Current discount-adjusted monthly equivalent; includes ordinary trials after trial; excludes free coupons, cancel-scheduled and unverified subscriptions. No guarantee of future revenue.';
 return summary;
}
