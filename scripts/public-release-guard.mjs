import fs from 'node:fs/promises';
export function assertPublicRelease(name,source,bindings){
 if(!['basecraftas','basecraftas-tayori'].includes(name))return;
 if(/!target\s*\|\|\s*!env\.PUBLIC_UI_ASSETS/.test(source))throw Error('Release blocked: legacy public fallback is forbidden');
 const required=['MEMBER_API','MEMBER_UI_ASSETS','PUBLIC_UI_ASSETS'];
 for(const key of required)if(!bindings.some(b=>b.name===key&&b.type==='service'))throw Error('Release blocked: missing '+key);
 for(const marker of ['withPublicUI','withPublicCleanUrls','withPageOgp'])if(!source.includes(marker))throw Error('Release blocked: missing public delivery layer '+marker);
}
export async function assertMultipartPublicRelease(name,body){
 if(!['basecraftas','basecraftas-tayori'].includes(name))return;
 const metadata=JSON.parse(await body.get('metadata').text());
 const main=body.get(metadata.main_module);
 if(!main)throw Error('Release blocked: main module unavailable');
 assertPublicRelease(name,await main.text(),metadata.bindings||[]);
}
if(process.argv.includes('--source')){
 const config=await fs.readFile('apps/site-worker/wrangler.toml','utf8');
 const main=config.match(/^main\s*=\s*\"([^\"]+)\"/m)?.[1];
 if(!main||main.includes('..'))throw Error('Release blocked: invalid public main');
 const source=await fs.readFile('apps/site-worker/'+main,'utf8');
 assertPublicRelease('basecraftas',source,['MEMBER_API','MEMBER_UI_ASSETS','PUBLIC_UI_ASSETS'].filter(n=>config.includes('binding = "'+n+'"')).map(name=>({name,type:'service'})));
 console.log('Public release source guard passed');
}
