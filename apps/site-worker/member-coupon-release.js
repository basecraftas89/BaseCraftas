// Layer only this Studio panel over the current production asset manifest.
export function withMemberCouponDashboard(previous, script) {
  const panel = "          <section class=\"panel billing-table-panel\" aria-label=\"会員のクーポン利用状況\">\n            <div class=\"panel-head\"><div><p class=\"eyebrow\">MEMBERS</p><h2>会員・無料クーポン利用状況</h2></div><button class=\"secondary-button\" type=\"button\" id=\"refreshMemberCoupons\">更新</button></div>\n            <p id=\"memberCouponQuality\" role=\"status\">ログイン後にStripeの適用状況を確認します。</p>\n            <div class=\"billing-table-scroll\"><table class=\"billing-table\"><thead><tr><th>サービス</th><th>有効会員</th><th>無料クーポン適用</th><th>その他の割引</th><th>クーポンなし</th><th>うち無料トライアル</th><th>未確認</th></tr></thead><tbody id=\"memberCouponRows\"></tbody></table></div>\n            <p>人数のみを表示します。無料トライアルは「クーポンなし」の内数です。対象者の資格・過去の利用履歴ではなく、現在の適用状況です。</p>\n          </section>\n";
  return { async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/apps/totonoe-studio/member-coupon-dashboard.js' && ['GET','HEAD'].includes(request.method)) {
      return new Response(request.method === 'HEAD' ? null : script, {headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    const response = await previous.fetch(request, env, ctx);
    if (!['/apps/totonoe-studio/','/apps/totonoe-studio/index.html','/apps/totonoe-studio/index'].includes(url.pathname) || request.method !== 'GET' || response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
    const headers = new Headers(response.headers);
    for (const key of ['content-length','content-encoding','etag']) headers.delete(key);
    headers.set('cache-control','private, no-store');
    headers.set('x-totonoe-member-coupon-release','20261005');
    const transformed = new HTMLRewriter()
      .on('#view-dashboard .dashboard-grid', {element(e){e.before(panel,{html:true});}})
      .on('body', {element(e){e.append('<script src="/apps/totonoe-studio/member-coupon-dashboard.js?v=20261005"></script>',{html:true});}})
      .transform(response);
    return new Response(transformed.body, {status:response.status,headers});
  }};
}
