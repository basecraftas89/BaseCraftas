import paths from '../totonoe-member-ui/manifest.json' with {type:'json'};
const published=new Set(paths.map(path=>'/projects/totonoe/'+path));
export function withMemberUI(worker){return {async fetch(request,env,ctx){
 if(!env.MEMBER_UI_ASSETS||!['GET','HEAD'].includes(request.method))return worker.fetch(request,env,ctx);
 const url=new URL(request.url);const path=url.pathname;
 const page=/^\/projects\/totonoe\/TAYORI(?:\/(?:index(?:\.html)?)?)?\/?$/.test(path)?'/projects/totonoe/TAYORI/index.html':/^\/projects\/totonoe\/IROHA\/dashboard(?:\.html)?\/?$/.test(path)?'/projects/totonoe/IROHA/dashboard.html':/^\/projects\/totonoe\/IROHA\/mypage(?:\.html)?\/?$/.test(path)?'/projects/totonoe/IROHA/mypage.html':null;
 if(page){const original=await worker.fetch(request,env,ctx);if(original.status!==200||!original.headers.get('content-type')?.includes('text/html'))return original;
 const target=new URL(url);target.pathname=page;const fresh=await env.MEMBER_UI_ASSETS.fetch(new Request(target,request));if(fresh.status!==200)return original;
 const headers=new Headers(original.headers);for(const key of ['content-length','content-encoding','etag'])headers.delete(key);headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');headers.set('x-totonoe-member-release','20261003-guides');return new Response(request.method==='HEAD'?null:fresh.body,{status:200,headers});}
 if(published.has(path)&&!path.endsWith('.html')){const response=await env.MEMBER_UI_ASSETS.fetch(request);const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-totonoe-member-release','20261003-guides');return new Response(response.body,{status:response.status,headers});}
 return worker.fetch(request,env,ctx);
}};}
