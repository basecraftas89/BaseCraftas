// Patch current production snapshots, preserving the existing Worker modules and bindings.
import fs from 'node:fs/promises';
import path from 'node:path';
const scratch=path.resolve(process.argv[2]);
const deploy=process.argv.includes('--deploy');
const authPath='/Users/kantoshi/Library/Preferences/.wrangler/config/default.toml';
const apiBase='https://api.cloudflare.com/client/v4/accounts/142982627bdfc09489c4aeeb2e3465a7/workers/scripts/';
const couponCode=(await fs.readFile('apps/tsuzuri-studio-api/src/member-coupon-summary.js','utf8')).replace(/^export /gm,'');
const wrapper=(await fs.readFile('apps/site-worker/member-coupon-release.js','utf8')).replace(/^export /gm,'');
const script=await fs.readFile('apps/tsuzuri-studio/member-coupon-dashboard.js','utf8');
let token;
if(deploy)token=(await fs.readFile(authPath,'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
async function api(name,suffix,init={}){const r=await fetch(apiBase+name+suffix,{...init,headers:{Authorization:'Bearer '+token,...init.headers}});const data=await r.json();if(!r.ok||!data.success)throw Error(name+' '+r.status+' '+JSON.stringify(data.errors));return data.result;}
for(const name of (process.argv.includes('--api-only') ? ['column-studio-api'] : ['column-studio-api','basecraftas'])){
  const before=JSON.parse(await fs.readFile(path.join(scratch,name+'-metadata.json'),'utf8'));
  const original=await fs.readFile(path.join(scratch,name+'-before.mjs'),'utf8');
  let code;
  if(name==='column-studio-api'){
    const needle='    if (path === "/api/admin/billing-summary" && request.method === "GET")';
    if(original.split(needle).length!==2)throw Error('Unexpected live API layout');
    const handler=`    if (path === "/api/member-coupon-summary" && request.method === "GET") {\n      const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);\n      if (auth.error) return auth.error;\n      try { return json(await aggregateMemberCoupons(env), {headers:{"cache-control":"no-store"}}); }\n      catch { return json({error:"member_summary_unavailable"},{status:503}); }\n    }\n`;
    if(original.includes('aggregateMemberCoupons')){
      const marker='// Only aggregate categories leave the server;';
      if(original.split(marker).length!==2)throw Error('Ambiguous coupon module');
      const existing=original.slice(original.indexOf(marker));
      if(!existing.trimEnd().endsWith("return { generated_at: new Date().toISOString(), environment: live ? 'live' : 'test', groups };\n}"))throw Error('Unexpected module boundary');
      code=original.slice(0,original.indexOf(marker))+couponCode;
      if(code.slice(0,original.indexOf(marker))!==original.slice(0,original.indexOf(marker)))throw Error('Existing code changed');
    }else code=original.replace(needle,handler+needle)+'\n'+couponCode;
  }else{
    if(!original.includes('worker_default as default'))throw Error('Unexpected live site layout');
    code=original+'\n'+wrapper+'\nconst memberCouponRelease=withMemberCouponDashboard({fetch:worker_default.fetch.bind(worker_default)},'+JSON.stringify(script)+');\nworker_default.fetch=memberCouponRelease.fetch;\n';
  }
  await fs.writeFile(path.join(scratch,name+'-release.mjs'),code);
  if(!deploy){console.log(JSON.stringify({name,prepared:true}));continue;}
  const current=await api(name,'/deployments');
  if(current.deployments[0].id!==before.deployments.deployments[0].id)throw Error('Concurrent deployment: '+name);
  const settings=before.settings;
  const metadata={main_module:before.modules[0].name,compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,bindings:settings.bindings.filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],keep_assets:true,usage_model:settings.usage_model,logpush:settings.logpush,tags:settings.tags,tail_consumers:settings.tail_consumers,observability:settings.observability,annotations:{'workers/message':'Authenticated aggregate member coupon dashboard; preserve live billing, site and enrollment'}};
  const body=new FormData();body.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const mod of before.modules){const bytes=mod===before.modules[0]?code:await fs.readFile(path.join(scratch,mod.path));body.set(mod.field,new Blob([bytes],{type:mod.type}),mod.name);}
  await api(name,'',{method:'PUT',body});
  const after=await api(name,'/settings');
  const canonical=b=>JSON.stringify(b.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort());
  if(canonical(after.bindings)!==canonical(settings.bindings))throw Error('Binding change: '+name);
  const versions=(await api(name,'/deployments')).deployments[0].versions;
  const result={name,versions,bindingsPreserved:true};
  await fs.writeFile(path.join(scratch,name+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
