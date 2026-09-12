(function(){
  'use strict';
  var card=document.getElementById('weekendNextEvent');
  if(!card)return;
  function safeUrl(value){
    try{var url=new URL(String(value||''),location.href);return /^https?:$/.test(url.protocol)?url.href:'';}catch(error){return '';}
  }
  function formatDate(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return '';
    var date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    if(date.getFullYear()!==Number(match[1])||date.getMonth()!==Number(match[2])-1||date.getDate()!==Number(match[3]))return '';
    return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(date)+' 6:00〜6:30';
  }
  fetch('/public-content/weekend-event.json',{cache:'no-store',credentials:'omit'})
    .then(function(response){if(!response.ok)throw new Error('request failed');return response.json();})
    .then(function(data){
      var event=data&&data.event,date=event&&formatDate(event.source_published_at),image=event&&safeUrl(event.hero_url);
      if(!event||!event.title||!date||!image)return;
      var img=document.getElementById('weekendNextImage'),link=document.getElementById('weekendNextLink'),target=safeUrl(event.media_url);
      img.src=image;img.alt=event.title+' 次回開催サムネイル';
      document.getElementById('weekendNextDate').textContent=date;
      document.getElementById('weekendNextTitle').textContent=event.title;
      document.getElementById('weekendNextExcerpt').textContent=event.excerpt||'';
      if(target){link.href=target;link.hidden=false;}
      card.hidden=false;
    }).catch(function(){});
})();
