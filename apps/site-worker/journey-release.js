// Preserve live assets; only modify measurement on public ToToNoE pages and Studio.
export function withJourneyMeasurement(previous,tracker,dashboard){
 const internalCookie='totonoe_internal=1; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax';
 return {async fetch(request,env,ctx){
  const url=new URL(request.url),studio=/^\/apps\/(?:totonoe|tsuzuri|column)-studio(?:\/|$)/.test(url.pathname);
  const internal=/(?:^|;\s*)totonoe_internal=1(?:;|$)/.test(request.headers.get('cookie')||'')||url.searchParams.get('analytics')==='off';
  const bot=/bot|crawler|spider|headless|chatgpt-user|claude|gptbot|oai-searchbot/i.test(request.headers.get('user-agent')||'')||request.cf?.botManagement?.verifiedBot===true;
  if(url.pathname==='/projects/totonoe/journey-tracking.js')return tracker==null&&!internal&&!bot?previous.fetch(request,env,ctx):new Response(internal||bot?'':tracker,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(url.pathname==='/apps/totonoe-studio/journey-dashboard.js'&&dashboard==null){const assetURL=new URL(request.url);assetURL.pathname='/apps/tsuzuri-studio/journey-dashboard.js';return env.ASSETS.fetch(new Request(assetURL,request));}
  if(url.pathname==='/apps/totonoe-studio/journey-dashboard.js')return new Response(dashboard,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  const response=await previous.fetch(request,env,ctx);
  if(request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html')||(!studio&&!url.pathname.startsWith('/projects/totonoe/')))return response;
  const headers=new Headers(response.headers);for(const key of ['content-length','content-encoding','etag'])headers.delete(key);headers.set('cache-control','private, no-store');headers.set('x-totonoe-journey-release','20261005');
  let html=await response.text();
  if(studio){headers.append('set-cookie',internalCookie);html=html.replace('</body>','<script src="/apps/totonoe-studio/journey-dashboard.js?v=20261005"></script></body>');}
  else if(internal||bot){
   if(url.searchParams.get('analytics')==='off')headers.append('set-cookie',internalCookie);
   html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>/static\.cloudflareinsights\.com|googletagmanager\.com\/gtag|G-1SK6NEFC8V/.test(s)?'':s);
   html=html.replace(/<head\b[^>]*>/i,'$&<script>window.__TOTONOE_MARKETING_TRACKING__=true;</script>');
   if(url.searchParams.get('analytics')==='off')html=html.replace(/<body\b[^>]*>/i,'$&<p role="status" style="padding:16px;background:#edf4ef;color:#17372b">このブラウザを内部確認用に設定しました。新しいアクセス解析には記録しません。</p>');
  }else html=html.replace('</body>','<script src="/projects/totonoe/journey-tracking.js?v=20261005"></script></body>');
  return new Response(html,{status:response.status,headers});
 }};
}
