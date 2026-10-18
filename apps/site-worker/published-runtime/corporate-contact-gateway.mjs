const topics=new Set(['undecided','growth','flow','vital','other']);
const encoder=new TextEncoder();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
async function keyFor(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sign(key,text){return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function verify(key,text,signature){if(!/^[a-f0-9]{64}$/.test(signature))return false;return crypto.subtle.verify('HMAC',key,new Uint8Array(signature.match(/../g).map(b=>parseInt(b,16))),encoder.encode(text));}
export async function handleContact(request,env){
 try{
  if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405);
  const url=new URL(request.url);if(!['basecraftas.com','www.basecraftas.com'].includes(url.hostname))return json({ok:false,error:'forbidden'},403);
  if(!env.CONTACT_RELAY_KEY||!env.CONTACT_RELAY_URL||!env.CONTACT_RATE_LIMITER)return json({ok:false,error:'unavailable'},503);
  const relay=new URL(env.CONTACT_RELAY_URL);if(relay.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(relay.pathname))return json({ok:false,error:'unavailable'},503);
  const ip=request.headers.get('cf-connecting-ip')||'unknown',key=await keyFor(env.CONTACT_RELAY_KEY);
  if(request.method==='GET'){
   if(!(await env.CONTACT_RATE_LIMITER.limit({key:'session:'+ip})).success)return json({ok:false,error:'rate_limit'},429);
   const issued=Date.now(),nonce=crypto.randomUUID(),plain=issued+'.'+nonce;
   return json({ok:true,token:plain+'.'+await sign(key,'session:'+ip+':'+plain),expiresAt:issued+30*60*1000});
  }
  if(request.headers.get('origin')!==url.origin||['cross-site','none'].includes(request.headers.get('sec-fetch-site')))return json({ok:false,error:'forbidden'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({ok:false,error:'unsupported_media'},415);
  if(Number(request.headers.get('content-length')||0)>20000)return json({ok:false,error:'too_large'},413);
  // Bound the streamed body even when Content-Length is missing.
  const reader=request.body?.getReader();if(!reader)return json({ok:false,error:'invalid_request'},400);let total=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>20000){await reader.cancel();return json({ok:false,error:'too_large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({ok:false,error:'invalid_request'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data))return json({ok:false,error:'invalid_request'},400);
  const match=String(data.token||'').match(/^(\d{13})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/),now=Date.now();
  if(!match||now-Number(match[1])>30*60*1000||Number(match[1])>now+10000||!await verify(key,'session:'+ip+':'+match[1]+'.'+match[2],match[3]))return json({ok:false,error:'invalid_session'},403);
  if(data.website)return json({ok:false,error:'invalid_request'},400);
  const fields={},limits={name:100,email:254,organization:150,message:4000,phone:40,role:100,url:500};const clean={};
  for(const [name,max]of Object.entries(limits)){if(typeof data[name]!=='string'||data[name].length>max)fields[name]='入力内容の長さをご確認ください。';else clean[name]=data[name].trim();}
  if(!clean.name)fields.name='お名前をご入力ください。';
  if(!clean.message)fields.message='ご相談内容をご入力ください。';
  if(!clean.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)||/[\r\n]/.test(clean.email))fields.email='メールアドレスをご確認ください。';
  if(clean.url){try{if(!['http:','https:'].includes(new URL(clean.url).protocol))fields.url='URLをご確認ください。';}catch{fields.url='URLをご確認ください。';}}
  if(!topics.has(data.topic))fields.topic='ご相談のテーマをご確認ください。';
  if(data.consent!==true)fields.consent='個人情報の取り扱いへの同意が必要です。';
  if(!/^[a-f0-9-]{36}$/.test(String(data.requestId||'')))return json({ok:false,error:'invalid_request'},400);
  if(Object.keys(fields).length)return json({ok:false,error:'validation',fields},422);
  if(!(await env.CONTACT_RATE_LIMITER.limit({key:'submit:'+ip})).success)return json({ok:false,error:'rate_limit'},429);
  const payload=JSON.stringify({...clean,topic:data.topic,consent:true,requestId:data.requestId}),timestamp=Math.floor(Date.now()/1000);
  const response=await fetch(relay.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({timestamp,payload,signature:await sign(key,timestamp+'.'+payload)}),redirect:'follow',signal:AbortSignal.timeout(50000)});
  if(!response.ok)return json({ok:false,error:'delivery_failed'},502);
  let result;try{result=await response.json();}catch{return json({ok:false,error:'delivery_failed'},502);}
  if(!result.ok)return json({ok:false,error:['daily_limit','idempotency_conflict'].includes(result.error)?result.error:'delivery_failed'},result.error==='daily_limit'?429:502);
  if(!/^BC-[A-F0-9]{8}$/.test(String(result.receipt||'')))return json({ok:false,error:'delivery_failed'},502);
  return json({ok:true,receipt:result.receipt,emailSent:result.emailSent===true});
 }catch{return json({ok:false,error:'delivery_failed'},502);}
}
