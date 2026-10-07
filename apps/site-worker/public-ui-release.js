import publicPaths from '../totonoe-public-ui/manifest.json' with {type:'json'};
export function withPublicUI(worker){
 const prefix='/projects/totonoe/';const targets=new Map();
 for(const path of publicPaths){const target=prefix+path;targets.set(target,target);if(path.endsWith('.html')){targets.set(target.slice(0,-5),target);targets.set(target.slice(0,-5)+'/',target);if(path.endsWith('/index.html')||path==='index.html'){const directory=target.slice(0,-10);targets.set(directory,target);targets.set(directory.replace(/\/$/,''),target);}}}
 return {async fetch(request,env,ctx){
  const url=new URL(request.url),target=targets.get(url.pathname);
  if(!target||!env.PUBLIC_UI_ASSETS||!['GET','HEAD'].includes(request.method))return worker.fetch(request,env,ctx);
  const freshUrl=new URL(url);freshUrl.pathname=target;
  const freshHeaders=new Headers(request.headers);for(const key of ['if-none-match','if-modified-since','if-range'])freshHeaders.delete(key);
  const fresh=await env.PUBLIC_UI_ASSETS.fetch(new Request(freshUrl,{method:request.method,headers:freshHeaders,redirect:'manual'}));
  if(![200,206,304].includes(fresh.status))return new Response('公開ページを読み込めません。時間をおいて再度お試しください。',{status:503,headers:{'cache-control':'no-store','retry-after':'30'}});
  const headers=new Headers(fresh.headers);
  headers.set('cache-control',target.endsWith('.html')?'no-store':'public, max-age=0, must-revalidate');
  headers.set('x-totonoe-public-release','20261004-latest');
  headers.set('x-content-type-options','nosniff');headers.set('x-frame-options','DENY');headers.set('referrer-policy','strict-origin-when-cross-origin');headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');headers.set('strict-transport-security','max-age=31536000');headers.set('content-security-policy',"object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if(/\/TAYORI\/(?:subscribe|login)|\/IROHA\/subscribe/.test(target))headers.set('x-robots-tag','noindex, nofollow');
  return new Response(request.method==='HEAD'?null:fresh.body,{status:fresh.status,headers});
 }};
}
