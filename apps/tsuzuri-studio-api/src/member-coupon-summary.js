// Only aggregate categories leave the server; Stripe IDs and coupon codes stay private.
export function couponCategory(subscription, now = Date.now() / 1000) {
  const discounts = subscription.discounts ?? (subscription.discount ? [subscription.discount] : []);
  if (!Array.isArray(discounts)) return 'unknown';
  const current = discounts.filter(d => typeof d === 'string' || (!d.deleted && (!d.end || d.end > now)));
  if (current.some(d => typeof d === 'string')) return 'unknown';
  const coupons = current.map(d => d.coupon || d.source?.coupon);
  if (coupons.some(c => !c || typeof c === 'string')) return 'unknown';
  if (coupons.some(c => Number(c.percent_off) === 100)) return 'free_coupon';
  if (current.length) return 'other_discount';
  // Item/customer discounts need separate interpretation; do not report them as coupon-free.
  if (subscription.items?.data?.some(i => i.discounts?.length) || subscription.customer?.discount) return 'unknown';
  return 'no_coupon';
}

export async function aggregateMemberCoupons(env) {
  const live = env.STRIPE_MODE === 'live';
  if (!new RegExp(`^(?:sk|rk)_${live ? 'live' : 'test'}_`).test(env.STRIPE_SECRET_KEY || '')) {
    throw new Error('stripe_summary_unavailable');
  }
  const { results = [] } = await env.DB.prepare(`SELECT customer_id, provider_subscription_id, product_code
    FROM customer_subscriptions WHERE provider = 'stripe' AND livemode = ? AND status IN ('active','trialing')`).bind(live ? 1 : 0).all();
  const groups = ['weekly', 'curriculum'].map(product_code => ({ product_code, total: 0, free_coupon: 0, other_discount: 0, no_coupon: 0, unknown: 0, no_coupon_trial: 0 }));
  const members = new Map();
  for (const row of results) {
    if (!groups.some(g => g.product_code === row.product_code)) continue;
    let category = 'unknown', trial = false;
    try {
      if (!/^sub_[A-Za-z0-9_]+$/.test(row.provider_subscription_id)) throw new Error('invalid_subscription');
      const params = new URLSearchParams();
      params.append('expand[]', 'discounts');
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${row.provider_subscription_id}?${params}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        console.warn(JSON.stringify({event:'member_coupon.stripe_read_failed',status:response.status,code:String(detail.error?.code || '').slice(0,60),parameter:String(detail.error?.param || '').slice(0,60)}));
        throw new Error('stripe_read_failed');
      }
      const subscription = await response.json();
      if (subscription.livemode !== live || subscription.id !== row.provider_subscription_id) throw new Error('stripe_mismatch');
      if (!['active', 'trialing'].includes(subscription.status)) continue;
      category = couponCategory(subscription);
      trial = subscription.status === 'trialing';
    } catch (error) { console.warn(JSON.stringify({event:'member_coupon.read_unknown',reason:['stripe_read_failed','stripe_mismatch','invalid_subscription'].includes(error.message)?error.message:'read_unavailable'})); }
    const key = `${row.product_code}:${row.customer_id}`;
    const previous = members.get(key);
    members.set(key, { product: row.product_code, category: previous && previous.category !== category ? 'unknown' : category, trial: trial || previous?.trial });
  }
  for (const member of members.values()) {
    const group = groups.find(g => g.product_code === member.product);
    group.total++;
    group[member.category]++;
    if (member.category === 'no_coupon' && member.trial) group.no_coupon_trial++;
  }
  return { generated_at: new Date().toISOString(), environment: live ? 'live' : 'test', groups };
}
