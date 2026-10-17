/* Derived navigation only: never changes the saved article body. */
(function(){
 'use strict';
 function build(root){
  if(!root)return;
  root.querySelectorAll('.article-toc').forEach(function(n){n.remove()});
  var hs=Array.from(root.querySelectorAll('h2,h3')).filter(function(h){return !h.closest('.related-articles,.article-share')&&h.textContent.trim()});
  if(!hs.length)return;
  var nav=document.createElement('nav');nav.className='article-toc';nav.setAttribute('aria-label','この記事の目次');
  var label=document.createElement('strong');label.textContent='この記事の目次';nav.append(label);
  var ol=document.createElement('ol');nav.append(ol);
  hs.forEach(function(h,i){h.id='article-section-'+(i+1);h.style.scrollMarginTop='24px';var li=document.createElement('li'),a=document.createElement('a');if(h.tagName==='H3')li.className='article-toc-sub';a.href='#'+h.id;a.textContent=h.textContent.trim();a.addEventListener('click',function(e){e.preventDefault();h.scrollIntoView({block:'start'});h.setAttribute('tabindex','-1');h.focus({preventScroll:true});if(!root.closest('dialog'))history.replaceState(null,'','#'+h.id)});li.append(a);ol.append(li)});
  var first=hs[0],anchor=first;
  while(anchor.parentElement&&anchor.parentElement!==root)anchor=anchor.parentElement;
  root.insertBefore(nav,anchor);
 }
 var css=document.createElement('style');css.textContent='.article-toc{box-sizing:border-box;max-width:100%;padding:20px 24px;margin:24px 0;background:#eff5f1;border:1px solid #d8e4da;border-radius:12px;font-size:15px;line-height:1.8}.article-toc ol{padding-left:1.4em;margin:10px 0 0}.article-toc li{margin:6px 0;overflow-wrap:anywhere}.article-toc a{color:#285d47;text-decoration:underline}.article-toc-sub{margin-left:1em!important;font-size:.94em}';document.head.append(css);
 function init(){new MutationObserver(function(){var p=document.getElementById('previewBody');if(p&&p.querySelector('h2,h3')&&!p.querySelector('.article-toc'))build(p)}).observe(document.body,{childList:true,subtree:true});document.querySelectorAll('.column-article-body').forEach(build);var preview=document.getElementById('previewBody');if(preview){var pending=false;var observer=new MutationObserver(function(){if(pending)return;pending=true;queueMicrotask(function(){observer.disconnect();build(preview);observer.observe(preview,{childList:true});pending=false})});observer.observe(preview,{childList:true});if(preview.children.length)build(preview)}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
