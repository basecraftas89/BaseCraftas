// Apply an additive migration and a scoped patch to freshly captured live snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const scratch=path.resolve(process.argv[2]),deploy=process.argv.includes('--deploy');
const account='142982627bdfc09489c4aeeb2e3465a7',root='https://api.cloudflare.com/client/v4/accounts/'+account;
const bundle=await build({entryPoints:['apps/tsuzuri-studio-api/src/journey-analytics.js'],bundle:true,format:'iife',globalName:'JourneyAnalytics',write:false});
const tracker=await fs.readFile('projects/totonoe/journey-tracking.js','utf8'),dashboard=await fs.readFile('apps/tsuzuri-studio/journey-dashboard.js','utf8');
const wrapper=(await fs.readFile('apps/site-worker/journey-release.js','utf8')).replace(/^export /gm,'');
const token=deploy?(await fs.readFile('/Users/kantoshi/Library/Preferences/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1]:null;
async function api(suffix,init={}){const response=await fetch(root+suffix,{...init,headers:{Authorization:'Bearer '+token,...init.headers}});const data=await response.json();if(!response.ok||!data.success)throw Error(response.status+' '+JSON.stringify(data.errors));return data.result;}
function replaceOnce(source,needle,replacement){if(source.split(needle).length!==2)throw Error('Unexpected live layout: '+needle);return source.replace(needle,replacement);}
const prepared=[];
for(const name of (process.argv.includes('--site-only')?['basecraftas']:['column-studio-api','basecraftas'])){
 const before=JSON.parse(await fs.readFile(path.join(scratch,name+'-metadata.json'),'utf8')),original=await fs.readFile(path.join(scratch,name+'-before.mjs'),'utf8');let code=original;
 if(name==='column-studio-api'&&original.includes('JourneyAnalytics.collectJourney'))throw Error('Already patched; inspect live state before updating');
 if(name==='column-studio-api'){
  code=replaceOnce(code,'    "GET /api/health",','    "GET /api/health",\n    "POST /api/public/journey-event",');
  code=replaceOnce(code,'    const session = await createStripeCheckoutSession(env, params, idempotencyKey);','    const session = await createStripeCheckoutSession(env, params, idempotencyKey);\n    await JourneyAnalytics.recordJourneyCheckout(request, env, attemptId);');
  code=replaceOnce(code,'    if (path === "/api/analytics-summary" && request.method === "GET") return analyticsSummary(request, env);',`    if (path === "/api/public/journey-event" && request.method === "POST") return JourneyAnalytics.collectJourney(request, env);
    if (path === "/api/analytics-summary" && request.method === "GET") {
      const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
      if (auth.error) return auth.error;
      return JourneyAnalytics.journeySummary(request, env);
    }`);
  code+='\n'+bundle.outputFiles[0].text;
 }else{
  if(!original.includes('worker_default as default'))throw Error('Unexpected site module');
  if(original.includes('const journeyRelease=')){const marker='\n// Preserve live assets; only modify measurement';if(original.split(marker).length!==2)throw Error('Unexpected wrapper boundary');code=original.slice(0,original.indexOf(marker));}
  code+='\n'+wrapper+'\nconst journeyRelease=withJourneyMeasurement({fetch:worker_default.fetch.bind(worker_default)},'+JSON.stringify(tracker)+','+JSON.stringify(dashboard)+');\nworker_default.fetch=journeyRelease.fetch;\n';
 }
 await fs.writeFile(path.join(scratch,name+'-release.mjs'),code);prepared.push({name,before,code});console.log(JSON.stringify({name,prepared:true}));
}
if(deploy){
 // Validate both baselines before making either change.
 for(const {name,before} of prepared){const current=await api('/workers/scripts/'+name+'/deployments');if(current.deployments[0].id!==before.deployments.deployments[0].id)throw Error('Concurrent release: '+name);}
 const sql=await fs.readFile('apps/tsuzuri-studio-api/migrations/20261005_journey_analytics.sql','utf8');
 if(!process.argv.includes('--site-only'))await api('/d1/database/67c5a478-7a5d-48af-9e81-c34da1362263/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql})});
 for(const {name,before,code} of prepared){
  const settings=before.settings;
  const metadata={main_module:before.modules[0].name,compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,bindings:settings.bindings.filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],keep_assets:true,usage_model:settings.usage_model,logpush:settings.logpush,tags:settings.tags,tail_consumers:settings.tail_consumers,observability:settings.observability,annotations:{'workers/message':'Fresh anonymous journey analytics; internal/browser and known-bot exclusion; preserve billing and permissions'}};
  const body=new FormData();body.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const mod of before.modules){const bytes=mod===before.modules[0]?code:await fs.readFile(path.join(scratch,mod.path));body.set(mod.field,new Blob([bytes],{type:mod.type}),mod.name);}
  await api('/workers/scripts/'+name,{method:'PUT',body});
  const after=await api('/workers/scripts/'+name+'/settings'),canonical=b=>JSON.stringify(b.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort());
  if(canonical(after.bindings)!==canonical(settings.bindings))throw Error('Binding change: '+name);
  const result={name,versions:(await api('/workers/scripts/'+name+'/deployments')).deployments[0].versions,bindingsPreserved:true,previousVersions:before.deployments.deployments[0].versions};
  await fs.writeFile(path.join(scratch,name+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
 const counts=await api('/d1/database/67c5a478-7a5d-48af-9e81-c34da1362263/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:'SELECT started_at,(SELECT COUNT(*) FROM journey_sessions) AS visits FROM journey_config WHERE id=1'})});console.log(JSON.stringify({measurement:counts[0].results}));
}
