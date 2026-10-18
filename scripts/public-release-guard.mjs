import fs from 'node:fs/promises';
import path from 'node:path';
export function assertStudioContinuity(name,source){
 if(name!=='basecraftas')return;
 for(const marker of ['restoreStudioSitemapHtml','restoreStudioAnalyticsHtml','siteMapPanel','mapCanvas','journeyLinkPanel','journeyLinks','journeyMetrics','withWeeklyAccessUI','weeklyAccessReports','accessOriginCards'])if(!source.includes(marker))throw Error('Release blocked: missing Studio feature '+marker);
}
export function relativeWorkerModules(source){return [...new Set([...source.matchAll(/\bfrom\s*["'](\.\/[^"']+)["']/g)].map(m=>m[1].replace(/^\.\//,'')))];}
export function assertWorkerModules(source,names){const present=new Set(names.map(n=>n.replace(/^\.\//,'')));for(const name of relativeWorkerModules(source))if(!present.has(name))throw Error('Release blocked: missing Worker module '+name);}

export function assertPublicRelease(name,source,bindings){
 if(!['basecraftas','basecraftas-tayori'].includes(name))return;
 if(/!target\s*\|\|\s*!env\.PUBLIC_UI_ASSETS/.test(source))throw Error('Release blocked: legacy public fallback is forbidden');
 assertStudioContinuity(name,source);
 const required=['MEMBER_API','MEMBER_UI_ASSETS','PUBLIC_UI_ASSETS'];
 for(const key of required)if(!bindings.some(b=>b.name===key&&b.type==='service'))throw Error('Release blocked: missing '+key);
 for(const marker of ['withPublicUI','withPublicCleanUrls','withPageOgp'])if(!source.includes(marker))throw Error('Release blocked: missing public delivery layer '+marker);
}
export async function assertMultipartPublicRelease(name,body){
 if(!['basecraftas','basecraftas-tayori'].includes(name))return;
 const metadata=JSON.parse(await body.get('metadata').text());
 const main=body.get(metadata.main_module);
 if(!main)throw Error('Release blocked: main module unavailable');
 const source=await main.text();
 assertPublicRelease(name,source,metadata.bindings||[]);
 assertWorkerModules(source,[...body.entries()].flatMap(([key,value])=>[key,...(typeof value.name==='string'?[value.name]:[])]));
}
if(process.argv.includes('--source')){
 const config=await fs.readFile('apps/site-worker/wrangler.toml','utf8');
 const main=config.match(/^main\s*=\s*\"([^\"]+)\"/m)?.[1];
 if(!main||main.includes('..'))throw Error('Release blocked: invalid public main');
 const file='apps/site-worker/'+main,source=await fs.readFile(file,'utf8');
 for(const module of relativeWorkerModules(source)){if(module.includes('..'))throw Error('Release blocked: escaping Worker module');await fs.access(path.join(path.dirname(file),module)).catch(()=>{throw Error('Release blocked: missing Worker module '+module)});}
 assertPublicRelease('basecraftas',source,['MEMBER_API','MEMBER_UI_ASSETS','PUBLIC_UI_ASSETS'].filter(n=>config.includes('binding = "'+n+'"')).map(name=>({name,type:'service'})));
 console.log('Public release source guard passed');
}
