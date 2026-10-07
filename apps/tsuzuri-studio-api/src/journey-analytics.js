export const journeyMembers = Object.freeze({kanto:'kanto-toshiki',kajiwara:'kajiwara-yusuke',kimura:'kimura-koharu',ito:'ito-masaya',tsunashima:'tsunashima-shu',kojima:'kojima-ken',kaigaishi:'kaigaishi-shogo',kuroishi:'kuroishi-ryota',kaito:'kaito-taisho',nakagawa:'nakagawa-masahiro'});
const media=new Set(['x','instagram','facebook','line','note','youtube','threads','linkedin','sns','eight','prairie_card']);
const cookie=(request,name)=>request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
export function excludedJourney(request){return cookie(request,'totonoe_internal')==='1'||/bot|crawler|spider|headless|chatgpt-user|claude|gptbot|oai-searchbot/i.test(request.headers.get('user-agent')||'')||request.cf?.botManagement?.verifiedBot===true;}
export function journeyPath(value){
 if(typeof value!=='string'||!/^\/projects\/totonoe\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]*\/?$/.test(value)||value.length>220)return '';
 if(/\/IROHA\/(?!index(?:\.html)?\/?$|subscribe(?:\.html)?\/?$)|\/TAYORI\/(?!subscribe(?:\.html)?\/?$)/.test(value))return '';
 return value;
}
export function journeyAttribution(params){
 const raw=String(params?.content||''),owner=Object.values(journeyMembers).find(m=>raw===m||raw.startsWith(m+'_'))||'';
 const source=media.has(params?.source)?params.source:'';
 const valid=owner&&source&&params?.campaign==='totonoe_team'&&/^[a-z0-9_-]{1,150}$/.test(raw);
 return {owner:valid?owner:'',source:valid?source:'direct',link_key:valid?raw:''};
}
function out(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});}
async function sessionFor(request,env){const id=cookie(request,'totonoe_journey');if(!/^[a-f0-9-]{36}$/.test(id))return null;return env.DB.prepare("SELECT * FROM journey_sessions WHERE id=? AND last_seen_at > ?").bind(id,new Date(Date.now()-30*60*1000).toISOString()).first();}
export async function collectJourney(request,env){
 if(excludedJourney(request))return out({excluded:true});
 const origin=new URL(env.PUBLIC_SITE_ORIGIN||request.url).origin;
 if(request.headers.get('origin')!==origin||!/^application\/json/.test(request.headers.get('content-type')||''))return out({error:'forbidden'},403);
 const raw=await request.text();if(raw.length>1800)return out({error:'too_large'},413);
 let body;try{body=JSON.parse(raw);}catch{return out({error:'invalid_event'},400);}
 const path=journeyPath(body.path),target=body.target?journeyPath(body.target):'';
 if(!path||!['page_view','cta_click'].includes(body.kind)||!/^[-a-f0-9]{36}$/.test(body.id||'')||(body.kind==='cta_click'&&!target))return out({error:'invalid_event'},400);
 // Bound public ingestion without storing an IP address.
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode((env.CUSTOMER_AUTH_SECRET||'')+'|'+(request.headers.get('cf-connecting-ip')||'unknown')));
 const key=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join(''),bucket=Math.floor(Date.now()/60000);
 const limit=await env.DB.prepare('INSERT INTO journey_rate(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1 WHERE count<120').bind(key,bucket).run();
 if(!limit.meta?.changes)return out({error:'rate_limited'},429);
 await env.DB.prepare('DELETE FROM journey_rate WHERE bucket<?').bind(bucket-60).run();
 const duplicate=await env.DB.prepare('SELECT id FROM journey_events WHERE id=?').bind(body.id).first();
 if(duplicate)return out({ok:true});
 const now=new Date().toISOString(),tag=journeyAttribution(body.attribution);
 let session=await sessionFor(request,env);
 // A different tagged link starts a new attributable visit. Internal navigation keeps its attribution.
 if(session&&tag.owner&&(session.owner!==tag.owner||session.source!==tag.source||session.link_key!==tag.link_key))session=null;
 if(!session){session={id:crypto.randomUUID()};await env.DB.prepare('INSERT INTO journey_sessions(id,source,owner,link_key,landing_path,started_at,last_seen_at) VALUES(?,?,?,?,?,?,?)').bind(session.id,tag.source,tag.owner,tag.link_key,path,now,now).run();}
 await env.DB.prepare('INSERT OR IGNORE INTO journey_events(id,session_id,kind,path,target,occurred_at) VALUES(?,?,?,?,?,?)').bind(body.id,session.id,body.kind,path,target,now).run();
 await env.DB.prepare('UPDATE journey_sessions SET last_seen_at=? WHERE id=?').bind(now,session.id).run();
 return out({ok:true},200,{'set-cookie':`totonoe_journey=${session.id}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`});
}
export async function recordJourneyCheckout(request,env,attemptId){
 if(excludedJourney(request))return;
 try{const session=await sessionFor(request,env);if(session)await env.DB.prepare('INSERT OR IGNORE INTO journey_checkouts(attempt_id,session_id,created_at) VALUES(?,?,?)').bind(attemptId,session.id,new Date().toISOString()).run();}
 catch{console.warn('journey.checkout_measurement_unavailable');} // Never block an actual checkout.
}
export async function journeySummary(request,env){
 const config=await env.DB.prepare('SELECT started_at FROM journey_config WHERE id=1').first();if(!config)return out({error:'analytics_not_configured'},503);
 const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),url=new URL(request.url);
 const start=url.searchParams.get('start')||today,end=url.searchParams.get('end')||today;
 const from=Date.parse(start+'T00:00:00+09:00'),to=Date.parse(end+'T00:00:00+09:00')+86400000;
 if(!/^20\d\d-\d\d-\d\d$/.test(start)||!/^20\d\d-\d\d-\d\d$/.test(end)||!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to-from>93*86400000)return out({error:'invalid_date_range'},400);
 const outcomesAsOf=new Date().toISOString();
 const lower=new Date(Math.max(from,Date.parse(config.started_at))).toISOString(),upper=new Date(to).toISOString();
 const {results:sessions=[]}=await env.DB.prepare('SELECT id,source,owner,link_key,landing_path,started_at FROM journey_sessions WHERE started_at>=? AND started_at<?').bind(lower,upper).all();
 const {results:events=[]}=await env.DB.prepare('SELECT e.session_id,e.kind,e.path,e.target,e.occurred_at FROM journey_events e JOIN journey_sessions s ON s.id=e.session_id WHERE s.started_at>=? AND s.started_at<? AND e.occurred_at<? ORDER BY e.occurred_at,e.id').bind(lower,upper,upper).all();
 const {results:conversions=[]}=await env.DB.prepare(`SELECT jc.session_id, a.status,
  MAX(CASE WHEN bt.status='paid' AND bt.amount_yen>0 AND bt.occurred_at<? THEN 1 ELSE 0 END) AS paid,
  MIN(CASE WHEN bt.status='paid' AND bt.amount_yen>0 AND bt.transaction_type='recurring' THEN bt.occurred_at END) AS first_recurring_at
  FROM journey_checkouts jc JOIN journey_sessions s ON s.id=jc.session_id JOIN stripe_checkout_attempts a ON a.id=jc.attempt_id
  LEFT JOIN customer_subscriptions cs ON cs.provider_subscription_id=a.stripe_subscription_id AND cs.livemode=a.livemode
  LEFT JOIN billing_transactions bt ON bt.subscription_id=cs.id AND bt.livemode=a.livemode
  WHERE s.started_at>=? AND s.started_at<? AND a.livemode=? GROUP BY jc.attempt_id`).bind(outcomesAsOf,lower,upper,env.STRIPE_MODE==='live'?1:0).all();
 const day=t=>new Date(Date.parse(t)+9*3600000).toISOString().slice(0,10),label=s=>s.source==='direct'?'直接・判別不能':s.source;
 const sources=new Map(),landings=new Map(),daily=new Map(),entriesMap=new Map(),links=new Map(),journeys=new Map(),last=new Map();
 for(const s of sessions){const name=label(s),date=day(s.started_at),k=JSON.stringify([date,name,s.landing_path]);sources.set(name,(sources.get(name)||0)+1);landings.set(s.landing_path,(landings.get(s.landing_path)||0)+1);daily.set(date,(daily.get(date)||0)+1);entriesMap.set(k,(entriesMap.get(k)||0)+1);
 const link=JSON.stringify([s.owner,s.source,s.link_key]);if(!links.has(link))links.set(link,{owner:s.owner,source:s.source,link_key:s.link_key,visits:0,cta_sessions:new Set(),checkout_sessions:new Set(),completed_sessions:new Set(),paid_sessions:new Set(),signup_sessions:new Set(),recurring_sessions:new Set(),matured_paid14_sessions:new Set(),matured_visits:0});links.get(link).visits++;if(Date.parse(s.started_at)+14*86400000<=Date.parse(outcomesAsOf))links.get(link).matured_visits++;}
 const byId=new Map(sessions.map(s=>[s.id,s]));
 for(const e of events){const s=byId.get(e.session_id);if(!s)continue;const g=links.get(JSON.stringify([s.owner,s.source,s.link_key]));if(e.kind==='cta_click'){g.cta_sessions.add(s.id);if(/\/(?:TAYORI|IROHA)\/subscribe(?:\.html)?\/?$/.test(e.target||''))g.signup_sessions.add(s.id);}if(e.kind==='page_view'){const previous=last.get(s.id);if(previous&&previous!==e.path){const k=JSON.stringify([previous,e.path]);journeys.set(k,(journeys.get(k)||0)+1);}last.set(s.id,e.path);}}
 for(const c of conversions){const s=byId.get(c.session_id);if(!s)continue;const g=links.get(JSON.stringify([s.owner,s.source,s.link_key]));g.checkout_sessions.add(s.id);if(c.status==='completed')g.completed_sessions.add(s.id);if(Number(c.paid))g.paid_sessions.add(s.id);if(c.first_recurring_at&&Date.parse(c.first_recurring_at)<=Date.parse(outcomesAsOf)){g.recurring_sessions.add(s.id);if(Date.parse(s.started_at)+14*86400000<=Date.parse(outcomesAsOf)&&Date.parse(c.first_recurring_at)>=Date.parse(s.started_at)&&Date.parse(c.first_recurring_at)<Date.parse(s.started_at)+14*86400000)g.matured_paid14_sessions.add(s.id);}}
 const paidIds=new Set(conversions.filter(c=>Number(c.paid)).map(c=>c.session_id)),pathStats=new Map();
 for(const e of events){if(e.kind!=='page_view')continue;const s=byId.get(e.session_id);if(!s)continue;const k=JSON.stringify([s.owner,s.source,s.link_key]);if(!pathStats.has(k))pathStats.set(k,new Map());const paths=pathStats.get(k);if(!paths.has(e.path))paths.set(e.path,{path:e.path,visits:new Set(),paid_sessions:new Set()});const p=paths.get(e.path);p.visits.add(s.id);if(paidIds.has(s.id))p.paid_sessions.add(s.id);}
 const rows=[...links.values()].map(g=>({...g,cta_sessions:g.cta_sessions.size,checkout_sessions:g.checkout_sessions.size,completed_sessions:g.completed_sessions.size,paid_sessions:g.paid_sessions.size,signup_sessions:g.signup_sessions.size,recurring_sessions:g.recurring_sessions.size,matured_paid14_sessions:g.matured_paid14_sessions.size,paths:[...(pathStats.get(JSON.stringify([g.owner,g.source,g.link_key]))?.values()||[])].map(p=>({path:p.path,visits:p.visits.size,paid_sessions:p.paid_sessions.size}))}));
 const allDaily=[];for(let t=Math.max(from,Date.parse(day(config.started_at)+'T00:00:00+09:00'));t<to;t+=86400000){const date=day(new Date(t).toISOString());if(date<=end)allDaily.push({date,visits:daily.get(date)||0});}
 return out({generated_at:new Date().toISOString(),measurement_started_at:config.started_at,outcomes_as_of:outcomesAsOf,filters:{start,end},kpis:{visits:sessions.length,identified_visits:sessions.filter(s=>s.owner).length,direct_visits:sessions.filter(s=>!s.owner).length,ai_visits:0},comparison:null,sources:[...sources].map(([label,visits])=>({label,visits})),landings:[...landings].map(([path,visits])=>({path,label:path,visits})),daily:allDaily,entries:[...entriesMap].map(([key,visits])=>{const [date,source,request_path]=JSON.parse(key);return {date,source,request_path,landing_page:request_path,referer_host:'',visits};}),journeys:[...journeys].map(([key,count])=>{const [from_path,to_path]=JSON.parse(key);return {from_path,to_path,from_label:from_path,to_label:to_path,count};}),links:rows,quality:{source:'first_party',internal_excluded:true,bot_excluded:true,attribution:'tagged-link session; 30-minute inactivity',historical_data_deleted:false}});
}
