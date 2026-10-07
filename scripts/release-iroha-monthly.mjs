import fs from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve(process.argv[2]);
const token=(await fs.readFile('/Users/kantoshi/Library/Preferences/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const base='https://api.cloudflare.com/client/v4/accounts/142982627bdfc09489c4aeeb2e3465a7/workers/scripts/';
async function api(name,suffix,options={}){const r=await fetch(base+name+suffix,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});if(options.raw){if(!r.ok)throw Error('Fetch '+r.status);return r;}const j=await r.json();if(!r.ok||!j.success)throw Error(JSON.stringify(j.errors));return j.result;}
await fs.mkdir(dir,{recursive:true});
if(process.argv.includes('--snapshot')){
 for(const name of (process.argv.includes('--site-only')?['basecraftas']:['column-studio-api','basecraftas'])){
  const [settings,deployments,r]=await Promise.all([api(name,'/settings'),api(name,'/deployments'),api(name,'',{raw:true})]);
  const form=await r.formData();const modules=[];
  for(const [field,file]of form){const filename=name+'-'+modules.length+'.mjs';await fs.writeFile(path.join(dir,filename),typeof file==='string'?file:Buffer.from(await file.arrayBuffer()));modules.push({field,name:typeof file==='string'?field:file.name,type:typeof file==='string'?'application/javascript+module':file.type,path:filename});}
  await fs.writeFile(path.join(dir,name+'-metadata.json'),JSON.stringify({settings,deployments,modules},null,2));
  console.log(JSON.stringify({name,modules:modules.length,bindings:settings.bindings.filter(b=>b.type==='plain_text'&&/STRIPE_PRICE|IROHA_ENROLLMENT/.test(b.name)).map(b=>({name:b.name,text:b.text}))}));
 }
}
if(process.argv.includes('--prepare')||process.argv.includes('--deploy')){
 const prepared=[];
 const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Unexpected production code: '+a.slice(0,60));return s.replace(a,b);};
 for(const name of (process.argv.includes('--site-only')?['basecraftas']:['column-studio-api','basecraftas'])){
  const before=JSON.parse(await fs.readFile(path.join(dir,name+'-metadata.json'),'utf8'));
  if(before.modules.length!==1)throw Error('Unexpected modules');
  const original=await fs.readFile(path.join(dir,before.modules[0].path),'utf8');let code=original;
  if(name==='column-studio-api'){
   const a=code.indexOf('var BILLING_PLANS = Object.freeze({'),b=code.indexOf('function parseSignatureHeader(',a);if(a<0||b<0)throw Error('Missing billing boundary');
   const billing='const BILLING_PLANS'+(await fs.readFile('apps/tsuzuri-studio-api/src/billing.js','utf8')).split('export const BILLING_PLANS')[1].split('function parseSignatureHeader(')[0].replace(/^export /gm,'');
   code=code.slice(0,a)+billing+code.slice(b);
   const a2=code.indexOf('function buildStripeCheckoutParams('),b2=code.indexOf('__name(buildStripeCheckoutParams,',a2);if(a2<0||b2<0)throw Error('Missing checkout boundary');
   const checkout=(await fs.readFile('apps/tsuzuri-studio-api/src/customer-auth.js','utf8')).split('export function buildStripeCheckoutParams(')[1].split('export async function createStripeCheckoutSession(')[0];
   code=code.slice(0,a2)+'function buildStripeCheckoutParams('+checkout+code.slice(b2);
   // Verify the exact deployed billing functions, including legacy fee inputs.
   const pure=new Function('const TAYORI_TRIAL_PERIOD_DAYS=14;'+code.slice(code.indexOf('const BILLING_PLANS',a),code.indexOf('function parseSignatureHeader('))+'\nreturn {resolveBillingQuote};')();
   for(const feeType of ['first','rejoin']){const q=pure.resolveBillingQuote({planCode:'curriculum_monthly',feeType});if(q.recurringAmountYen!==2980||q.entryFeeAmountYen!==0||q.entryFeePriceEnv!==null)throw Error('Invalid quote');}
   try{pure.resolveBillingQuote({planCode:'curriculum_annual',feeType:'first'});throw Error('Annual still available');}catch(e){if(e.code!=='invalid_plan')throw e;}
  }else{
   const files={};for(const f of ['IROHA/index.html','IROHA/subscribe.html','IROHA/annual-pricing.css','IROHA/iroha-lp.css','IROHA/subscribe.css','iroha-waitlist.js','shared-header.css','shared-header.js','IROHA/assets/iroha-challenges-20261003.webp','IROHA/assets/iroha-learning-20261003.webp','IROHA/assets/iroha-flow-20261003.webp','IROHA/assets/iroha-switch-20261003.webp']){
    const bytes=await fs.readFile('projects/totonoe/'+f),binary=f.endsWith('.webp');
    files['/projects/totonoe/'+f]={body:bytes.toString(binary?'base64':'utf8'),base64:binary,type:binary?'image/webp':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8'};
   }
   if(!original.includes('worker_default as default'))throw Error('Unexpected site');
   const priorMarker='\nconst irohaMonthlyFiles=';
   if(code.includes(priorMarker)){if(code.split(priorMarker).length!==2||!code.trimEnd().endsWith('return response;};'))throw Error('Unexpected pricing wrapper');code=code.slice(0,code.indexOf(priorMarker));}
   code+='\nconst irohaMonthlyFiles='+JSON.stringify(files)+';\nconst irohaMonthlyPreviousFetch=worker_default.fetch.bind(worker_default);\nworker_default.fetch=async function(request,env,ctx){const url=new URL(request.url);const pathname=normalizedPath(url.pathname);const aliases={"/projects/totonoe/IROHA":"/projects/totonoe/IROHA/index.html","/projects/totonoe/IROHA/":"/projects/totonoe/IROHA/index.html","/projects/totonoe/IROHA/index":"/projects/totonoe/IROHA/index.html","/projects/totonoe/IROHA/subscribe":"/projects/totonoe/IROHA/subscribe.html"};const target=aliases[pathname]||pathname;if(!["GET","HEAD"].includes(request.method)||!Object.hasOwn(irohaMonthlyFiles,target))return irohaMonthlyPreviousFetch(request,env,ctx);const file=irohaMonthlyFiles[target];const body=request.method==="HEAD"?null:file.base64?Uint8Array.from(atob(file.body),c=>c.charCodeAt(0)):file.body;const response=protectedResponse(new Response(body,{headers:{"content-type":file.type,"cache-control":"no-store","x-iroha-pricing-release":"20261006-monthly"}}));if(target.endsWith("/subscribe.html"))response.headers.set("x-robots-tag","noindex, nofollow");return response;};\n';
  }
  await fs.writeFile(path.join(dir,name+'-release.mjs'),code);
  const removed=['STRIPE_PRICE_CURRICULUM_ANNUAL','STRIPE_PRICE_IROHA_FIRST','STRIPE_PRICE_IROHA_REJOIN'];
  const bindings=before.settings.bindings.filter(b=>name!=='column-studio-api'||!removed.includes(b.name));
  prepared.push({name,before,code,bindings});console.log(JSON.stringify({name,prepared:true}));
 }
 if(process.argv.includes('--deploy')){
  for(const {name,before}of prepared)if((await api(name,'/deployments')).deployments[0].id!==before.deployments.deployments[0].id)throw Error('Concurrent deployment '+name);
  for(const {name,bindings}of prepared)if(name==='basecraftas'&&!bindings.some(b=>b.name==='PUBLIC_UI_ASSETS'&&b.service==='totonoe-public-ui'))throw Error('Refuse deployment without current public UI binding; restore banner routing first');
  for(const {name,before,code,bindings}of prepared){
   const s=before.settings;const metadata={main_module:before.modules[0].name,compatibility_date:s.compatibility_date,compatibility_flags:s.compatibility_flags,bindings:bindings.filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],keep_assets:true,usage_model:s.usage_model,logpush:s.logpush,tags:s.tags,tail_consumers:s.tail_consumers,observability:s.observability,annotations:{'workers/message':'IROHA monthly 2980 yen only; no entry/rejoin fees; preserve enrollment and unrelated runtime'}};
   const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set(before.modules[0].field,new Blob([code],{type:before.modules[0].type}),before.modules[0].name);
   await api(name,'',{method:'PUT',body:form});const after=await api(name,'/settings');
   const canon=b=>JSON.stringify(b.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort());if(canon(after.bindings)!==canon(bindings))throw Error('Unexpected binding change');
   const result={name,versions:(await api(name,'/deployments')).deployments[0].versions,previousVersions:before.deployments.deployments[0].versions,verifiedBindings:true};await fs.writeFile(path.join(dir,name+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }
 }
}
