(() => {
  const checkbox = document.getElementById('onboardingPreference');
  const status = document.getElementById('onboardingPreferenceStatus');
  if (!checkbox || !status) return;
  const endpoint = '/api/totonoe-member/api/weekly/onboarding';
  let started = false, saved = false;
  async function state(body) {
    if (window.ToToNoEMember?.isLocalPreview) {
      if (body) localStorage.setItem('totonoe-onboarding-preview', JSON.stringify(body));
      try { return body || JSON.parse(localStorage.getItem('totonoe-onboarding-preview') || '{"step":0,"completed":false}'); }
      catch { return {step:0,completed:false}; }
    }
    const response = await fetch(endpoint, {method:body?'PATCH':'GET', credentials:'same-origin', headers:{'content-type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{})});
    if (!response.ok) throw new Error('表示設定を保存・取得できませんでした。ページを再読み込みしてお試しください。');
    return response.json();
  }
  async function start() {
    if (started) return;
    started = true;
    try { const value = await state(); saved = Boolean(value.completed); checkbox.checked = saved; checkbox.disabled = false; status.textContent = ''; }
    catch (error) { status.textContent = error.message; }
  }
  checkbox.addEventListener('change', async () => {
    checkbox.disabled = true; status.textContent = '保存中…';
    try { const value = await state({step:0,completed:checkbox.checked}); saved = Boolean(value.completed); checkbox.checked = saved; status.textContent = '表示設定を保存しました。'; }
    catch (error) { checkbox.checked = saved; status.textContent = error.message; }
    finally { checkbox.disabled = false; }
  });
  window.addEventListener('totonoe:member-access', event => {
    if (event.detail.has_weekly_access || event.detail.has_curriculum_access) start();
  });
  if (window.ToToNoEMember?.isLocalPreview || !document.documentElement.classList.contains('member-access-pending')) start();
})();
