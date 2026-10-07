import {adjustBillingMembership} from './billing-membership.js';
const DAY=86400000;
const stamp=x=>Date.parse(/Z$|[+-]\d\d:\d\d$/.test(x||'')?x:(x||'').replace(' ','T')+'Z');
const month=x=>new Date(stamp(x)+9*3600000).toISOString().slice(0,7);
const unique=xs=>new Set(xs).size;
const rate=(n,d)=>({numerator:n,denominator:d,value:d?n/d:null});
export async function recordServiceUsage(env,auth,product,kind,resource=''){
 if(auth.access?.staff_access)return;
 try{await env.DB.prepare('INSERT OR IGNORE INTO service_usage_events(customer_id,product_code,kind,resource_id,occurred_at) VALUES(?,?,?,?,?)').bind(auth.customer.id,product,kind,resource,new Date().toISOString().slice(0,16)+':00.000Z').run();}
 catch{console.warn('dashboard.usage_unavailable');}
}
export function computeServiceMetrics({subscriptions,transactions,usage,observations,replacements,measurementStart=0,staffIds=new Set(),statusEvents=[]},from,to,now){
 const within=t=>stamp(t)>=from&&stamp(t)<to;
 const paid=transactions.filter(t=>t.status==='paid'&&t.transaction_type==='recurring'&&Number(t.amount_yen)>0&&stamp(t.occurred_at)<=now);
 const period=transactions.filter(t=>within(t.occurred_at));
 const liveCustomers=new Set(subscriptions.map(s=>s.customer_id));
 // Compare two completed calendar months, never a partially observed current month.
 const endMonth=new Date(Math.min(to,now)+9*3600000).toISOString().slice(0,7);
 const d=new Date(endMonth+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const follow=d.toISOString().slice(0,7);d.setUTCMonth(d.getUTCMonth()-1);const base=d.toISOString().slice(0,7);
 return ['weekly','curriculum'].map(product=>{
 const subs=subscriptions.filter(s=>s.product_code===product),ids=new Set(subs.map(s=>s.id));
 const started=subs.filter(s=>!staffIds.has(s.customer_id)&&within(s.created_at)&&!['incomplete'].includes(s.status));
 const eligible=started.filter(s=>stamp(s.created_at)>=measurementStart);
 const mature=eligible.filter(s=>stamp(s.created_at)+7*DAY<=now);
 const activated=mature.filter(s=>usage.some(u=>u.customer_id===s.customer_id&&u.product_code===product&&stamp(u.occurred_at)>=stamp(s.created_at)&&stamp(u.occurred_at)<stamp(s.created_at)+7*DAY));
 const customers=xs=>unique(xs.map(s=>s.customer_id));
 const free=observations.filter(o=>ids.has(o.subscription_id)&&o.free_until&&stamp(o.observed_at)<=stamp(o.free_until));
 // One eligible ending per subscription; latest verified ending takes precedence.
 const latest=new Map();for(const o of free){if(!latest.has(o.subscription_id)||stamp(latest.get(o.subscription_id).free_until)<stamp(o.free_until))latest.set(o.subscription_id,o);}
 const endings=[...latest.values()].filter(o=>stamp(o.free_until)>=from&&stamp(o.free_until)<to);
 const activeIds=new Set(subs.filter(s=>['active','trialing'].includes(s.status)).map(s=>s.id));
 const endingSoon=[...latest.values()].filter(o=>activeIds.has(o.subscription_id)&&stamp(o.free_until)>=now&&stamp(o.free_until)<now+7*DAY).length;
 const indefinite=observations.filter(o=>activeIds.has(o.subscription_id)&&o.category==='free_coupon'&&!o.free_until);
 const ended=endings.filter(o=>stamp(o.free_until)+7*DAY<=now);
 const converted=ended.filter(o=>paid.some(t=>t.subscription_id===o.subscription_id&&stamp(t.occurred_at)>=stamp(o.free_until)&&stamp(t.occurred_at)<stamp(o.free_until)+7*DAY));
 const monthlyIds=new Set(subs.filter(s=>s.billing_interval==='monthly').map(s=>s.id));
 const baseline=new Set(paid.filter(t=>t.product_code===product&&monthlyIds.has(t.subscription_id)&&month(t.occurred_at)===base).map(t=>t.customer_id));
 const continuing=new Set(paid.filter(t=>month(t.occurred_at)===follow).map(t=>t.customer_id));
 const retained=[...baseline].filter(id=>continuing.has(id)).length;
 const own=period.filter(t=>t.product_code===product);
 const actions=usage.filter(u=>liveCustomers.has(u.customer_id)&&!staffIds.has(u.customer_id)&&u.product_code===product&&within(u.occurred_at));
 const kinds=[...new Set(actions.map(u=>u.kind))].map(kind=>({kind,users:unique(actions.filter(u=>u.kind===kind).map(u=>u.customer_id))}));
 const before=new Map(),ending=new Map();
 for(const e of statusEvents.filter(e=>ids.has(e.subscription_id)).sort((a,b)=>stamp(a.effective_at)-stamp(b.effective_at))){if(stamp(e.effective_at)<from)before.set(e.subscription_id,e);if(stamp(e.effective_at)<Math.min(to,now))ending.set(e.subscription_id,e);}
 const begun=[...before.values()].filter(e=>['active','trialing'].includes(e.status));
 const replaced=new Set(replacements.map(r=>r.source_subscription_id));
 const departed=begun.filter(e=>!replaced.has(e.subscription_id)&&ending.get(e.subscription_id)?.status==='canceled');
 const churn=rate(unique(departed.map(e=>e.customer_id)),unique(begun.map(e=>e.customer_id)));
 const churnUnmeasured=subs.filter(s=>stamp(s.created_at)<from&&!before.has(s.id)).length;if(churnUnmeasured)churn.value=null;
 return {product_code:product,label:product==='weekly'?'TAYORI':'IROHA',list_monthly_yen:product==='weekly'?980:2980,
  activation:rate(customers(activated),customers(mature)),activation_unmeasured:customers(started.filter(s=>stamp(s.created_at)<measurementStart)),activation_waiting:customers(eligible.filter(s=>stamp(s.created_at)+7*DAY>now)),
  free_ending_7d:endingSoon,free_end_unknown:unique(indefinite.map(o=>o.subscription_id)),free_conversion:rate(converted.length,ended.length),free_conversion_waiting:endings.length-ended.length,
  contract_churn:churn,churn_unmeasured:churnUnmeasured,retention:rate(retained,baseline.size),retention_months:{base,follow},retention_lost:baseline.size-retained,
  revenue:{recurring_yen:own.filter(t=>t.status==='paid'&&t.transaction_type==='recurring').reduce((n,t)=>n+Number(t.amount_yen),0),net_yen:own.filter(t=>['paid','refunded'].includes(t.status)).reduce((n,t)=>n+Number(t.amount_yen),0),failed_invoices:unique(own.filter(t=>t.status==='failed').map(t=>t.stripe_invoice_id||t.id))},
  usage:{active_users:unique(actions.map(u=>u.customer_id)),kinds},
  migration_pending:product==='weekly'?replacements.filter(r=>r.status==='pending').length:0,migrations:product==='weekly'?replacements.filter(r=>r.status==='completed'&&within(r.completed_at)).length:0};
 });
}
export async function businessSummary(request,env){
 const url=new URL(request.url),today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),start=url.searchParams.get('start')||today,end=url.searchParams.get('end')||today;
 const from=Date.parse(start+'T00:00:00+09:00'),to=Date.parse(end+'T00:00:00+09:00')+DAY;
 if(!/^20\d\d-\d\d-\d\d$/.test(start)||!/^20\d\d-\d\d-\d\d$/.test(end)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>93*DAY)return new Response(JSON.stringify({error:'invalid_date_range'}),{status:400});
 const live=env.STRIPE_MODE==='live'?1:0;
 const all=async(sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
 const subscriptions=await all('SELECT id,customer_id,product_code,billing_interval,status,provider_subscription_id,recurring_amount_yen,cancel_at_period_end,created_at FROM customer_subscriptions WHERE provider=\'stripe\' AND livemode=?',live);
 const staffIds=new Set((await all("SELECT c.id FROM customer_accounts c JOIN members m ON lower(c.email)=lower(m.email) WHERE m.status='active' AND m.role IN ('admin','editor')")).map(r=>r.id));
 const warning=[];
 const membership=await adjustBillingMembership({kpis:{},quality:{},breakdown:[{product_code:'weekly'},{product_code:'curriculum'}]},subscriptions,{...env,BILLING_COUPON_OBSERVER:async(row,state)=>{
 try{await env.DB.prepare('INSERT OR IGNORE INTO dashboard_discount_observations(subscription_id,category,free_until,observed_at,livemode) VALUES(?,?,?,?,?)').bind(row.id,state.category,state.free_until||'',new Date().toISOString(),live).run();}catch{warning.push('discount_history_unavailable');}
 }});
 const transactions=await all('SELECT id,customer_id,subscription_id,product_code,transaction_type,amount_yen,status,stripe_invoice_id,occurred_at FROM billing_transactions WHERE livemode=?',live);
 const usage=[],coverage={};
 const inputs=[['member','SELECT customer_id,product_code,kind,occurred_at FROM service_usage_events'],['materials',"SELECT customer_id,'weekly' AS product_code,'material' AS kind,occurred_at FROM weekly_material_events"],['questions',"SELECT customer_id,'weekly' AS product_code,'question' AS kind,created_at AS occurred_at FROM weekly_priority_questions"],['answer_videos',"SELECT customer_id,'weekly' AS product_code,'answer_video' AS kind,occurred_at FROM weekly_answer_video_events"],['notes',"SELECT customer_id,'curriculum' AS product_code,'note' AS kind,created_at AS occurred_at FROM iroha_lesson_note_revisions"],['completed',"SELECT p.customer_id,'curriculum' AS product_code,'lesson_complete' AS kind,p.completed_at AS occurred_at FROM iroha_lesson_progress p JOIN iroha_delivery_lessons l ON l.id=p.lesson_id WHERE p.completed_at IS NOT NULL AND l.staff_preview=0"]];
 for(const [key,sql] of inputs){try{usage.push(...await all(sql));coverage[key]=true;}catch{coverage[key]=false;}}
 const observations=await all('SELECT subscription_id,category,free_until,observed_at FROM dashboard_discount_observations WHERE livemode=?',live);
 const replacements=await all('SELECT source_subscription_id,status,completed_at FROM subscription_replacements WHERE livemode=?',live);
 const statusEvents=await all('SELECT subscription_id,customer_id,status,effective_at FROM subscription_status_events WHERE livemode=?',live);
 const health=(await all("SELECT MAX(processed_at) AS last_processed_at,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count FROM stripe_webhook_events WHERE livemode=?",live))[0]||{};
 const config=(await all('SELECT started_at FROM service_measurement_config WHERE id=1'))[0];
 const measurementStart=config?stamp(config.started_at):Date.now();
 const services=computeServiceMetrics({subscriptions,transactions,usage,observations,replacements,measurementStart,staffIds,statusEvents},from,to,Date.now());
 for(const s of services){s.membership=membership.breakdown.find(g=>g.product_code===s.product_code).membership;const required=s.product_code==='weekly'?['member','materials','questions','answer_videos']:['member','notes','completed'];if(required.some(k=>!coverage[k])){s.activation.value=null;s.usage.available=false;}else s.usage.available=true;}
 return new Response(JSON.stringify({generated_at:new Date().toISOString(),filters:{start,end},services,measurement_started_at:config?.started_at||null,quality:{coverage,staff_usage_excluded:true,coupon_verified:membership.quality.coupon_verified,discount_history_warning:warning.length>0,last_webhook_at:health.last_processed_at||null,failed_webhooks:Number(health.failed_count||0)},definitions:{churn:'選択期間の開始時点に有効だった会員のうち、期間末に解約済みとなった割合。無料・体験を含み、IROHAへの移行は除外。開始時点の履歴が不足する場合は非表示。',activation:'契約開始から7日以内に記録された会員ページ利用・資料・質問・動画・学習の利用。7日未経過は分母から除外。',free_conversion:'終了前に記録できた無料クーポン・通常トライアルの終了から7日以内の正の継続課金。期限不明・7日未経過は分母から除外。',retention:'直近の完了した2暦月で、前月の継続課金支払い会員のうち翌月も継続課金を支払った割合。IROHA移行後の支払いも継続に含む。月次の入金継続率であり、契約の存続率とは異なります。年額契約は分母から除外します。'},limitations:['外部セミナーの実参加・外部音声の実視聴は未接続。','利用履歴の計測開始前の記録不足は利用なしと区別が必要。','未利用クーポンの利用資格・職種等の個人属性はこの画面に表示しません。']}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
}

export {adjustBillingMembership};
export async function observeDiscountHistory(env,providerId){
 try{const row=await env.DB.prepare("SELECT id,customer_id,product_code,billing_interval,status,provider_subscription_id,recurring_amount_yen,cancel_at_period_end FROM customer_subscriptions WHERE provider_subscription_id=? AND livemode=?").bind(providerId,env.STRIPE_MODE==='live'?1:0).first();if(!row)return;await adjustBillingMembership({kpis:{},quality:{},breakdown:[]},[row],{...env,BILLING_COUPON_OBSERVER:async(r,state)=>{await env.DB.prepare('INSERT OR IGNORE INTO dashboard_discount_observations(subscription_id,category,free_until,observed_at,livemode) VALUES(?,?,?,?,?)').bind(r.id,state.category,state.free_until||'',new Date().toISOString(),env.STRIPE_MODE==='live'?1:0).run();}});}catch{console.warn('dashboard.discount_history_unavailable');}
}
