(() => {
  'use strict';
  const content = document.getElementById('memberContent');
  if (!content) return;
  const endpoint = '/api/totonoe-member/api/weekly/onboarding';
  const preview = Boolean(document.getElementById('previewBanner') && !document.getElementById('previewBanner').hidden);
  let step = 0, started = false, busy = false, suppressed = false;
  const steps = [
    {name:'ミオン',image:'mion-insight.png',title:'TAYORIへようこそ。まずは、ひとつ。',copy:'全部を一度に使わなくて大丈夫。今週、自分の仕事で試せそうなことをひとつ見つけましょう。',hint:'資料を読む → 小さく試す → 疑問を質問する。この順番で案内します。'},
    {name:'ハクト',image:'hakuto-watch.png',title:'資料は「バックナンバー」へ。',copy:'先頭の最新資料から、気になるテーマをひとつ選びましょう。過去の資料もここで確認・保存できます。',hint:'画面の使い方は「ご案内」の活用動画で確認できます。「セミナー」には朝活・録画・Podcastがあります。'},
    {name:'ツグモ',image:'tsugumo-proposal.png',title:'自分の仕事で、小さく試してみよう。',copy:'文章の下書きや情報の整理など、取り組みやすい場面をひとつ選びましょう。理解を深めたいときは「みんなの質問・回答動画」へ。',hint:'患者・顧客・勤務先を特定できる情報をAIに入力しないようにしてください。'},
    {name:'ミオン',image:'mion-question.png',title:'好きな曜日に、疑問をひとつ送る。',copy:'仕事で浮かんだ疑問や試したことを振り返り、「どうすればよかった？」「もっと効率よくできる？」をひとつ送る習慣にしましょう。',hint:'「今週の優先質問」は曜日を問わず週1枠。日曜0:00〜土曜23:59（日本時間）が1週間です。類似する疑問をまとめた会員共通の回答動画で学びます。個別回答の保証はありません。'}
  ];
  const dialog = document.createElement('dialog'); dialog.id = 'tayoriOnboarding';
  dialog.setAttribute('aria-labelledby','onboardingTitle');
  dialog.innerHTML = `<div class="onboarding-inner"><div class="onboarding-top"><span id="onboardingProgress"></span><button class="onboarding-close" type="button">あとで見る</button></div><img id="onboardingCharacter" width="158" height="158" alt=""><p class="onboarding-name" id="onboardingName"></p><h2 id="onboardingTitle" tabindex="-1"></h2><p class="onboarding-copy" id="onboardingCopy"></p><div id="onboardingVideo" class="onboarding-video" hidden></div><p class="onboarding-hint" id="onboardingHint"></p><p class="onboarding-error" id="onboardingError" role="alert"></p><label class="onboarding-preference"><input id="onboardingDoNotShow" type="checkbox"><span>次回からこの案内を表示しない</span></label><p class="onboarding-settings-note">表示設定は<a href="../IROHA/mypage.html#onboardingSettings">マイページ</a>でも変更できます。</p><div class="onboarding-actions"><button type="button" class="onboarding-back">戻る</button><button type="button" class="onboarding-next">次へ</button></div></div>`;
  document.body.append(dialog);
  const replay = document.createElement('button'); replay.type='button'; replay.className='onboarding-replay'; replay.textContent='TAYORIの使い方';
  document.querySelector('.weekly-topbar').append(replay);
  let returnFocus = null;
  function render() {
    const current=steps[step];
    dialog.querySelector('#onboardingProgress').textContent=`使い方ガイド ${step + 1} / ${steps.length}`;
    dialog.querySelector('#onboardingCharacter').src='../assets/characters/'+current.image;
    dialog.querySelector('#onboardingName').textContent=current.name;
    dialog.querySelector('#onboardingTitle').textContent=current.title;
    dialog.querySelector('#onboardingCopy').textContent=current.copy;
    dialog.querySelector('#onboardingHint').textContent=current.hint;
    dialog.querySelector('.onboarding-back').hidden=step===0;
    dialog.querySelector('.onboarding-next').textContent=step===3?'最新の資料へ進む':'次へ';
    dialog.querySelector('#onboardingCharacter').hidden=step===0;
    dialog.querySelector('#onboardingName').hidden=step===0;
    dialog.querySelector('#onboardingDoNotShow').checked=suppressed;
    const video=dialog.querySelector('#onboardingVideo');video.replaceChildren();video.hidden=step!==0;
    if(step===0){const play=document.createElement('button');play.type='button';play.className='onboarding-video-play';play.setAttribute('aria-label','TAYORIの使い方・活用ガイドを再生（9分53秒）');play.innerHTML='<img src="../assets/tayori-guide-usage-thumbnail-v1.webp" width="1280" height="720" alt="TAYORIの使い方"><span>▶ 活用動画を見る</span>';play.addEventListener('click',()=>{const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/gwBLcPxmZ9w?autoplay=1&playsinline=1';iframe.title='TAYORIの使い方・活用方法';iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';video.replaceChildren(iframe);});video.append(play);}
    dialog.querySelector('#onboardingTitle').focus();
  }
  function open() {returnFocus=document.activeElement;dialog.showModal();render();}
  function close() {dialog.querySelector('#onboardingVideo').replaceChildren();dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
  async function state(body) {
    if (preview || !document.getElementById('previewBanner')?.hidden) {if(body)localStorage.setItem('totonoe-onboarding-preview',JSON.stringify(body));try{return body||JSON.parse(localStorage.getItem('totonoe-onboarding-preview')||'{"step":0,"completed":false}');}catch{return {step:0,completed:false};}}
    const response=await fetch(endpoint,{method:body?'PATCH':'GET',credentials:'same-origin',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('保存できませんでした。もう一度お試しください。');
    return response.json();
  }
  replay.addEventListener('click',()=>{step=0;open();});
  dialog.querySelector('.onboarding-close').addEventListener('click',()=>{if(!busy)close();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close();});
  dialog.querySelector('.onboarding-back').addEventListener('click',()=>{if(busy)return;step=Math.max(0,step-1);render();});
  dialog.querySelector('.onboarding-next').addEventListener('click',async()=>{
    if(busy)return;busy=true;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);dialog.querySelector('#onboardingError').textContent='';
    const complete=step===3;
    try {
      await state({step:complete?3:step+1,completed:suppressed});
      if(complete){close();document.querySelector('[data-tayori-tab="backnumbers"]')?.click();document.getElementById('viewLatest')?.focus();}
      else {step++;render();}
    } catch(error){dialog.querySelector('#onboardingError').textContent=error.message;}
    finally{busy=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  });
  dialog.querySelector('#onboardingDoNotShow').addEventListener('change',async event=>{
    if(busy)return;const previous=suppressed;busy=true;
    dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    dialog.querySelector('#onboardingError').textContent='';
    try{const saved=await state({step,completed:event.target.checked});suppressed=Boolean(saved.completed);}
    catch(error){event.target.checked=previous;dialog.querySelector('#onboardingError').textContent=error.message;}
    finally{busy=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  });
  async function start() {
    replay.hidden=content.hidden;
    if(content.hidden||started)return;started=true;
    try {const saved=await state();suppressed=Boolean(saved.completed);const url=new URL(location.href),force=url.searchParams.get('guide')==='1';if(force){url.searchParams.delete('guide');history.replaceState(null,'',url);}if(force||!suppressed){step=0;open();}}
    catch {step=0;open();dialog.querySelector('#onboardingError').textContent='表示設定を読み込めませんでした。非表示の設定は接続回復後に保存できます。';}
  }
  new MutationObserver(start).observe(content,{attributes:true,attributeFilter:['hidden']});start();
})();
