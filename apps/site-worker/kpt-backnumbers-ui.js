// Override only the two KPT UI assets; retain the current application and API layers.
export function withKptBacknumbers(previous,assets){return {...previous,async fetch(request,env,ctx){
 const match=new URL(request.url).pathname.match(/^\/apps\/(?:totonoe|tsuzuri|column)-studio\/(kpt\.(?:js|css))$/);
 if(request.method==='GET'&&match&&typeof assets[match[1]]==='string')return new Response(assets[match[1]],{headers:{'content-type':match[1].endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-studio-kpt-backnumbers':'20261018'}});
 return previous.fetch(request,env,ctx);
}};}
