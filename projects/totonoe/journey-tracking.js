(function(){
 'use strict';
 if(window.__totonoeJourney||!location.pathname.startsWith('/projects/totonoe/'))return;
 window.__totonoeJourney=true;
 var params=new URLSearchParams(location.search),attribution={source:params.get('utm_source'),content:params.get('utm_content'),campaign:params.get('utm_campaign')};
 var endpoint='/api/totonoe-member/api/public/journey-event';
 async function send(kind,target){try{await fetch(endpoint,{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),kind:kind,path:location.pathname,target:target||'',attribution:attribution})});}catch(_){}}
 var initial=send('page_view');
 document.addEventListener('click',function(event){var link=event.target.closest&&event.target.closest('a[href]');if(!link)return;var url;try{url=new URL(link.href,location.href);}catch(_){return;}if(url.origin!==location.origin||!url.pathname.startsWith('/projects/totonoe/'))return;initial.then(function(){return send('cta_click',url.pathname);});});
})();
