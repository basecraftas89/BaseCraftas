// Member initiated changes start at the next paid renewal. No immediate charge.
export const MEMBER_PLANS={weekly_monthly:{label:'TAYORI 月額',amount:980,interval:'month',env:'STRIPE_PRICE_TAYORI_MONTHLY'},weekly_annual:{label:'TAYORI 年額',amount:9800,interval:'year',env:'STRIPE_PRICE_TAYORI_ANNUAL'},curriculum_monthly:{label:'IROHA 月額（TAYORI込み）',amount:2980,interval:'month',env:'STRIPE_PRICE_CURRICULUM_MONTHLY'},curriculum_paid_annual:{label:'IROHA 年額（TAYORI込み）',amount:29800,interval:'year',env:'STRIPE_PRICE_CURRICULUM_PAID_ANNUAL'}};
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{status});};
export async function billingStripe(env,path,params=null,key=''){
 const mode=env.STRIPE_MODE,secret=env.STRIPE_SECRET_KEY;if(!['live','test'].includes(mode)||!new RegExp(`^(sk|rk)_${mode}_`).test(secret||''))fail('stripe_secret_mode_mismatch',503);
 const r=await (env.MEMBER_BILLING_FETCH||fetch)('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{authorization:'Bearer '+secret,'stripe-version':'2024-06-20',...(params?{'content-type':'application/x-www-form-urlencoded'}:{}),...(key?{'idempotency-key':key}:{})},...(params?{body:params}:{}),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok)fail(d.error?.code==='resource_missing'?'subscription_not_found':'billing_provider_failed',r.status===404?409:502);return d;
}
export function planForPrice(env,id){if(!/^price_[A-Za-z0-9_]+$/.test(id||''))return null;return Object.keys(MEMBER_PLANS).find(code=>env[MEMBER_PLANS[code].env]===id)||null;}
export function assertBillingOwnership(sub,customer,live){if(sub.object!=='subscription'||sub.livemode!==live||sub.customer!==customer.stripe_customer_id||sub.metadata?.customer_id!==customer.id)fail('billing_ownership_mismatch',403);}
export function buildRenewalChange(sub,schedule,targetPrice){
 const item=sub.items?.data?.[0],start=schedule.current_phase?.start_date||sub.current_period_start,end=sub.current_period_end||item?.current_period_end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=Date.now()/1000||sub.items?.data?.length!==1||item.quantity!==1||sub.discounts?.length||sub.discount||item.discounts?.length||item.discount||sub.cancel_at_period_end||sub.cancel_at||!['active','trialing'].includes(sub.status)||sub.pending_update||sub.pause_collection||sub.collection_method!=='charge_automatically')fail('billing_change_unavailable');
 if(sub.trial_end&&sub.trial_end!==end)fail('billing_change_unavailable');
 const p=new URLSearchParams({end_behavior:'release',proration_behavior:'none','phases[0][start_date]':String(start),'phases[0][end_date]':String(end),'phases[0][items][0][price]':item.price.id,'phases[0][items][0][quantity]':'1','phases[0][proration_behavior]':'none','phases[1][items][0][price]':targetPrice,'phases[1][items][0][quantity]':'1','phases[1][iterations]':'1','phases[1][proration_behavior]':'none','phases[1][billing_cycle_anchor]':'phase_start'});
 if(sub.trial_end)p.set('phases[0][trial_end]',String(sub.trial_end));return p;
}
export async function ensureMemberBilling(env){await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_plan_changes (subscription_id TEXT PRIMARY KEY, change_id TEXT NOT NULL DEFAULT '', customer_id TEXT NOT NULL, target_plan TEXT NOT NULL, target_price TEXT NOT NULL, effective_at INTEGER NOT NULL, schedule_id TEXT, state TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();}
export async function memberBilling(request,env,deps){
 const auth=await deps.requireCustomerIdentity(request,env);if(auth.error)return auth.error;const customer=auth.customer;
 if(request.method==='POST'){deps.requestGuard(request,env,'/api/customer/billing/contract');if(deps.securityEnabled(env))await deps.requireRecentCustomerAuth(env,customer);}
 await ensureMemberBilling(env);
 const rows=(await env.DB.prepare("SELECT provider_subscription_id FROM customer_subscriptions WHERE customer_id=? AND provider='stripe' AND livemode=? AND status IN ('active','trialing','past_due','unpaid') ORDER BY created_at DESC LIMIT 2").bind(customer.id,Number(env.STRIPE_MODE==='live')).all()).results;
 if(!rows.length)return deps.json({contract:null,reason:'契約管理の対象となる有効な契約はありません。運営メンバー権限でご利用の場合、解約手続きは不要です。'});
 if(rows.length!==1)fail('multiple_subscriptions_require_support');const id=rows[0].provider_subscription_id;if(!/^sub_[A-Za-z0-9]+$/.test(id))fail('subscription_not_found');
 let sub=await billingStripe(env,'subscriptions/'+id);assertBillingOwnership(sub,customer,env.STRIPE_MODE==='live');
 const item=sub.items?.data?.[0],code=planForPrice(env,item?.price?.id),end=sub.current_period_end||item?.current_period_end;
 const change=await env.DB.prepare('SELECT * FROM customer_plan_changes WHERE subscription_id=? AND customer_id=?').bind(id,customer.id).first();
 const free=!code||item?.price?.unit_amount===0||Boolean(sub.discount)||Boolean(sub.discounts?.length)||Boolean(item?.discounts?.length)||Boolean(item?.discount);
 const eligible=!free&&['active','trialing'].includes(sub.status)&&!sub.cancel_at_period_end&&!sub.cancel_at&&sub.items?.data?.length===1&&item.quantity===1&&!sub.pending_update&&!sub.pause_collection&&sub.collection_method==='charge_automatically'&&(!sub.trial_end||sub.trial_end===end);
 await releaseAppliedChange(env,sub,change);
 if(change?.state==='scheduled'&&change.effective_at<=Date.now()/1000&&item?.price?.id===change.target_price)await env.DB.prepare("UPDATE customer_plan_changes SET state='applied' WHERE subscription_id=?").bind(id).run();
 let pending=change&&['preparing','scheduled','failed'].includes(change.state)&&change.effective_at>Date.now()/1000?change:null;
 const view=()=>({contract:{plan:code,label:MEMBER_PLANS[code]?.label||'無料特典・会員プラン',amount:free?null:MEMBER_PLANS[code].amount,status:sub.status,renewal_at:end,cancel_at_period_end:sub.cancel_at_period_end,free_benefit:free},options:eligible&&!sub.schedule?Object.entries(MEMBER_PLANS).filter(([c])=>c!==code).map(([c,p])=>({code:c,label:p.label,amount:p.amount,interval:p.interval})):[],pending:pending?{target_plan:pending.target_plan,label:MEMBER_PLANS[pending.target_plan]?.label,amount:MEMBER_PLANS[pending.target_plan]?.amount,effective_at:pending.effective_at,state:pending.state}:null,version:{subscription_id:id,price:item?.price?.id,renewal_at:end}});
 if(request.method==='GET')return deps.json(view());
 const input=await deps.readJson(request);if(!input)fail('invalid_json',400);
 if(input.action==='cancel_change'){
  if(pending&&!pending.schedule_id&&!sub.schedule){await env.DB.prepare("UPDATE customer_plan_changes SET state='removed',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND customer_id=?").bind(id,customer.id).run();return deps.json({removed:true});}
  if(!pending||!pending.schedule_id||sub.schedule!==pending.schedule_id)fail('billing_change_unavailable');
  const schedule=await billingStripe(env,'subscription_schedules/'+pending.schedule_id);if(schedule.subscription!==id||schedule.livemode!==(env.STRIPE_MODE==='live'))fail('billing_ownership_mismatch',403);
  const released=await billingStripe(env,'subscription_schedules/'+pending.schedule_id+'/release',new URLSearchParams({preserve_cancel_date:'true'}),'member-change-release:'+pending.schedule_id);
  if(released.released_subscription!==id)fail('billing_schedule_verification_failed',502);
  await env.DB.prepare("UPDATE customer_plan_changes SET state='removed',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND customer_id=?").bind(id,customer.id).run();return deps.json({removed:true});
 }
 const plan=MEMBER_PLANS[input.target_plan];if(!eligible||!plan||input.target_plan===code)fail('billing_change_unavailable');
 if(input.version?.subscription_id!==id||input.version?.price!==item.price.id||input.version?.renewal_at!==end)fail('billing_quote_expired');
 const price=await billingStripe(env,'prices/'+env[plan.env]);if(price.livemode!==(env.STRIPE_MODE==='live')||price.unit_amount!==plan.amount||price.currency!=='jpy'||price.recurring?.interval!==plan.interval||price.recurring?.interval_count!==1||!price.active)fail('billing_price_mismatch',503);
 if(input.action==='preview')return deps.json({...view(),quote:{target_plan:input.target_plan,label:plan.label,amount:plan.amount,interval:plan.interval,effective_at:end}});
 if(input.action!=='schedule'||input.confirm!==true)fail('billing_confirmation_required',400);
 if(sub.schedule&&(!pending||pending.target_plan!==input.target_plan))fail('billing_change_already_scheduled');
 if(pending&&pending.target_plan!==input.target_plan)fail('billing_change_already_scheduled');
 if(!pending){const result=await env.DB.prepare("INSERT INTO customer_plan_changes(subscription_id,change_id,customer_id,target_plan,target_price,effective_at,state) VALUES(?,?,?,?,?,?,'preparing') ON CONFLICT(subscription_id) DO UPDATE SET change_id=excluded.change_id,target_plan=excluded.target_plan,target_price=excluded.target_price,effective_at=excluded.effective_at,schedule_id=NULL,state='preparing',updated_at=CURRENT_TIMESTAMP WHERE customer_plan_changes.state IN ('removed','applied')").bind(id,crypto.randomUUID(),customer.id,input.target_plan,price.id,end).run();if(!result.meta?.changes)fail('billing_change_already_scheduled');}
 pending=await env.DB.prepare('SELECT * FROM customer_plan_changes WHERE subscription_id=? AND customer_id=?').bind(id,customer.id).first();
 try{
  let schedule=pending?.schedule_id?await billingStripe(env,'subscription_schedules/'+pending.schedule_id):await billingStripe(env,'subscription_schedules',new URLSearchParams({from_subscription:id}),'member-change-create:'+pending.change_id);
  if(schedule.subscription!==id||schedule.livemode!==(env.STRIPE_MODE==='live')||!/^sub_sched_[A-Za-z0-9]+$/.test(schedule.id))fail('billing_ownership_mismatch',403);
  await env.DB.prepare("UPDATE customer_plan_changes SET schedule_id=?,updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND customer_id=?").bind(schedule.id,id,customer.id).run();
  const params=buildRenewalChange(sub,schedule,price.id);params.set('metadata[service]','totonoe-member-plan-change');params.set('metadata[customer_id]',customer.id);
  schedule=await billingStripe(env,'subscription_schedules/'+schedule.id,params,'member-change-update:'+schedule.id+':'+input.target_plan);
  const next=schedule.phases?.find(p=>p.start_date===end);if(next?.items?.[0]?.price!==price.id||next?.proration_behavior!=='none'||schedule.end_behavior!=='release')fail('billing_schedule_verification_failed',502);
  await env.DB.prepare("UPDATE customer_plan_changes SET state='scheduled',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND customer_id=?").bind(id,customer.id).run();return deps.json({scheduled:true,effective_at:end,label:plan.label,amount:plan.amount});
 }catch(error){await env.DB.prepare("UPDATE customer_plan_changes SET state='failed',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND customer_id=?").bind(id,customer.id).run();throw error;}
}

// A late webhook must never restore the old plan after a scheduled change.
export async function refreshMemberPlanChange(env,attempt,object){
 if(env.MEMBER_PLAN_CHANGES_ENABLED!=='true'||!object.items)return null;
 await ensureMemberBilling(env);const id=String(object.id||'');const row=await env.DB.prepare("SELECT * FROM customer_plan_changes WHERE subscription_id=? AND customer_id=? AND state IN ('preparing','scheduled','failed','applied')").bind(id,attempt.customer_id).first();if(!row)return null;
 const current=await billingStripe(env,'subscriptions/'+id);if(current.id!==id||current.livemode!==(env.STRIPE_MODE==='live')||current.metadata?.customer_id!==attempt.customer_id)fail('billing_ownership_mismatch',403);
 await releaseAppliedChange(env,current,row);
 const code=planForPrice(env,current.items?.data?.[0]?.price?.id);if(!code||current.items?.data?.length!==1)fail('billing_price_mismatch',503);
 return {object:current,attempt:{...attempt,plan_code:code,recurring_amount_yen:MEMBER_PLANS[code].amount},status:current.status};
}

async function releaseAppliedChange(env,sub,row){
 if(!row?.schedule_id||sub.schedule!==row.schedule_id||row.effective_at>Date.now()/1000||sub.items?.data?.[0]?.price?.id!==row.target_price)return;
 const released=await billingStripe(env,'subscription_schedules/'+row.schedule_id+'/release',new URLSearchParams({preserve_cancel_date:'true'}),'member-change-applied-release:'+row.schedule_id);
 if(released.released_subscription!==sub.id)fail('billing_schedule_verification_failed',502);
 sub.schedule=null;
}
