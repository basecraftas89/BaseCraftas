'use strict';
const menu=document.querySelector('.menu-toggle');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));document.getElementById('main-nav').classList.toggle('is-open',open);menu.textContent=open?'閉じる':'メニュー';});
const cards=[...document.querySelectorAll('[data-place]')];
if(document.querySelector('#place-search')){
 const state={region:'すべて',category:'すべて',query:''};
 const query=document.querySelector('#query');
 const buttons=[...document.querySelectorAll('[data-filter]')];
 function update(){let visible=0;for(const card of cards){const show=(state.region==='すべて'||(state.region==='IKOKA地域'&&card.dataset.region!=='川越市')||card.dataset.region===state.region)&&(state.category==='すべて'||card.dataset.category===state.category)&&card.dataset.search.toLocaleLowerCase('ja').includes(state.query.toLocaleLowerCase('ja'));card.hidden=!show;if(show)visible++;}document.querySelector('#result-count').textContent=visible+'件の紹介例';document.querySelector('#empty-state').hidden=visible!==0;for(const b of buttons)b.setAttribute('aria-pressed',String(state[b.dataset.filter]===b.dataset.value));}
 const params=new URLSearchParams(location.search);if(buttons.some(b=>b.dataset.filter==='region'&&b.dataset.value===params.get('region')))state.region=params.get('region');
 for(const b of buttons)b.addEventListener('click',()=>{state[b.dataset.filter]=b.dataset.value;update();});
 document.querySelector('#place-search').addEventListener('submit',e=>{e.preventDefault();state.query=query.value.trim();update();});
 query.addEventListener('input',()=>{state.query=query.value.trim();update();});
 document.querySelector('#reset-filters').addEventListener('click',()=>{Object.assign(state,{region:'すべて',category:'すべて',query:''});query.value='';update();query.focus();});update();
}
const form=document.querySelector('#contact-form');
if(form){
 const type=document.querySelector('#contact-type');const initial=new URLSearchParams(location.search).get('type');if([...type.options].some(o=>o.value===initial))type.value=initial;
 const review=document.querySelector('#contact-review');let mailBody='';
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const data=new FormData(form);const dl=document.querySelector('#review-content');dl.replaceChildren();for(const [key,label] of [['type','相談種別'],['name','お名前・団体名'],['email','メールアドレス'],['message','相談内容']]){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=String(data.get(key)||'');dl.append(dt,dd);}mailBody=['MEGURIへのお問い合わせ','相談種別：'+data.get('type'),'お名前・団体名：'+data.get('name'),'返信先：'+data.get('email'),'','相談内容：',data.get('message')].join('\r\n');document.querySelector('#contact-compose').href='mailto:'+form.dataset.recipient+'?subject='+encodeURIComponent('【MEGURI】'+data.get('type')+'のお問い合わせ')+'&body='+encodeURIComponent(mailBody);document.querySelector('#contact-copy-text').value=mailBody;document.querySelector('#contact-copy-status').textContent='';form.hidden=true;review.hidden=false;review.focus();});
 document.querySelector('#contact-copy').addEventListener('click',async()=>{const status=document.querySelector('#contact-copy-status');try{await navigator.clipboard.writeText(mailBody);status.textContent='本文をコピーしました。宛先は '+form.dataset.recipient+' です。';}catch{const text=document.querySelector('#contact-copy-text');text.hidden=false;text.focus();text.select();status.textContent='下の本文を選択してコピーしてください。';}});
 document.querySelector('#contact-edit').addEventListener('click',()=>{form.hidden=false;review.hidden=true;type.focus();});
}
