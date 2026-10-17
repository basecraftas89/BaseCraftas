export function patchEditorWorkspaceScript(source){
 if(source.includes('studio:publication'))return source;
 const once=(a,b)=>{if(source.split(a).length!==2)throw Error('Editor patch boundary changed: '+a.slice(0,70));source=source.replace(a,b)};
 once("function format(command){if(command==='link'){openTextLinkDialog();return;}els.editor.focus();", "function format(command){if(command==='link'){openTextLinkDialog();return;}var range=editorRange&&editorRange.cloneRange();els.editor.focus();if(range&&els.editor.contains(range.commonAncestorContainer)){var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}");
 once("function toast(message){els.toast.textContent=message;", "function toast(message){document.dispatchEvent(new CustomEvent('studio:editor-notice',{detail:{message:message}}));els.toast.textContent=message;");
 once("function saveError(error){els.saveState.textContent=", "function saveError(error){if(!busyPublishing)document.dispatchEvent(new CustomEvent('studio:publication',{detail:{title:'共有保存を完了できませんでした',copy:error.message||'接続と最新版を確認してください。',error:true}}));els.saveState.textContent=");
 once("function setPublication(title,copy){document.getElementById('visibilityTitle').textContent=title;document.getElementById('visibilityCopy').textContent=copy;}", "function setPublication(title,copy){document.getElementById('visibilityTitle').textContent=title;document.getElementById('visibilityCopy').textContent=copy;document.dispatchEvent(new CustomEvent('studio:publication',{detail:{title:title,copy:copy,error:/できません|失敗/.test(title)}}));}");
 once("async function publish(){\n    if(busyPublishing)return;", "async function publish(){\n    if(busyPublishing){toast('公開処理中です。完了するまでお待ちください');return;}");
 once("busyPublishing=true;var lockedControls=", "var publishButtonLabel=button.textContent;button.textContent='公開準備中…';setPublication('保存中…','公開する内容をチームに保存しています');busyPublishing=true;var lockedControls=");
 once("await syncRemoteArticle(p);\n      setPublication('公開処理中'", "await syncRemoteArticle(p);\n      if(!sourceOnly){setPublication('公開前の確認中…','この版の確認記録を確認しています');var review=await api('/api/articles/'+p.id+'/editorial-review');if(review.required&&review.block)throw new Error(review.block);}\n      setPublication('公開処理中'");
 once("}catch(error){setPublication('公開を完了できませんでした',error.message);saveError(error);}", "}catch(error){if(error.status===403)error.message='このアカウントに記事の公開権限がありません。公開権限のあるメンバーへ依頼してください。';setPublication('公開を完了できませんでした',error.message);saveError(error);}");
 once("button.disabled=false;els.editor.contentEditable='true';renderDashboard();renderPosts();}", "button.disabled=false;button.textContent=publishButtonLabel;els.editor.contentEditable='true';renderDashboard();renderPosts();}");
 return source;
}
export function withEditorWorkspace(previous,assets={}){return {...previous,async fetch(request,env,ctx){
 const p=new URL(request.url).pathname,base='/apps/totonoe-studio/';
 if(request.method==='GET'&&/^\/apps\/(?:totonoe|tsuzuri|column)-studio\/editor-workspace\.(?:js|css)$/.test(p)){const file=p.split('/').at(-1);if(!assets[file]){const u=new URL(request.url);u.pathname='/apps/tsuzuri-studio/'+file;return env.ASSETS.fetch(new Request(u,request));}return new Response(assets[file],{headers:{'content-type':file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}})}
 const eligible=request.method==='GET'&&/^\/apps\/(?:totonoe|tsuzuri|column)-studio\/(?:index.html|script.js)?$/.test(p);if(!eligible)return previous.fetch(request,env,ctx);
 const headers=new Headers(request.headers);headers.delete('if-none-match');headers.delete('if-modified-since');const r=await previous.fetch(new Request(request,{headers}),env,ctx);if(r.status!==200)return r;
 const type=r.headers.get('content-type')||'';if(!/html|javascript/.test(type))return r;
 let text=await r.text();if(p.endsWith('/script.js'))text=patchEditorWorkspaceScript(text);else if(!text.includes('editor-workspace.js'))text=text.replace('</head>','<link rel="stylesheet" href="'+base+'editor-workspace.css?v=20261018"></head>').replace('</body>','<script src="'+base+'editor-workspace.js?v=20261018" defer></script></body>');
 const h=new Headers(r.headers);for(const k of ['etag','content-length','content-encoding'])h.delete(k);h.set('cache-control','private, no-store');h.set('x-studio-editor-workspace','20261018');return new Response(text,{status:r.status,headers:h});
}}}
