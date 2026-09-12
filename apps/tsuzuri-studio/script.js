(function(){
  'use strict';
  var security=window.TsuzuriSecurity||window.ColumnSecurity;
  if(!security)throw new Error('安全な本文表示を読み込めません。再読み込みしてください。');
  var safeBody=security.body,safeUrl=security.url,previewUrl=security.previewUrl;
  var sessionKey='',sessionExpires=0;
  var SESSION_TTL=8*60*60*1000;

  var STORAGE_KEY='basecraftas_tsuzuri_studio_v1';
  var LEGACY_STORAGE_KEY='basecraftas_column_studio_v1';
  var API_BASE=window.TSUZURI_STUDIO_API_BASE||window.COLUMN_STUDIO_API_BASE||(location.hostname==='basecraftas.com'?'/api/tsuzuri-studio':'');
  var now=new Date();
  var TOTONOE_MEMBERS=[{id:'shindo-toshiki',name:'神藤 俊希'},{id:'kajiwara-yusuke',name:'梶原 祐輔'},{id:'kaito-taisho',name:'海藤 大将'},{id:'nakagawa-masahiro',name:'中川 理浩'},{id:'kimura-koharu',name:'木村 倖晴'},{id:'ito-masaya',name:'伊東 雅也'},{id:'tsunashima-shu',name:'綱島 脩'},{id:'kuroishi-ryota',name:'黒石 涼太'},{id:'kojima-ken',name:'小島 健'},{id:'kaigaishi-shogo',name:'貝ヶ石 祥吾'}];
  var CONTENT_TYPES={column:'つづり｜TSUZURI',podcast:'Podcast',video:'動画',archive:'アーカイブ',seminar:'セミナー',learning:'学習',weekend:'週末AI'};
  var CONTENT_TARGETS={column:'つづり｜TSUZURI',podcast:'Podcast',video:'つまみ｜TSUMAMI',archive:'アーカイブ動画',seminar:'セミナー',learning:'つまみ｜TSUMAMI',weekend:'つづり｜TSUZURI'};
  var TOPIC_TAG_CANDIDATES=['AIリテラシー','AI活用','ChatGPT','Claude','Codex','Grok','業務整理','仕事活用','日常活用','情報管理','自己理解','ブランディング','X運用','チーム','実践','学び方','座談会','管理職向け','週末のAI整え習慣'];
  var sampleBody='<p>専門性や経験には、すでに十分な価値があります。けれど、その価値が相手に届く言葉になっていなければ、存在していないのと同じように扱われてしまうことがあります。</p><h2>伝える前に、まず整える</h2><p>大切なのは、うまく見せることではありません。現場で大切にしていることを拾い上げ、相手が受け取りやすい順番に整えることです。</p><div class="editor-bubble" data-character="mion-standard"><div class="bubble-avatar" contenteditable="false"><img class="character-icon" src="assets/characters/mion-standard.png" alt="ミオン 標準会話"><img class="character-nameplate" src="assets/characters/mion-nameplate.png" alt="ミオン"></div><div class="bubble-copy"><p>書くことは、価値を足す作業ではなく、すでにある価値を見つけ直す作業だと考えています。</p></div></div><h2>小さく書き、育てていく</h2><p>最初から完璧な記事を目指さず、ひとつの気づきから始めます。公開した後も、現場の反応を見ながら言葉を育てていけば大丈夫です。</p>';
  var defaults={
    posts:[],
    members:[
      {name:'神藤 和宏',email:'k.shindo@basecraftas.com',role:'admin',status:'参加中',initial:'KS'},
      {name:'編集メンバー',email:'editor@basecraftas.com',role:'editor',status:'参加中',initial:'ED'},
      {name:'確認メンバー',email:'viewer@basecraftas.com',role:'viewer',status:'招待中',initial:'VW'}
    ],role:'admin',editingId:null
  };
  var state=API_BASE?Object.assign(clone(defaults),{posts:[],members:[],role:"viewer"}):load();
  state.archiveCandidates=Array.isArray(state.archiveCandidates)?state.archiveCandidates:[];
  state.archiveSync=state.archiveSync||null;
  state.qualifications=Array.isArray(state.qualifications)?state.qualifications:[];
  var pendingHero='';
  var saveQueue=Promise.resolve(), cloudReady=false, editSerial=0, busyPublishing=false, imagePending=false;
  var selectedBubble=null, bubbleChange=false, editorRange=null, sourceSequence=0, sourceValues={};
  var lastAnalyzedUrl='';
  state.remote=Boolean(API_BASE);
  if(!API_BASE)state.role='admin';
  var currentFilter='all';
  var currentTypeFilter='all';
  var els={
    editor:document.getElementById('articleEditor'),title:document.getElementById('postTitle'),excerpt:document.getElementById('postExcerpt'),contentType:document.getElementById('postContentType'),category:document.getElementById('postCategory'),destination:document.getElementById('postDestination'),mainActor:document.getElementById('postMainActor'),speakers:document.getElementById('postSpeakers'),tags:document.getElementById('postTags'),mediaUrl:document.getElementById('postMediaUrl'),episodeNo:document.getElementById('postEpisodeNo'),sourceDate:document.getElementById('postSourceDate'),sourceType:document.getElementById('postSourceType'),sourceId:document.getElementById('postSourceId'),slug:document.getElementById('postSlug'),toast:document.getElementById('toast'),saveState:document.getElementById('saveState'),lastSaved:document.getElementById('lastSaved')
  };

  var speakerSelect=els.speakers, speakerBox=document.createElement('div');
  speakerBox.id='postSpeakers';speakerBox.className='speaker-checks';speakerBox.setAttribute('role','group');speakerBox.setAttribute('aria-label','Speaker');
  TOTONOE_MEMBERS.forEach(function(person){var label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=person.id;label.append(input,document.createTextNode(person.name));speakerBox.appendChild(label);});
  speakerSelect.replaceWith(speakerBox);els.speakers=speakerBox;
  var actions=document.createElement('div');actions.className='editor-extra-actions';
  actions.innerHTML='<button type="button" id="openHistory">編集履歴</button><button type="button" id="checkPublication">公開状況を確認</button><button type="button" id="openLatest">最新の共有版を開く</button><p id="conflictNotice" role="alert" hidden></p><div id="bubbleEditTools" hidden><span>選択中の会話</span><button type="button" id="changeBubble">表情・キャラクター変更</button><button type="button" id="flipBubble">左右切り替え</button><button type="button" id="removeBubble">会話を削除</button></div>';
  document.getElementById('formatToolbar').before(actions);
  var dialog=document.createElement('dialog');dialog.id='historyDialog';dialog.className='history-dialog';dialog.innerHTML='<h2>編集履歴</h2><button type="button" id="closeHistory">閉じる</button><div id="historyList"></div><pre id="historyDetail"></pre><button type="button" id="restoreVersion" hidden>この内容を編集画面に復元</button>';document.body.appendChild(dialog);

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function dateLabel(){return now.getFullYear()+'.'+String(now.getMonth()+1).padStart(2,'0')+'.'+String(now.getDate()).padStart(2,'0');}
  function esc(value){var d=document.createElement('div');d.textContent=value||'';return d.innerHTML;}
  function normalizeType(type){return CONTENT_TYPES[type]?type:'column';}
  function contentTypeLabel(type){return CONTENT_TYPES[normalizeType(type)];}
  function publicArticlePath(post){var type=normalizeType(post.content_type);var directory=type==='column'?'tsuzuri':(['video','learning'].includes(type)?'tsumami':'contents');return '/'+directory+'/'+post.slug+'.html';}
  function postState(post){if(post.deleted_at)return {key:'trash',label:'ゴミ箱'};if(post.status==='published')return {key:'published',label:'公開中'};if(post.status==='archived')return {key:'archived',label:'非公開'};return {key:'draft',label:'下書き'};}
  function managedPost(post){return !['podcast','archive'].includes(post.content_type);}
  function matchesContentView(post,type){if(!managedPost(post))return false;var actual=normalizeType(post.content_type);if(type==='all')return true;if(type==='column')return actual==='column'||actual==='weekend';if(type==='video')return actual==='video'||actual==='learning';return actual===type;}
  function trashDaysLeft(value){if(!value)return 30;var deleted=new Date(String(value).replace(' ','T')+(String(value).includes('Z')?'':'Z'));if(Number.isNaN(deleted.getTime()))return 30;return Math.max(0,Math.ceil(30-(Date.now()-deleted.getTime())/86400000));}
  function externalLinkLabel(type,url){try{var host=new URL(url).hostname.replace(/^www\./,'');if(host==='note.com'||host.indexOf('.note.com')>-1)return 'noteで読む';if(host==='stand.fm'||host.indexOf('.stand.fm')>-1)return 'Podcastを聴く';if(host==='youtube.com'||host==='youtu.be'||host.indexOf('.youtube.com')>-1)return '動画を見る';}catch(e){}return normalizeType(type)==='video'?'動画を見る':'元コンテンツを見る';}
  function sourceFromUrl(value){
    var result={url:String(value||'').trim(),kind:'external',provider:'外部リンク',recommended_content_type:'column',public_target:'つづり｜TSUZURI',source_id:'',title:'',description:'',image:'',published_at:'',episode_no:null};
    try{
      var url=new URL(result.url);var host=url.hostname.replace(/^www\./,'');var match;
      if(host==='note.com'||host.slice(-9)==='.note.com'){result.kind='note';result.provider='note';result.recommended_content_type='column';}
      else if(host==='stand.fm'||host.slice(-9)==='.stand.fm'){result.kind='podcast';result.provider='stand.fm';result.recommended_content_type='podcast';match=url.pathname.match(/\/episodes\/([A-Za-z0-9_-]+)/);result.source_id=match?match[1]:'';}
      else if(host==='youtu.be'||host==='youtube.com'||host.slice(-12)==='.youtube.com'){result.kind='video';result.provider='YouTube';result.recommended_content_type='video';match=host==='youtu.be'?url.pathname.match(/^\/([^/]+)/):url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);result.source_id=(match&&match[1])||url.searchParams.get('v')||'';if(result.source_id)result.image='https://img.youtube.com/vi/'+result.source_id+'/hqdefault.jpg';}
      else if(host==='drive.google.com'||host==='docs.google.com'){result.kind='archive';result.provider='Google Drive';result.recommended_content_type='archive';match=url.pathname.match(/\/(?:file\/d|folders)\/([^/?]+)/);result.source_id=(match&&match[1])||url.searchParams.get('id')||'';}
      else if(host==='therapis10.com'||host.slice(-15)==='.therapis10.com'){result.kind='seminar';result.provider='therapis10';result.recommended_content_type='seminar';match=url.pathname.match(/\/seminars\/([^/?]+)/);result.source_id=match?match[1]:'';}
    }catch(e){}
    result.public_target=CONTENT_TARGETS[result.recommended_content_type]||'つづり｜TSUZURI';return result;
  }
  function personById(id){return TOTONOE_MEMBERS.find(function(person){return person.id===id;})||TOTONOE_MEMBERS[0];}
  function speakerNames(ids){var list=(ids||[]).map(function(id){return personById(id).name;});return list.length?list.join('、'):'—';}
  function selectedSpeakerIds(){if(els.speakers.selectedOptions)return Array.prototype.slice.call(els.speakers.selectedOptions).map(function(option){return option.value;});return Array.prototype.slice.call(els.speakers.querySelectorAll('input[type="checkbox"]')).filter(function(input){return input.checked;}).map(function(input){return input.value;});}
  function setSelectedSpeakers(ids){var selected=Array.isArray(ids)?ids:[];if(els.speakers.options){Array.prototype.slice.call(els.speakers.options).forEach(function(option){option.selected=selected.indexOf(option.value)>-1;});return;}Array.prototype.slice.call(els.speakers.querySelectorAll('input[type="checkbox"]')).forEach(function(input){input.checked=selected.indexOf(input.value)>-1;});}
  function tagArray(tags){return Array.isArray(tags)?tags:String(tags||'').split(',').map(function(tag){return tag.trim();}).filter(Boolean);}
  function syncTopicTagSuggestions(){var selected=tagArray(els.tags.value);document.querySelectorAll('[data-topic-tag]').forEach(function(button){var active=selected.indexOf(button.dataset.topicTag)>-1;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});}
  function renderTopicTagSuggestions(){var wrap=document.getElementById('topicTagSuggestions');if(!wrap)return;var tags=[...new Set(TOPIC_TAG_CANDIDATES.concat(state.tagHistory||[],tagArray(els.tags.value)))];wrap.replaceChildren();tags.forEach(function(tag){var button=document.createElement('button');button.type='button';button.dataset.topicTag=tag;button.textContent=tag;wrap.appendChild(button);});syncTopicTagSuggestions();}
  function toggleTopicTag(tag){var selected=tagArray(els.tags.value);var index=selected.indexOf(tag);if(index>-1)selected.splice(index,1);else selected.push(tag);els.tags.value=selected.join(', ');syncTopicTagSuggestions();updateEditorMeta();scheduleSave();}

  function load(){
    try{
      var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY));
      var merged=Object.assign(clone(defaults),saved);
      merged.posts=(merged.posts||[]).map(function(post){
        post.content_type=normalizeType(post.content_type);
        post.speaker_ids=Array.isArray(post.speaker_ids)?post.speaker_ids:[];
        post.media_url=post.media_url||'';
        post.episode_no=post.episode_no||null;
        post.source_published_at=post.source_published_at||'';
        post.source_type=post.source_type||sourceFromUrl(post.media_url).kind;
        post.source_id=post.source_id||sourceFromUrl(post.media_url).source_id;
        post.body=ensureNameplates((post.body||'').replace(/data-character="shindo"/g,'data-character="mion-standard"').replace(/\.\.\/\.\.\/images\/x-profile-top\.jpg/g,'assets/characters/mion-standard.png').replace(/alt="新藤"/g,'alt="ミオン 標準会話"'));
        post.deleted_at=post.deleted_at||'';
        return post;
      });
      return merged;
    }catch(e){return clone(defaults);}
  }
  function ensureNameplates(html){var host=document.createElement('div');host.innerHTML=safeBody(html);host.querySelectorAll('.editor-bubble[data-character]').forEach(function(bubble){var avatar=bubble.querySelector('.bubble-avatar');if(!avatar||avatar.querySelector('.character-nameplate'))return;var prefix=(bubble.dataset.character||'mion').split('-')[0];var icon=avatar.querySelector('img');if(icon)icon.classList.add('character-icon');var plate=document.createElement('img');plate.className='character-nameplate';plate.src='assets/characters/'+prefix+'-nameplate.png';plate.alt=prefix==='mion'?'ミオン':prefix==='tsugumo'?'ツグモ':'ハクト';avatar.appendChild(plate);});return host.innerHTML;}
  function persist(){
    try{
      if(API_BASE){
        if(!sessionKey||!cloudReady||Date.now()>sessionExpires)return false;
        sessionStorage.setItem(sessionKey,JSON.stringify({expires:sessionExpires,posts:state.posts.filter(function(p){return p.pending;})}));
      }else localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      els.lastSaved.textContent=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});return true;
    }catch(error){els.saveState.textContent='端末への保存に失敗しました。容量を確認してください';return false;}
  }
  function clearSessionView(){
    cloudReady=false;clearTimeout(scheduleSave.timer);
    if(sessionKey)sessionStorage.removeItem(sessionKey);
    sessionKey='';sessionExpires=0;state.currentEmail='';state.posts=[];state.members=[];state.archiveCandidates=[];state.qualifications=[];state.role='viewer';state.editingId=null;
    els.editor.replaceChildren();els.title.value='';els.excerpt.value='';setHeroPreview('');
    document.getElementById('previewBody').replaceChildren();document.getElementById('historyDetail').textContent='';document.getElementById('historyList').replaceChildren();
    ['postTitle','postExcerpt','postTags','postSlug','postMediaUrl','postEpisodeNo','postSourceDate','postSourceType','postSourceId'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
    ['previewTitle','previewLead','previewCategory','previewMediaUrl','previewMainActor','previewSpeakers','previewDate'].forEach(function(id){document.getElementById(id).textContent='';});
    clearLinkPreview();
    document.querySelectorAll('dialog[open]').forEach(function(dialog){dialog.close();});
    applyRole('viewer');renderDashboard();renderPosts();renderMembers();renderQualifications();
  }
  function logout(){
    if(state.posts.some(function(p){return p.pending;})&&!confirm('共有されていない原稿があります。ログアウトするとこのタブの原稿を削除します。続けますか？'))return;
    clearSessionView();localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);
    if(API_BASE)location.assign('/cdn-cgi/access/logout');
  }
  function articleFromApi(article){return {id:article.id,title:article.title,excerpt:article.excerpt,category:article.category,destination:article.destination||'totonoe',content_type:normalizeType(article.content_type),main_actor_id:article.main_actor_id||'',speaker_ids:Array.isArray(article.speaker_ids)?article.speaker_ids:[],tags:(article.topic_tags||article.tags||[]).join(', '),slug:article.slug,status:['published','archived'].includes(article.status)?article.status:'draft',deleted_at:article.deleted_at||'',updated:(article.updated_at||article.created_at||'').slice(0,10).replace(/-/g,'.')||dateLabel(),revision:article.revision||0,body:ensureNameplates(article.body_html||''),hero:article.hero_url||'',media_url:article.media_url||'',episode_no:article.episode_no||null,source_published_at:article.source_published_at||'',source_type:article.source_type||sourceFromUrl(article.media_url).kind,source_id:article.source_id||sourceFromUrl(article.media_url).source_id,live_url:article.live_url||''};}
  function payloadFromPost(post,status){var tags=tagArray(post.tags);return {slug:post.slug,title:post.title,excerpt:post.excerpt,category:post.category,destination:'totonoe',content_type:normalizeType(post.content_type),main_actor_id:post.main_actor_id||'',speaker_ids:Array.isArray(post.speaker_ids)?post.speaker_ids:[],topic_tags:tags,tags:tags,media_url:post.media_url||'',episode_no:post.episode_no||null,source_published_at:post.source_published_at||'',source_type:post.source_type||sourceFromUrl(post.media_url).kind,source_id:post.source_id||sourceFromUrl(post.media_url).source_id,hero_url:post.hero||'',body_html:post.body,status:status||post.status||'draft'};}
  async function api(path,options){
    var res=await fetch(API_BASE+path,Object.assign({credentials:'include',headers:{'content-type':'application/json'}},options||{}));
    var invalidJson=false,data;try{data=await res.json();}catch(e){invalidJson=true;data={message:'サーバーから応答を読み取れませんでした。接続を確認して再試行してください。'};}
    if(invalidJson||!res.ok||res.redirected||!data||typeof data!=='object'){
      if(res.status===401)clearSessionView();
      var error=new Error(data&& (data.message||data.error)||'接続を確認して再試行してください');error.status=res.status;error.data=data;throw error;
    }
    return data;
  }
  async function syncWeekly(button){
    var status=document.getElementById('weeklySyncStatus');
    if(!API_BASE||!cloudReady)throw new Error('共有保存に接続できていません');
    button.disabled=true;status.textContent='同期しています…';
    try{
      var result=await api('/api/weekly/admin/sync',{method:'POST',body:'{}'});
      var materialCount=result.materials&&Number(result.materials.file_count||0);
      var videoCount=result.answer_videos&&Number(result.answer_videos.file_count||0);
      var questionCount=result.question_sheet&&Number(result.question_sheet.synced||0);
      status.textContent='同期完了：資料 '+materialCount+'件 ／ 回答動画 '+videoCount+'件 ／ 質問 '+questionCount+'件';
      toast('TAYORI連携を更新しました');
    }catch(error){status.textContent='同期できませんでした：'+error.message;throw error;}
    finally{button.disabled=false;}
  }
  function syncRemoteArticle(post){
    if(!API_BASE)return Promise.resolve(post);
    var snapshot=clone(post);
    var task=saveQueue.catch(function(){}).then(function(){
      if(!cloudReady)throw new Error('共有保存に接続できていません');
      if(post.conflict)throw new Error('競合を確認してから保存してください');
      var payload=payloadFromPost(snapshot);payload.expected_revision=post.revision||0;payload.id=post.id;
      els.saveState.textContent='チームに保存中…';
      return api('/api/articles'+(post.revision?'/'+encodeURIComponent(post.id):''),{method:post.revision?'PATCH':'POST',body:JSON.stringify(payload)}).then(function(data){
        post.revision=data.article.revision;post.status=data.article.status;
        var unchanged=JSON.stringify(payloadFromPost(post))===JSON.stringify(payloadFromPost(snapshot));
        post.pending=!unchanged;persist();
        els.saveState.textContent=unchanged?'チームに共有済み':'この端末に保存済み・共有待ち';
        rememberTags(post.tags);return post;
      }).catch(function(error){
        post.pending=true;
        if(error.status===409){post.conflict=true;showConflict(post);}
        persist();throw error;
      });
    });
    saveQueue=task;return task;
  }
  async function uploadHero(file){var current=state.posts.find(function(item){return item.id===state.editingId;});if(!current)throw new Error('先に下書きを作成してください');if(!current.revision)await syncRemoteArticle(current);var fd=new FormData();fd.append('file',file);fd.append('article_id',current.id);return fetch(API_BASE+'/api/assets',{method:'POST',credentials:'include',body:fd}).then(function(res){return res.json().then(function(data){if(!res.ok)throw new Error(data.error||'画像を保存できませんでした');return data.asset;});});}
  function isSourceOnlyType(type){return ['podcast','archive','video','learning'].includes(normalizeType(type));}
  function syncEditorMode(){
    var type=normalizeType(els.contentType.value),sourceOnly=isSourceOnlyType(type),view=document.getElementById('view-editor');
    view.classList.toggle('source-only-editor',sourceOnly);view.dataset.editorKind=type;
    var title=document.getElementById('linkIntakeTitle'),help=title.parentElement.querySelector('small'),tagLabel=document.querySelector('.topic-tag-field label');
    els.title.placeholder=sourceOnly?'タイトルを入力・確認':'記事のタイトルを入力';els.excerpt.placeholder=sourceOnly?'内容をひとことで紹介（任意）':'この記事をひとことで紹介すると…';
    var copy=type==='archive'?['Google DriveのアーカイブURLを貼り付け','第何回・開催日・タイトルを確認して公開します。','https://drive.google.com/file/d/.../view','アーカイブのカテゴリタグ']:type==='podcast'?['stand.fmのURLを貼り付け','stand.fmのリンクからタイトルと概要を読み込みます。','https://stand.fm/episodes/...','Podcastのカテゴリタグ']:['YouTube URLを貼り付け','YouTubeのリンクからタイトルとサムネイルを読み込みます。','https://www.youtube.com/watch?v=...','動画のカテゴリタグ'];
    if(sourceOnly){title.textContent=copy[0];help.textContent=copy[1];els.mediaUrl.placeholder=copy[2];document.getElementById('linkStatus').textContent=type==='archive'?'Google DriveのURLと開催情報を確認してください。':type==='podcast'?'stand.fmのURLを貼り付けて「情報を取得」を押してください。':'YouTube URLを貼り付けて「情報を取得」を押してください。';tagLabel.textContent=copy[3];if(!els.mainActor.value)els.mainActor.value='shindo-toshiki';}
    else{title.textContent='元コンテンツのURLを貼り付け';help.textContent='note・YouTube・セミナーURLを自動判定します。';els.mediaUrl.placeholder='https://note.com/...';tagLabel.textContent='Topic Tag';}
    [els.destination,els.contentType,els.mainActor,els.speakers,els.slug].forEach(function(field){var group=field.closest('label,.setting-field');if(group)group.classList.toggle('source-only-hidden',sourceOnly);});
    document.getElementById('sourceDetailFields').classList.remove('source-only-hidden');
    document.getElementById('imageDrop').closest('.setting-block').classList.remove('source-only-hidden');
    document.querySelector('[data-setting-tab="style"]').classList.toggle('source-only-hidden',sourceOnly);
    if(sourceOnly){document.querySelector('[data-setting-tab="post"]').click();}
  }
  function syncSourceFields(){var type=normalizeType(els.contentType.value);document.getElementById('sourceDetailFields').hidden=['podcast','archive','seminar'].indexOf(type)===-1;syncEditorMode();}
  function setHeroPreview(url){url=safeUrl(url,true)||(!API_BASE?previewUrl(url):'');var drop=document.getElementById('imageDrop');pendingHero=url||'';drop.style.backgroundImage=url?'url("'+String(previewUrl(url)).replace(/"/g,'%22')+'")':'';drop.classList.toggle('has-image',Boolean(url));}
  function clearLinkPreview(message){var card=document.getElementById('linkPreviewCard');card.hidden=true;document.getElementById('linkStatus').className='link-status';document.getElementById('linkStatus').textContent=message||'本文を直接書く場合は、URLなしでも作成できます。';lastAnalyzedUrl='';}
  function renderLinkPreview(preview){preview.image=safeUrl(preview.image);var card=document.getElementById('linkPreviewCard');var status=document.getElementById('linkStatus');var image=document.getElementById('linkPreviewImage');card.hidden=false;image.style.backgroundImage=preview.image?'url("'+String(preview.image).replace(/"/g,'%22')+'")':'';document.getElementById('linkPreviewProvider').textContent=preview.provider||preview.kind||'外部リンク';document.getElementById('linkPreviewTarget').textContent='反映先: '+(preview.public_target||CONTENT_TARGETS[preview.recommended_content_type]||'つづり｜TSUZURI');document.getElementById('linkPreviewTitle').textContent=preview.title||'タイトルは手入力してください';document.getElementById('linkPreviewDescription').textContent=preview.description||'取得できない項目はそのまま編集できます。';status.className='link-status success';status.textContent='情報を取得しました。内容を確認してから公開してください。';}
  function applyLinkPreview(preview){
    if(['podcast','archive'].includes(preview.recommended_content_type)){clearLinkPreview('Podcast・アーカイブはスタジオ外で管理してください。');return;}els.contentType.value=normalizeType(preview.recommended_content_type);els.sourceType.value=preview.kind||'external';els.sourceId.value=preview.source_id||'';
    [['title',preview.title],['excerpt',preview.description],['sourceDate',preview.published_at],['episodeNo',preview.episode_no]].forEach(function(pair){
      var field=els[pair[0]];if(!field.value&&pair[1]){field.value=pair[1];sourceValues[pair[0]]=String(pair[1]);}
    });
    if(!pendingHero&&preview.image){setHeroPreview(preview.image);sourceValues.hero=preview.image;}
    lastAnalyzedUrl=els.mediaUrl.value.trim();renderLinkPreview(preview);
    var missing=[];if(!preview.title)missing.push('タイトル');if(!preview.description)missing.push('説明');if(!preview.image)missing.push('画像');
    document.getElementById('linkStatus').textContent=missing.length?'取得できない項目：'+missing.join('・')+'。手入力できます。':'タイトル・説明・画像を取得しました。内容を確認してください。';
    syncSourceFields();scheduleSave();
  }
  function resetLinkButton(){var button=document.getElementById('analyzeLinkButton');button.disabled=false;button.textContent='情報を取得';}
  async function analyzeLink(){
    var value=els.mediaUrl.value.trim(),sequence=++sourceSequence,postId=state.editingId;
    var button=document.getElementById('analyzeLinkButton'),status=document.getElementById('linkStatus');
    try{if(!/^https?:$/.test(new URL(value).protocol))throw new Error();}catch(error){status.textContent='http:// または https:// のURLを入力してください';return;}
    button.disabled=true;status.textContent='取得中…';
    try{
      var result=API_BASE?await api('/api/link-preview',{method:'POST',body:JSON.stringify({url:value})}):{preview:sourceFromUrl(value)};
      if(sequence!==sourceSequence||value!==els.mediaUrl.value.trim()||postId!==state.editingId)return;
      applyLinkPreview(result.preview);
    }catch(error){if(sequence===sourceSequence){status.textContent='情報を取得できませんでした。URLは保持しています。再取得または手入力してください';status.className='link-status error';}}
    finally{if(sequence===sourceSequence){button.disabled=false;button.textContent='情報を取得';}}
  }
  async function bootRemote(){
    if(!API_BASE){els.saveState.textContent='この端末で編集中';return;}
    cloudReady=false;els.saveState.textContent='共有保存に接続中…';
    try{
      var me=await api('/api/me');if(!me.member)throw new Error('メンバー権限を確認してください');
      state.role=me.member.role;state.currentEmail=me.email||me.member.email||'';
      sessionKey='tsuzuri-studio-session:'+state.currentEmail.toLowerCase();
      var savedSession=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
      sessionExpires=savedSession&&savedSession.expires>Date.now()?savedSession.expires:Date.now()+SESSION_TTL;
      var recovered=savedSession&&savedSession.expires>Date.now()?savedSession.posts||[]:[];
      var legacy=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY)||'null');
      if(legacy&&String(legacy.currentEmail||'').toLowerCase()===state.currentEmail.toLowerCase()){
        recovered=recovered.concat((legacy.posts||[]).filter(function(p){return p.pending;}));
        localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      state.posts=recovered;
state.members=[memberFromApi(me.member)];
      var results=await Promise.all([api('/api/articles'),api('/api/tags').catch(function(){return {tags:[]};})]);
      var local=state.posts.filter(function(p){return p.pending;});
      state.posts=(results[0].articles||[]).map(articleFromApi).map(function(remote){return local.find(function(p){return p.id===remote.id;})||remote;});
      local.forEach(function(p){if(!state.posts.some(function(item){return item.id===p.id;}))state.posts.unshift(p);});
      (results[1].tags||[]).forEach(function(tag){rememberTags([tag]);});
      cloudReady=true;
      persist();applyRole(state.role);renderDashboard();renderPosts();renderMembers();renderQualifications();
      els.saveState.textContent=local.length?'端末に未共有の下書きがあります':'チームに接続済み';
    }catch(error){clearSessionView();els.saveState.textContent='共有データを読み込めません。再ログインしてください';toast(error.message);}
  }
  function toast(message){els.toast.textContent=message;els.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(function(){els.toast.classList.remove('show');},2400);}
  function roleName(role){return role==='admin'?'管理者':role==='editor'?'編集者':'閲覧者';}
  function memberFromApi(member){var email=member.email||'';return {id:member.id,email:email,name:member.name||email.split('@')[0]||'メンバー',role:member.role,status:member.status,initial:(member.name||email).slice(0,2).toUpperCase()};}
  function memberStatusLabel(status){return status==='active'?'利用中':status==='disabled'?'停止中':'登録待ち';}
  function showView(name){if(busyPublishing)return;flushPending();if(name==='editor'&&state.role==='viewer'){toast('閲覧者は記事を編集できません');return;}if((name==='members'||name==='qualifications'||name==='settings')&&state.role!=='admin'){toast('管理者だけが開ける画面です');return;}document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id==='view-'+name);});document.querySelectorAll('.nav-item').forEach(function(b){var active=name==='posts'?b.dataset.contentView===currentTypeFilter:b.dataset.view===name;b.classList.toggle('active',active);});var active=document.getElementById('view-'+name);document.getElementById('breadcrumb').innerHTML='<span>TSUZURI Studio</span><b>/</b> '+esc(name==='editor'?contentTypeLabel(els.contentType.value)+'を編集':name==='posts'?(currentTypeFilter==='all'?'すべてのコンテンツ':contentTypeLabel(currentTypeFilter)):active.dataset.title);if(name==='posts')renderPosts();if(name==='dashboard')renderDashboard();if(name==='members'){renderMembers();if(API_BASE)api('/api/members').then(function(data){state.members=(data.members||[]).map(memberFromApi);renderMembers();}).catch(function(error){toast(error.message);});}if(name==='qualifications'){renderQualifications();if(API_BASE)loadQualifications().catch(function(error){document.getElementById('qualificationAdminList').textContent='資格申請を読み込めませんでした。更新ボタンで再試行してください。';toast(error.message);});}document.getElementById('sidebar').classList.remove('open');window.scrollTo(0,0);}
  function setStatusFilter(value){currentFilter=value;document.querySelectorAll('[data-filter]').forEach(function(b){b.classList.toggle('active',b.dataset.filter===value);});var note=document.getElementById('trashRetentionNote');if(note)note.hidden=value!=='trash';renderPosts();}
  function openContentView(type){if(type==='tsuzuri')type='column';currentTypeFilter=['podcast','archive'].includes(type)?'all':type||'all';setStatusFilter('all');var labels={all:['すべてのコンテンツ','つづり｜TSUZURI・つまみ｜TSUMAMI・動画コンテンツを管理します。'],column:['つづり｜TSUZURI','記事・note連携・週末のAI整え習慣を管理します。'],podcast:['Podcast','音声エピソードと公開URLを管理します。'],video:['動画','つまみ｜TSUMAMIの動画と公開URLを管理します。'],archive:['アーカイブ','Google Driveの新着を確認し、下書きから公開します。']};var copy=labels[currentTypeFilter]||labels.all;document.getElementById('contentListTitle').textContent=copy[0];document.getElementById('contentListCopy').textContent=copy[1];if(history.replaceState){if(currentTypeFilter==='all')history.replaceState(null,'',location.pathname+location.search);else history.replaceState(null,'','#'+(currentTypeFilter==='column'?'tsuzuri':currentTypeFilter));}showView('posts');}
  function renderDashboard(){var active=state.posts.filter(function(p){return managedPost(p)&&!p.deleted_at;});document.getElementById('publishedCount').textContent=active.filter(function(p){return p.status==='published';}).length;document.getElementById('draftCount').textContent=active.filter(function(p){return p.status!=='published';}).length;document.getElementById('monthCount').textContent=active.filter(function(p){return p.updated.slice(0,7)===dateLabel().slice(0,7);}).length;document.getElementById('memberCount').textContent=state.members.length;document.getElementById('postNavCount').textContent=active.length;document.getElementById('tsuzuriNavCount').textContent=active.filter(function(p){return matchesContentView(p,'column');}).length;document.getElementById('videoNavCount').textContent=active.filter(function(p){return matchesContentView(p,'video');}).length;document.getElementById('recentPosts').innerHTML=active.slice().sort(function(a,b){return b.updated.localeCompare(a.updated);}).slice(0,4).map(function(p){var status=postState(p);return '<div class="recent-row"><button class="post-title-button" data-edit="'+p.id+'"><strong>'+esc(p.title)+'</strong><small>'+esc(contentTypeLabel(p.content_type))+' ・ '+esc(personById(p.main_actor_id).name)+'</small></button><span class="badge '+status.key+'">'+status.label+'</span><span class="row-date">'+p.updated+'</span></div>';}).join('');}
  function filteredPosts(){var q=(document.getElementById('postSearch').value||'').toLowerCase();return state.posts.filter(function(p){var type=normalizeType(p.content_type),status=postState(p).key;return(currentFilter==='all'?status!=='trash':status===currentFilter)&&matchesContentView(p,currentTypeFilter)&&(!q||(p.title+' '+p.tags+' '+p.category+' '+contentTypeLabel(type)+' '+speakerNames(p.speaker_ids)).toLowerCase().indexOf(q)>-1);});}
  function articleActions(p){if(state.role!=='admin')return '';if(p.deleted_at)return '<small class="trash-expiry">あと'+trashDaysLeft(p.deleted_at)+'日</small><button type="button" class="lifecycle-button restore" data-lifecycle="restore" data-article-id="'+esc(p.id)+'">復元</button>';var actions=[];if(p.status==='published')actions.push('<button type="button" class="lifecycle-button" data-lifecycle="unpublish" data-article-id="'+esc(p.id)+'">非公開</button>');actions.push('<button type="button" class="lifecycle-button danger" data-lifecycle="trash" data-article-id="'+esc(p.id)+'">ゴミ箱へ</button>');return actions.join('');}
  function renderPosts(){var list=filteredPosts();document.getElementById('postTable').innerHTML=list.length?list.map(function(p){var status=postState(p),path=esc(publicArticlePath(p)),title=p.deleted_at?'<div class="post-title-static"><strong>'+esc(p.title)+'</strong><small>'+path+'</small></div>':'<button class="post-title-button" data-edit="'+esc(p.id)+'"><strong>'+esc(p.title)+'</strong><small>'+path+'</small></button>';return '<div class="post-table-row">'+title+'<span>'+esc(contentTypeLabel(p.content_type))+'</span><span class="badge '+status.key+'">'+status.label+'</span><span>'+p.updated+'</span><div class="row-actions">'+articleActions(p)+'</div></div>';}).join(''):'<div class="empty-state">該当するコンテンツはありません。</div>';}
  async function changeLifecycle(id,action){
    if(busyPublishing||state.role!=='admin')return;
    var post=state.posts.find(function(item){return item.id===id;});if(!post)return;
    var messages={unpublish:'この記事を非公開にしますか？ 公開ページから取り除かれます。',trash:'この記事をゴミ箱へ移動しますか？ 公開中の場合は公開ページからも取り除かれます。'};
    if(messages[action]&&!window.confirm(messages[action]))return;
    clearTimeout(scheduleSave.timer);busyPublishing=true;renderPosts();
    try{
      if(API_BASE){
        if(post.pending)await syncRemoteArticle(post);
        var result=await api('/api/articles/'+encodeURIComponent(id)+'/lifecycle',{method:'POST',body:JSON.stringify({action:action,expected_revision:post.revision})});
        Object.assign(post,articleFromApi(result.article));post.pending=false;post.conflict=false;
      }else{
        post.revision=(post.revision||0)+1;post.updated=dateLabel();
        if(action==='restore'){post.deleted_at='';post.status='draft';}
        else if(action==='trash'){post.deleted_at=new Date().toISOString();post.status='archived';}
        else post.status='archived';
      }
      persist();renderDashboard();
      if(action==='trash'){setStatusFilter('trash');toast('ゴミ箱へ移動しました。30日間は復元できます');}
      else if(action==='restore'){setStatusFilter('all');toast('記事を下書きに復元しました');}
      else{renderPosts();toast('記事を非公開にしました');}
    }catch(error){
      if(error.status===409&&error.data&&error.data.article)Object.assign(post,articleFromApi(error.data.article));
      persist();renderDashboard();renderPosts();saveError(error);
    }finally{busyPublishing=false;renderPosts();}
  }

  function renderMembers(){document.getElementById('memberList').innerHTML=state.members.map(function(m,i){var key=m.id||String(i);var own=state.currentEmail&&m.email.toLowerCase()===state.currentEmail.toLowerCase();return '<div class="member-row"><div class="member-identity"><span class="member-avatar">'+esc(m.initial||'M')+'</span><div><strong>'+esc(m.name||'メンバー')+(own?'（自分）':'')+'</strong><small>'+esc(m.email)+'</small></div></div><select class="role-select" data-member-role="'+esc(key)+'"><option value="admin" '+(m.role==='admin'?'selected':'')+'>管理者</option><option value="editor" '+(m.role==='editor'?'selected':'')+'>編集者</option><option value="viewer" '+(m.role==='viewer'?'selected':'')+'>閲覧者</option></select><span class="member-status">● '+memberStatusLabel(m.status)+'</span><button type="button" class="row-menu" data-member-status="'+esc(key)+'" aria-label="'+(m.status==='disabled'?'利用を再開':'利用を停止')+'">'+(m.status==='disabled'?'再開':'停止')+'</button></div>';}).join('');}
  function qualificationStatusLabel(status){return status==='pending'?'審査待ち':status==='verified'?'確認済み':status==='rejected'?'再提出':'削除済み';}
  function renderQualifications(){
    var list=document.getElementById('qualificationAdminList');if(!list)return;
    var pending=state.qualifications.filter(function(item){return item.status==='pending';}).length;
    var count=document.getElementById('qualificationNavCount');if(count)count.textContent=pending;
    if(!state.qualifications.length){list.innerHTML='<div class="empty-state">現在、資格確認の申請はありません。</div>';return;}
    list.innerHTML=state.qualifications.map(function(item){
      var pendingReview=item.status==='pending';
      var submitted=String(item.created_at||'').slice(0,16).replace('T',' ');
      return '<article class="qualification-admin-card"><div class="qualification-admin-head"><div><span class="badge '+esc(item.status)+'">'+qualificationStatusLabel(item.status)+'</span><h2>'+esc(item.display_name||'氏名未設定')+'</h2><p>'+esc(item.email)+' ・ '+esc(item.profession||'資格未設定')+'</p></div><small>申請 '+esc(submitted)+'</small></div><div class="qualification-admin-meta"><span>ファイル：'+esc(item.original_file_name||'資格証明画像')+'</span><span>容量：'+Math.ceil(Number(item.size_bytes||0)/1024)+'KB</span></div><div class="qualification-admin-actions"><a class="secondary-button" href="'+API_BASE+'/api/admin/qualifications/'+encodeURIComponent(item.id)+'/image" target="_blank" rel="noopener">画像を確認</a>'+(pendingReview?'<textarea data-qualification-note="'+esc(item.id)+'" maxlength="500" placeholder="再提出の場合は理由を入力してください"></textarea><button class="primary-button" type="button" data-qualification-review="verified" data-qualification-id="'+esc(item.id)+'">承認する</button><button class="secondary-button danger" type="button" data-qualification-review="rejected" data-qualification-id="'+esc(item.id)+'">再提出を依頼</button>':'<p class="qualification-review-note">'+(item.review_note?'運営メモ：'+esc(item.review_note):'審査済み')+'</p>')+'</div></article>';
    }).join('');
  }
  async function loadQualifications(){
    if(!API_BASE||state.role!=='admin'){state.qualifications=[];renderQualifications();return;}
    var result=await api('/api/admin/qualifications');state.qualifications=result.submissions||[];renderQualifications();
  }
  async function reviewQualification(id,status,button){
    var note=document.querySelector('[data-qualification-note="'+CSS.escape(id)+'"]');var reviewNote=note?note.value.trim():'';
    if(status==='rejected'&&!reviewNote){toast('再提出を依頼する理由を入力してください');note&&note.focus();return;}
    if(!window.confirm(status==='verified'?'資格を確認済みにしますか？':'再提出を依頼しますか？'))return;
    button.disabled=true;
    try{var result=await api('/api/admin/qualifications/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status:status,review_note:reviewNote})});await loadQualifications();toast(result.notification_sent?'審査結果を保存し、メールを送信しました':'審査結果を保存しました。メール送信は確認が必要です');}
    catch(error){toast(error.message||'審査結果を保存できませんでした');button.disabled=false;}
  }
  function applyRole(role){state.role=role;persist();document.body.classList.toggle('viewer-mode',role==='viewer');document.body.classList.toggle('editor-mode',role==='editor');document.getElementById('currentRoleLabel').textContent=role==='admin'?'Administrator':role==='editor'?'Editor':'Viewer';document.querySelector('.account-copy strong').textContent=roleName(role);document.getElementById('accountMenu').classList.remove('open');showView('dashboard');toast(roleName(role)+'の表示に切り替えました');}
  function blankPost(template){if(busyPublishing)return;flushPending();clearTimeout(scheduleSave.timer);sourceSequence++;resetLinkButton();sourceValues={};selectedBubble=null;editorRange=null;state.editingId=null;pendingHero='';lastAnalyzedUrl='';els.title.value='';els.excerpt.value='';els.contentType.value=currentTypeFilter!=='all'&&CONTENT_TYPES[currentTypeFilter]?currentTypeFilter:'column';els.category.value='content';els.destination.value='totonoe';els.mainActor.value='';setSelectedSpeakers([]);els.tags.value='';syncTopicTagSuggestions();els.mediaUrl.value='';els.episodeNo.value='';els.sourceDate.value='';els.sourceType.value='';els.sourceId.value='';els.slug.value='';els.editor.innerHTML=template&&!isSourceOnlyType(els.contentType.value)?'<p>この記事では、まず<strong>読者に伝えたい結論</strong>を置きます。</p><h2>いま起きていること</h2><p>背景や、現場で感じている課題を書きます。</p><h2>私たちが大切にしたいこと</h2><p>具体例や、読者に持ち帰ってほしい視点を書きます。</p><h2>まとめ</h2><p>次の一歩につながる言葉で締めくくります。</p>':'';setHeroPreview('');clearLinkPreview();syncSourceFields();updateEditorMeta();showView('editor');setTimeout(function(){els.mediaUrl.focus();},50);}
  function editPost(id){if(busyPublishing)return;var target=state.posts.find(function(item){return item.id===id;});if(target&&!managedPost(target)){toast('このコンテンツはスタジオ外で管理してください');return;}if(target&&target.deleted_at){toast('ゴミ箱の記事は復元してから編集してください');return;}flushPending();clearTimeout(scheduleSave.timer);sourceSequence++;resetLinkButton();sourceValues={};selectedBubble=null;editorRange=null;var p=state.posts.find(function(item){return item.id===id;});if(!p)return;state.editingId=id;els.title.value=p.title;els.excerpt.value=p.excerpt;els.contentType.value=normalizeType(p.content_type);els.category.value=p.category;els.destination.value='totonoe';els.mainActor.value=p.main_actor_id||'';setSelectedSpeakers(p.speaker_ids||[]);els.tags.value=p.tags;syncTopicTagSuggestions();els.mediaUrl.value=p.media_url||'';els.episodeNo.value=p.episode_no||'';els.sourceDate.value=p.source_published_at||'';els.sourceType.value=p.source_type||'';els.sourceId.value=p.source_id||'';els.slug.value=p.slug;els.editor.innerHTML=safeBody(p.body);els.editor.querySelectorAll('img').forEach(function(img){img.src=previewUrl(img.getAttribute('src'));});setHeroPreview(p.hero||'');if(p.media_url){var preview=sourceFromUrl(p.media_url);preview.title=p.title;preview.description=p.excerpt;preview.image=p.hero||preview.image;preview.published_at=p.source_published_at||'';preview.episode_no=p.episode_no||null;renderLinkPreview(preview);lastAnalyzedUrl=p.media_url;}else clearLinkPreview();syncSourceFields();document.getElementById('visibilityTitle').textContent=p.status==='published'?'公開中':'下書き';document.getElementById('visibilityCopy').textContent=p.status==='published'?'サイトに表示されています':'サイトには表示されません';updateEditorMeta();showView('editor');}
  function slugify(v){return v.toLowerCase().trim().replace(/[\s　]+/g,'-').replace(/[^a-z0-9\-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');}
  function collect(status){var existing=state.posts.find(function(p){return p.id===state.editingId;});var p=existing||{id:'article_'+crypto.randomUUID(),hero:'',revision:0,history:[],deleted_at:''};p.title=els.title.value.trim()||'無題のコンテンツ';p.excerpt=els.excerpt.value.trim();p.content_type=normalizeType(els.contentType.value);p.category=els.category.value;p.destination='totonoe';p.main_actor_id=els.mainActor.value||'';p.speaker_ids=selectedSpeakerIds();p.tags=els.tags.value.trim();p.media_url=els.mediaUrl.value.trim();p.episode_no=els.episodeNo.value?Number(els.episodeNo.value):null;p.source_published_at=els.sourceDate.value||'';p.source_type=els.sourceType.value||sourceFromUrl(p.media_url).kind;p.source_id=els.sourceId.value||sourceFromUrl(p.media_url).source_id;p.slug=els.slug.value.trim()||slugify(p.title)||'content-'+Date.now();p.body=safeBody(els.editor.innerHTML).replace(/\/api\/(?:tsuzuri|column)-studio\/media\//g,'/column-media/');p.hero=pendingHero;p.status=status||p.status||'draft';p.updated=dateLabel();checkpoint(p);rememberTags(p.tags);if(!existing)state.posts.unshift(p);state.editingId=p.id;els.slug.value=p.slug;persist();renderDashboard();renderPosts();return p;}
  function updateEditorMeta(){document.getElementById('wordCount').textContent=(els.editor.innerText||'').replace(/\s/g,'').length+'文字';if(!els.slug.value&&els.title.value)els.slug.value=slugify(els.title.value);}
  function saveDraft(){clearTimeout(scheduleSave.timer);var p=collect();p.pending=true;persist();syncRemoteArticle(p).then(function(){toast(API_BASE?'下書きをチームに保存しました':'この端末に下書きを保存しました');}).catch(saveError);}
  async function publish(){
    if(busyPublishing)return;
    var sourceOnly=isSourceOnlyType(els.contentType.value),profile=sourceFromUrl(els.mediaUrl.value);
    if(sourceOnly&&!els.mediaUrl.value.trim()){toast(els.contentType.value==='podcast'?'stand.fmのURLを入力してください':'YouTube URLを入力してください');return;}
    if(sourceOnly&&els.contentType.value==='podcast'&&profile.kind!=='podcast'){toast('stand.fmのエピソードURLを入力してください');return;}
    if(sourceOnly&&['video','learning'].includes(els.contentType.value)&&(profile.kind!=='video'||!profile.source_id)){toast('YouTube URLを入力してください');return;}
    if(!els.title.value.trim()){toast('タイトルを入力してください');return;}
    if(sourceOnly&&!els.mainActor.value)els.mainActor.value='shindo-toshiki';
    if(!API_BASE){toast('端末版です。公開するには本番ダッシュボードへログインしてください');return;}
    if(imagePending){toast('画像の保存が完了するまでお待ちください');return;}
    if(!els.title.value.trim()||!els.mainActor.value){toast('タイトルとMain Actorを入力してください');return;}
    if(['podcast','video','archive','seminar'].includes(els.contentType.value)&&!els.mediaUrl.value.trim()){toast('元コンテンツURLを入力してください');return;}
    clearTimeout(scheduleSave.timer);var p=collect();var button=document.querySelector('[data-action="publish"]');
    busyPublishing=true;var lockedControls=Array.from(document.querySelectorAll('#view-editor input,#view-editor select,#view-editor textarea,#view-editor button')).filter(function(el){return !el.disabled;});lockedControls.forEach(function(el){el.disabled=true;});button.disabled=true;els.editor.contentEditable='false';
    try{
      await syncRemoteArticle(p);
      setPublication('公開処理中','記事を送信しています');
      var result=await api('/api/articles/'+p.id+'/publish',{method:'POST',body:JSON.stringify({expected_revision:p.revision})});
      p.live_url=result.job.live_url;p.status='published';persist();
      setPublication('GitHub更新済み','サイトへの反映を確認しています');
      await checkPublication(p);
    }catch(error){setPublication('公開を完了できませんでした',error.message);saveError(error);}
    finally{busyPublishing=false;lockedControls.forEach(function(el){el.disabled=false;});button.disabled=false;els.editor.contentEditable='true';renderDashboard();renderPosts();}
  }
  function preview(){var media=safeUrl(els.mediaUrl.value.trim());document.getElementById('previewCategory').textContent=contentTypeLabel(els.contentType.value).toUpperCase();document.getElementById('previewTitle').textContent=els.title.value||'無題のコンテンツ';document.getElementById('previewLead').textContent=els.excerpt.value;document.getElementById('previewMainActor').textContent=personById(els.mainActor.value).name;document.getElementById('previewSpeakers').textContent=speakerNames(selectedSpeakerIds());document.getElementById('previewMediaUrl').innerHTML=media?'<a href="'+esc(media)+'" target="_blank" rel="noopener">'+esc(externalLinkLabel(els.contentType.value,media))+' ↗</a><br><small>'+esc(media)+'</small>':'';document.getElementById('previewBody').innerHTML=safeBody(els.editor.innerHTML)||'<p>本文はまだありません。</p>';document.getElementById('previewDate').textContent=dateLabel();document.getElementById('previewDialog').showModal();}
  function format(command){els.editor.focus();if(command==='marker'){document.execCommand('hiliteColor',false,document.getElementById('markerColor').value);}else if(command==='blockquote'){document.execCommand('formatBlock',false,'blockquote');}else if(command==='link'){var url=prompt('リンク先のURLを入力してください','https://');if(safeUrl(url,true))document.execCommand('createLink',false,safeUrl(url,true));else if(url)toast('安全なWebリンクを入力してください');}else{document.execCommand(command,false,null);}scheduleSave();}
  function closeBubblePicker(){var picker=document.getElementById('bubblePicker');var trigger=document.querySelector('[data-action="bubble-picker"]');picker.classList.remove('open');if(trigger)trigger.setAttribute('aria-expanded','false');}
  function toggleBubblePicker(){var picker=document.getElementById('bubblePicker');var opening=!picker.classList.contains('open');picker.classList.toggle('open',opening);var trigger=document.querySelector('[data-action="bubble-picker"]');if(trigger)trigger.setAttribute('aria-expanded',String(opening));}
  function insertBubble(character){
    var option=document.querySelector('#bubblePicker [data-character="'+character+'"]');if(!option)return;
    if(bubbleChange&&selectedBubble&&els.editor.contains(selectedBubble)){
      var prefix=character.split('-')[0];selectedBubble.dataset.character=character;
      selectedBubble.querySelector('.character-icon').src='assets/characters/'+character+'.png';
      selectedBubble.querySelector('.character-icon').alt=option.querySelector('img').alt;
      selectedBubble.querySelector('.character-nameplate').src='assets/characters/'+prefix+'-nameplate.png';
      selectedBubble.querySelector('.character-nameplate').alt={mion:'ミオン',tsugumo:'ツグモ',hakuto:'ハクト'}[prefix];
    }else{
      els.editor.focus();var selection=window.getSelection(),range=editorRange;
      if(!range||!els.editor.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(els.editor);range.collapse(false);}
      var node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
      var parentBubble=node.closest('.editor-bubble');if(parentBubble){range.setStartAfter(parentBubble);range.collapse(true);}
      selection.removeAllRanges();selection.addRange(range);
      var prefix=character.split('-')[0],name={mion:'ミオン',tsugumo:'ツグモ',hakuto:'ハクト'}[prefix];
      document.execCommand('insertHTML',false,'<div class="editor-bubble'+(prefix==='tsugumo'?' right':'')+'" data-character="'+character+'"><div class="bubble-avatar" contenteditable="false"><img class="character-icon" src="assets/characters/'+character+'.png" alt="'+name+'"><img class="character-nameplate" src="assets/characters/'+prefix+'-nameplate.png" alt="'+name+'"></div><div class="bubble-copy"><p>ここに会話文を入力します。</p></div></div><p><br></p>');
    }
    bubbleChange=false;closeBubblePicker();scheduleSave();
  }
  function scheduleSave(){
    if(busyPublishing)return;
    editSerial++;var p=collect();p.pending=true;var stored=persist();
    if(stored)els.saveState.textContent=API_BASE?'この端末に保存済み・共有待ち':'この端末に保存済み';
    clearTimeout(scheduleSave.timer);
    scheduleSave.timer=setTimeout(function(){if(API_BASE&&cloudReady)syncRemoteArticle(p).catch(saveError);},1000);
  }


  function flushPending(){clearTimeout(scheduleSave.timer);var p=state.posts.find(function(item){return item.id===state.editingId;});if(API_BASE&&cloudReady&&p&&p.pending&&!p.conflict)syncRemoteArticle(p).catch(saveError);}
  function saveError(error){els.saveState.textContent='この端末に保存済み・共有できていません';toast(error.message||'共有保存に失敗しました');}
  function rememberTags(tags){state.tagHistory=[...new Set((state.tagHistory||[]).concat(tagArray(tags)))];renderTopicTagSuggestions();}
  function setPublication(title,copy){document.getElementById('visibilityTitle').textContent=title;document.getElementById('visibilityCopy').textContent=copy;}
  async function checkPublication(post){
    var result=await api('/api/articles/'+post.id+'/publication');
    if(state.editingId!==post.id)return;
    var stages={draft:['未公開','まだ公開していません'],running:['公開処理中','GitHubへの反映を処理しています'],failed:['公開失敗','内容を確認して再度公開してください'],deploying:['サイト反映中','GitHubは更新済みです。「公開状況を確認」で再確認できます。'],live:['公開確認済み',(result.job&&result.job.live_url)||post.live_url||'公開ページを確認しました'],unverified:['公開確認が必要','以前の公開には版番号がないため、新しい公開後に確認できます']};
    var display=stages[result.stage]||['確認できません','時間をおいて再確認してください'];
    if(result.has_unpublished_changes)display=[display[0]+'・未公開の編集あり',display[1]+' 編集を反映するには公開ボタンを押してください。'];
    setPublication(display[0],display[1]);
  }
  function showConflict(post){
    document.getElementById('conflictNotice').hidden=false;
    document.getElementById('conflictNotice').textContent='別の更新があります。入力内容はこの端末に保持しています。「最新の共有版を開く」で比較できます。';
  }
  async function openLatest(){
    var post=state.posts.find(function(p){return p.id===state.editingId;});if(!post)return;
    var result=await api('/api/articles');
    var latest=result.articles.find(function(p){return p.id===post.id;});if(!latest)throw new Error('共有版が見つかりません');
    var backup=clone(post);backup.id='article_'+crypto.randomUUID();backup.slug=backup.slug+'-backup-'+Date.now();backup.revision=0;backup.conflict=false;backup.pending=true;backup.status='draft';backup.title+='（端末の退避コピー）';
    state.posts.unshift(backup);state.posts[state.posts.indexOf(post)]=articleFromApi(latest);persist();
    document.getElementById('conflictNotice').hidden=true;editPost(latest.id);toast('端末の編集内容は別の下書きに退避しました');
  }
  function checkpoint(post){
    post.history=post.history||[];var snapshot=clone(post);delete snapshot.history;
    if(!post.history.length||JSON.stringify(payloadFromPost(snapshot))!==JSON.stringify(payloadFromPost(post.history[0].post))){
      post.history.unshift({id:crypto.randomUUID(),created_at:new Date().toISOString(),title:post.title,actor_email:'この端末',post:snapshot});
      post.history=post.history.slice(0,50);
    }
  }
  async function showHistory(){
    var post=collect();var dialog=document.getElementById('historyDialog'),list=document.getElementById('historyList');
    list.textContent='読み込み中…';dialog.showModal();
    try{
      var versions=API_BASE&&post.revision?(await api('/api/articles/'+post.id+'/history')).versions:(post.history||[]);
      list.replaceChildren();if(!versions.length)list.textContent='保存履歴はまだありません。';
      versions.forEach(function(version){
        var button=document.createElement('button');button.type='button';button.className='history-entry';
        button.textContent=(version.created_at||'')+' / '+(version.actor_email||'')+' / '+version.title+' — 内容を確認';
        button.onclick=async function(){
          document.getElementById('restoreVersion').hidden=true;
          try{
            var detail=version.post||(await api('/api/articles/'+post.id+'/history/'+version.id)).version;
            var preview=document.getElementById('historyDetail');preview.textContent=(detail.title||'')+'\nタグ：'+tagArray(detail.tags).join('、')+'\n'+(detail.body||detail.body_html||'').replace(/<[^>]*>/g,' ');
            var restore=document.getElementById('restoreVersion');restore.hidden=false;
            restore.onclick=async function(){
              if(state.editingId!==post.id)return;
              clearTimeout(scheduleSave.timer);
              checkpoint(post);
              var restored=version.post?clone(detail):articleFromApi(detail);
              Object.assign(post,restored,{id:post.id,revision:post.revision,slug:post.slug,history:post.history,status:post.status,pending:true});
              persist();editPost(post.id);dialog.close();
              try{await syncRemoteArticle(post);toast('履歴を編集内容に復元しました。公開には公開ボタンを押してください');}catch(error){saveError(error);}
            };
          }catch(error){toast(error.message);}
        };list.appendChild(button);
      });
    }catch(error){list.textContent=error.message;}
  }
  // Keep selection outside the editor, so picker controls never become article content.
  document.addEventListener('selectionchange',function(){
    var selection=window.getSelection();if(selection.rangeCount&&els.editor.contains(selection.anchorNode))editorRange=selection.getRangeAt(0).cloneRange();
  });
  els.editor.addEventListener('paste',function(event){
    event.preventDefault();var data=event.clipboardData;
    var html=data.getData('text/html');
    if(html)document.execCommand('insertHTML',false,safeBody(html));
    else document.execCommand('insertText',false,data.getData('text/plain'));
    scheduleSave();
  });
  els.editor.addEventListener('drop',function(event){event.preventDefault();toast('画像は画像選択から追加してください');});
  setInterval(function(){if(API_BASE&&sessionExpires&&Date.now()>sessionExpires){clearSessionView();els.saveState.textContent='セッションの保存期限が切れました。再ログインしてください';}},30000);
  els.editor.addEventListener('click',function(event){
    selectedBubble=event.target.closest('.editor-bubble');
    document.getElementById('bubbleEditTools').hidden=!selectedBubble;
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape')closeBubblePicker();});
  window.addEventListener('beforeunload',function(event){
    if(API_BASE&&state.posts.some(function(p){return p.pending;})){event.preventDefault();event.returnValue='';}
  });

  document.addEventListener('click',function(e){var qualificationReview=e.target.closest('[data-qualification-review]');if(qualificationReview){reviewQualification(qualificationReview.dataset.qualificationId,qualificationReview.dataset.qualificationReview,qualificationReview);return;}var lifecycle=e.target.closest('[data-lifecycle]');if(lifecycle){changeLifecycle(lifecycle.dataset.articleId,lifecycle.dataset.lifecycle);return;}var contentView=e.target.closest('[data-content-view]');if(contentView){openContentView(contentView.dataset.contentView);return;}var view=e.target.closest('[data-view]');if(view){showView(view.dataset.view);return;}var edit=e.target.closest('[data-edit]');if(edit){editPost(edit.dataset.edit);return;}var typeFilter=e.target.closest('[data-type-filter]');if(typeFilter){currentTypeFilter=typeFilter.dataset.typeFilter;document.querySelectorAll('[data-type-filter]').forEach(function(b){b.classList.toggle('active',b===typeFilter);});renderPosts();return;}var action=e.target.closest('[data-action]');if(action){var a=action.dataset.action;if(a==='logout')logout();if(a==='new-post')blankPost(false);if(a==='new-template')blankPost(true);if(a==='save-draft')saveDraft();if(a==='publish')publish();if(a==='preview')preview();if(a==='analyze-link')analyzeLink();if(a==='sync-weekly')syncWeekly(action).catch(function(error){toast(error.message);});if(a==='refresh-qualifications')loadQualifications().then(function(){toast('資格申請を更新しました');}).catch(function(error){toast(error.message);});if(a==='close-preview')document.getElementById('previewDialog').close();if(a==='bubble-picker'){bubbleChange=false;toggleBubblePicker();}if(a==='close-bubble')closeBubblePicker();if(a==='invite')document.getElementById('inviteDialog').showModal();if(a==='save-settings')toast('公開設定を保存しました');if(a==='open-site')window.open('../../projects/totonoe/index.html','_blank');return;}var command=e.target.closest('[data-command]');if(command){format(command.dataset.command);return;}var topicTag=e.target.closest('#topicTagSuggestions [data-topic-tag]');if(topicTag){toggleTopicTag(topicTag.dataset.topicTag);return;}var character=e.target.closest('#bubblePicker [data-character]');if(character){insertBubble(character.dataset.character);return;}var role=e.target.closest('[data-role-preview]');if(role){if(API_BASE)toast('本番ではログイン中の権限が適用されます');else applyRole(role.dataset.rolePreview);return;}if(!e.target.closest('#bubblePicker')&&!e.target.closest('[data-action="bubble-picker"]'))closeBubblePicker();if(!e.target.closest('#accountMenu')&&!e.target.closest('#accountButton'))document.getElementById('accountMenu').classList.remove('open');});
  document.getElementById('accountButton').addEventListener('click',function(){var menu=document.getElementById('accountMenu');menu.classList.toggle('open');this.setAttribute('aria-expanded',menu.classList.contains('open'));});
  document.getElementById('mobileMenu').addEventListener('click',function(){document.getElementById('sidebar').classList.toggle('open');});
  document.getElementById('postSearch').addEventListener('input',renderPosts);
  document.querySelectorAll('[data-filter]').forEach(function(btn){btn.addEventListener('click',function(){setStatusFilter(this.dataset.filter);});});
  document.getElementById('blockFormat').addEventListener('change',function(){els.editor.focus();document.execCommand('formatBlock',false,this.value);});
  [els.editor,els.title,els.excerpt,els.contentType,els.category,els.tags,els.slug,els.mainActor,els.speakers,els.mediaUrl,els.episodeNo,els.sourceDate].forEach(function(el){el.addEventListener('input',function(){updateEditorMeta();scheduleSave();});el.addEventListener('change',function(){updateEditorMeta();scheduleSave();});});
  els.contentType.addEventListener('change',syncSourceFields);
  els.tags.addEventListener('input',syncTopicTagSuggestions);
  els.mediaUrl.addEventListener('input',function(){sourceSequence++;resetLinkButton();if(els.mediaUrl.value.trim()!==lastAnalyzedUrl){Object.keys(sourceValues).forEach(function(key){if(key==='hero'){if(pendingHero===sourceValues.hero)setHeroPreview('');}else if(els[key].value===sourceValues[key])els[key].value='';});sourceValues={};els.sourceId.value='';els.sourceType.value='';document.getElementById('linkStatus').textContent='URLを変更しました。手入力した項目も確認してください';}clearTimeout(analyzeLink.timer);var value=els.mediaUrl.value.trim();scheduleSave();if(!value){lastAnalyzedUrl='';clearLinkPreview();return;}analyzeLink.timer=setTimeout(function(){if(value!==lastAnalyzedUrl)analyzeLink();},700);});
  document.querySelectorAll('[data-setting-tab]').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('[data-setting-tab]').forEach(function(b){b.classList.toggle('active',b===btn);});document.querySelectorAll('.setting-content').forEach(function(c){c.classList.toggle('active',c.id==='setting-'+btn.dataset.settingTab);});});});
  document.getElementById('imageDrop').addEventListener('click',function(){document.getElementById('imageInput').click();});
  document.getElementById('imageInput').addEventListener('change',async function(){
    var file=this.files[0];if(!file)return;
    if(file.size>2*1024*1024){toast('画像は2MB以下にしてください');return;}
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){toast('PNG・JPEG・WebP・GIFを選択してください');return;}
    var post=collect(),sequence=state.editingId;imagePending=true;
    try{
      var url=API_BASE?(await uploadHero(file)).url:await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsDataURL(file);});
      post.hero=url;post.pending=true;persist();
      if(sequence===state.editingId){setHeroPreview(url);sourceValues.hero=null;scheduleSave();}
      else if(API_BASE)syncRemoteArticle(post).catch(saveError);
    }catch(error){toast(error.message||'画像を保存できませんでした');}finally{imagePending=false;this.value='';}
  });
  document.getElementById('memberList').addEventListener('change',async function(e){
    if(!e.target.matches('[data-member-role]'))return;
    var member=state.members.find(function(item,i){return (item.id||String(i))===e.target.dataset.memberRole;});if(!member)return;
    var previous=member.role;member.role=e.target.value;persist();
    try{if(API_BASE){var result=await api('/api/members/'+encodeURIComponent(member.id),{method:'PATCH',body:JSON.stringify({role:member.role,status:member.status})});Object.assign(member,memberFromApi(result.member));}toast('メンバーの権限を変更しました');}
    catch(error){member.role=previous;persist();renderMembers();toast(error.message);}
  });
  document.getElementById('memberList').addEventListener('click',async function(e){
    var button=e.target.closest('[data-member-status]');if(!button)return;
    var member=state.members.find(function(item,i){return (item.id||String(i))===button.dataset.memberStatus;});if(!member)return;
    var previous=member.status;member.status=member.status==='disabled'?'active':'disabled';persist();renderMembers();
    try{if(API_BASE){var result=await api('/api/members/'+encodeURIComponent(member.id),{method:'PATCH',body:JSON.stringify({role:member.role,status:member.status})});Object.assign(member,memberFromApi(result.member));}renderMembers();toast(member.status==='active'?'利用を再開しました':'利用を停止しました');}
    catch(error){member.status=previous;persist();renderMembers();toast(error.message);}
  });
  document.getElementById('inviteForm').addEventListener('submit',async function(e){
    e.preventDefault();var email=document.getElementById('inviteEmail').value.trim();if(!email)return;
    var input={name:document.getElementById('inviteName').value.trim(),email:email,role:document.getElementById('inviteRole').value};
    try{
      var member;
      if(API_BASE){member=memberFromApi((await api('/api/members',{method:'POST',body:JSON.stringify(input)})).member);}
      else member={name:input.name||'登録メンバー',email:email,role:input.role,status:'active',initial:(input.name||email).slice(0,2).toUpperCase()};
      var index=state.members.findIndex(function(item){return item.email.toLowerCase()===email.toLowerCase();});if(index>-1)state.members[index]=member;else state.members.push(member);
      persist();renderMembers();renderDashboard();document.getElementById('inviteDialog').close();this.reset();toast(email+' をメンバーに登録しました');
    }catch(error){toast(error.message);}
  });

  if(!els.mainActor.querySelector('option[value=""]')){var actorPlaceholder=document.createElement('option');actorPlaceholder.value='';actorPlaceholder.textContent='選択してください';els.mainActor.insertBefore(actorPlaceholder,els.mainActor.firstChild);}
  document.getElementById('openHistory').onclick=function(){document.getElementById('restoreVersion').hidden=true;document.getElementById('historyDetail').textContent='';showHistory();};
  document.getElementById('closeHistory').onclick=function(){document.getElementById('historyDialog').close();};
  document.getElementById('openLatest').onclick=function(){if(API_BASE)openLatest().catch(saveError);else toast('端末版では共有版を開けません');};
  document.getElementById('checkPublication').onclick=function(){var p=state.posts.find(function(item){return item.id===state.editingId;});if(API_BASE&&p&&p.revision)checkPublication(p).catch(saveError);else toast('公開履歴はまだありません');};
  document.getElementById('changeBubble').onclick=function(){if(selectedBubble){bubbleChange=true;toggleBubblePicker();}};
  document.getElementById('flipBubble').onclick=function(){if(selectedBubble){selectedBubble.classList.toggle('right');scheduleSave();}};
  document.getElementById('removeBubble').onclick=function(){if(selectedBubble){selectedBubble.remove();selectedBubble=null;document.getElementById('bubbleEditTools').hidden=true;scheduleSave();}};
  if(location.protocol!=='file:')fetch('../../projects/totonoe/data/contents/index.json',{cache:'no-store'}).then(function(res){if(!res.ok)throw new Error();return res.json();}).then(function(data){(data.articles||[]).forEach(function(p){rememberTags(p.topic_tags||p.tags||[]);});persist();}).catch(function(){});
  renderTopicTagSuggestions();syncSourceFields();applyRole(state.role);renderDashboard();renderPosts();renderMembers();renderQualifications();var initialView=location.hash.replace('#','');if(['tsuzuri','column','podcast','video','archive'].includes(initialView))openContentView(initialView);bootRemote();
})();
