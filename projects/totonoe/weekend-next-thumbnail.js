(function(){
  'use strict';
  var card=document.getElementById('weekendNextEvent');
  if(!card)return;
  function safeUrl(value){
    try{var url=new URL(String(value||''),location.href);return /^https?:$/.test(url.protocol)?url.href:'';}catch(error){return '';}
  }
  fetch('/public-content/weekend-event.json',{cache:'no-store',credentials:'omit'})
    .then(function(response){if(!response.ok)throw new Error('request failed');return response.json();})
    .then(function(data){
      var event=data&&data.event,image=event&&safeUrl(event.hero_url);
      if(!image)return;
      document.getElementById('weekendNextImage').src=image;
      card.hidden=false;
    }).catch(function(){});
})();
