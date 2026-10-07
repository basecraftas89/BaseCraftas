(() => {
  'use strict';
  const section=document.querySelector('.tayori-guide[aria-labelledby="guideVideoTitle"]');
  if(!section)return;
  const frame=document.getElementById('guideVideoFrame'),play=document.getElementById('guideVideoPlay');
  play.addEventListener('click',()=>{
    const video=document.createElement('iframe');
    video.src='https://www.youtube-nocookie.com/embed/gwBLcPxmZ9w?autoplay=1&playsinline=1';
    video.title='TAYORIの使い方・活用方法';video.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';video.allowFullscreen=true;video.referrerPolicy='strict-origin-when-cross-origin';
    frame.replaceChildren(video);
  });
  function stop(){if(frame.querySelector('iframe'))frame.replaceChildren(play);}
  new MutationObserver(()=>{if(section.hidden)stop();}).observe(section,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pagehide',stop);
  const news=document.getElementById('guideNewsList'),status=document.getElementById('guideNewsStatus');
  fetch('guide-content.json?v=20261004e',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(data=>{
    const items=(Array.isArray(data.news)?data.news:[]).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&typeof item.title==='string').sort((a,b)=>b.date.localeCompare(a.date));
    const more=document.createElement('div');more.id='guideNewsMore';more.hidden=true;
    for(const [index,item] of items.entries()){
      const detail=document.createElement('details'),summary=document.createElement('summary'),date=document.createElement('time'),title=document.createElement('h3'),body=document.createElement('div');
      date.dateTime=item.date;date.textContent=item.date.replaceAll('-','/');title.textContent=item.title;summary.append(date,title);body.className='guide-news-body';
      for(const text of (Array.isArray(item.paragraphs)?item.paragraphs:[])){const p=document.createElement('p');p.textContent=String(text);body.append(p);}
      detail.append(summary,body);(index<3?news:more).append(detail);
    }
    if(items.length>3){
      const toggle=document.createElement('button');toggle.type='button';toggle.className='guide-news-more';toggle.textContent='もっと見る';toggle.setAttribute('aria-controls',more.id);toggle.setAttribute('aria-expanded','false');
      toggle.addEventListener('click',()=>{more.hidden=!more.hidden;toggle.textContent=more.hidden?'もっと見る':'閉じる';toggle.setAttribute('aria-expanded',String(!more.hidden));});
      news.append(more,toggle);
    }
    status.textContent=items.length?'':'現在のお知らせはありません。';status.hidden=items.length>0;
    const contact=document.getElementById('guideContactLink'),contactStatus=document.getElementById('guideContactStatus');
    if(typeof data.contact_url==='string'){
      const url=new URL(data.contact_url);
      if(url.protocol==='https:'&&url.hostname==='docs.google.com'&&url.pathname.startsWith('/forms/')){contact.href=url.href;contact.hidden=false;contactStatus.hidden=true;return;}
    }
    contactStatus.textContent='お問い合わせフォームを準備しています。';
  }).catch(()=>{status.textContent='お知らせを読み込めませんでした。ページを再読み込みしてください。';document.getElementById('guideContactStatus').textContent='お問い合わせ先を読み込めませんでした。ページを再読み込みしてください。';});
})();
