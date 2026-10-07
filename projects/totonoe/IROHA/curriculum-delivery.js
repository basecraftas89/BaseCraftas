(() => {
  'use strict';
  const local=['','localhost','127.0.0.1'].includes(location.hostname);
  const base='/api/totonoe-member/api/curriculum';
  async function api(path,body) {
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error||'curriculum_unavailable'),{status:response.status});
    return result;
  }
  async function refresh() {const result=await api('/catalog');window.TOTONOE_APPLY_DELIVERY(result);return result;}
  const ready=local?Promise.resolve(null):refresh().then(async result=>{
    if(result.staffAccess && new URLSearchParams(location.search).get('preview')==='claude') {
      await api('/preview/claude',{});return refresh();
    }
    return result;
  }).catch(error=>({error}));
  window.TOTONOE_DELIVERY={local,ready,api,refresh};
})();
