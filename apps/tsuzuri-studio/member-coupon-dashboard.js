/* Scoped production extension: aggregate counts only, authenticated same-origin API. */
(function () {
  'use strict';
  var rows = document.getElementById('memberCouponRows'), quality = document.getElementById('memberCouponQuality');
  if (!rows || !quality || window.__memberCouponDashboard) return;
  window.__memberCouponDashboard = true;
  var loading = false;
  async function load() {
    if (loading) return;
    loading = true; rows.replaceChildren(); quality.textContent = 'Stripeの適用状況を確認しています。';
    try {
      var response = await fetch('/api/totonoe-studio/api/member-coupon-summary', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      var data = await response.json();
      data.groups.forEach(function (g) {
        var tr = document.createElement('tr'), th = document.createElement('th');
        th.textContent = g.product_code === 'weekly' ? 'TAYORI' : 'IROHA'; tr.appendChild(th);
        ['total', 'free_coupon', 'other_discount', 'no_coupon', 'no_coupon_trial', 'unknown'].forEach(function (key) {
          var td = document.createElement('td'); td.textContent = Number(g[key]) + '人'; tr.appendChild(td);
        }); rows.appendChild(tr);
      });
      quality.textContent = (data.environment === 'live' ? '本番' : 'テスト') + ' · 確認日時 ' + new Date(data.generated_at).toLocaleString('ja-JP') + ' · 未確認は取得失敗または判定できない割引です。';
    } catch (_) { quality.textContent = '適用状況を取得できません。ログイン状況とStripe連携設定を確認してください。'; }
    finally { loading = false; }
  }
  document.getElementById('refreshMemberCoupons').addEventListener('click', load);
  load();
})();
