import { reserveEmailBudget } from './enrollment-limits.js';

const OTP_LENGTH = 6;
const SESSION_TOKEN_BYTES = 32;
// Cloudflare Workers WebCrypto rejects PBKDF2 iteration counts above 100000.
export const CUSTOMER_PASSWORD_ITERATIONS = 100000;

function serviceError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

export function normalizeCustomerEmail(value) {
  const email = String(value || "").normalize("NFKC").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw serviceError("invalid_email");
  }
  return email;
}

function randomInteger(maxExclusive) {
  const maximum = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= maximum);
  return values[0] % maxExclusive;
}

export function generateOtpCode() {
  return String(randomInteger(10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generateSessionToken() {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function hashAuthValue(secret, purpose, value) {
  const keyValue = String(secret || "");
  if (keyValue.length < 32) throw serviceError("customer_auth_secret_missing", 503);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${purpose}:${String(value || "")}`)
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generatePasswordSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashCustomerPassword(password, salt, iterations = CUSTOMER_PASSWORD_ITERATIONS) {
  const value = String(password || "");
  const normalizedSalt = String(salt || "");
  const count = Number(iterations);
  if (value.length < 12 || value.length > 256 || !/^[0-9a-f]{32}$/i.test(normalizedSalt) || !Number.isInteger(count) || count !== CUSTOMER_PASSWORD_ITERATIONS) {
    throw serviceError("invalid_password", 400);
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(normalizedSalt), iterations: count, hash: "SHA-256" }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export function timingSafeTextEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
  }
  let difference = 0;
  for (let index = 0; index < leftBytes.byteLength; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function readJsonLimit(response, limit = 128 * 1024) {
  if (!response.body) return {};
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw serviceError("upstream_response_too_large", 502);
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  text += decoder.decode();
  try {
    return JSON.parse(text || "{}");
  } catch (_error) {
    throw serviceError("invalid_upstream_response", 502);
  }
}

export async function sendOtpWithResend(env, { email, code, challengeId, existingMember = false }) {
  if (!String(env.RESEND_API_KEY || "").startsWith("re_")) throw serviceError("resend_api_key_missing", 503);
  const from = String(env.RESEND_FROM_EMAIL || "").trim();
  if (!from) throw serviceError("resend_from_email_missing", 503);
  await reserveEmailBudget(env, { id: `otp:${challengeId}`,
    recipientHash: await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "mail-recipient", email),
    category: existingMember ? "member" : "onboarding" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `totonoe-auth-${challengeId}`,
      "user-agent": "totonoe-customer-auth/1.0",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "【ToToNoE+】認証コードのお知らせ",
      text: `ToToNoE+の認証コードは ${code} です。10分以内に入力してください。心当たりがない場合は、このメールを破棄してください。`,
      html: `<div style="font-family:sans-serif;line-height:1.8;color:#1a332c"><h1 style="font-size:20px">ToToNoE+ 認証コード</h1><p>次の6桁を、10分以内に入力してください。</p><p style="font-size:30px;font-weight:700;letter-spacing:.18em">${code}</p><p style="font-size:13px;color:#5f716b">心当たりがない場合は、このメールを破棄してください。</p></div>`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !result.id) throw serviceError("auth_email_delivery_failed", 502);
  return { messageId: String(result.id) };
}

function escapeEmailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendQualificationReviewEmail(env, { email, status, submissionId, reviewNote = "" }) {
  if (!String(env.RESEND_API_KEY || "").startsWith("re_")) throw serviceError("resend_api_key_missing", 503);
  const from = String(env.RESEND_FROM_EMAIL || "").trim();
  if (!from) throw serviceError("resend_from_email_missing", 503);
  const approved = status === "verified";
  const subject = approved ? "【ToToNoE+】セラピスト資格確認が完了しました" : "【ToToNoE+】資格証明画像の再提出をお願いします";
  const action = approved
    ? "資格確認が完了しました。同じメールアドレスでIROHAへお申し込みください。"
    : "提出内容を確認できなかったため、IROHAの申込画面から改めて資格証明画像をご提出ください。";
  const note = String(reviewNote || "").trim().slice(0, 500);
  const noteText = note ? `\n運営からのご案内：${note}` : "";
  await reserveEmailBudget(env, { id: `qualification:${submissionId}:${status}`,
    recipientHash: await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "mail-recipient", email), category: "other" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `totonoe-qualification-${submissionId}-${status}`,
      "user-agent": "totonoe-customer-auth/1.0",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: `${action}${noteText}\n\nこのメールに心当たりがない場合は、破棄してください。`,
      html: `<div style="font-family:sans-serif;line-height:1.8;color:#1a332c"><h1 style="font-size:20px">${escapeEmailHtml(subject.replace("【ToToNoE+】", ""))}</h1><p>${escapeEmailHtml(action)}</p>${note ? `<p style="padding:12px;background:#f3f6f4;border-radius:8px"><strong>運営からのご案内</strong><br>${escapeEmailHtml(note)}</p>` : ""}<p style="font-size:13px;color:#5f716b">このメールに心当たりがない場合は、破棄してください。</p></div>`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !result.id) throw serviceError("qualification_email_delivery_failed", 502);
  return { messageId: String(result.id) };
}

export async function sendTayoriInvitationEmail(env, { email, invitationId, origin }) {
  if (!String(env.RESEND_API_KEY || "").startsWith("re_")) throw serviceError("resend_api_key_missing", 503);
  const from = String(env.RESEND_FROM_EMAIL || "").trim();
  if (!from) throw serviceError("resend_from_email_missing", 503);
  const signupUrl = `${origin}/projects/totonoe/TAYORI/subscribe.html`;
  await reserveEmailBudget(env, { id: `invitation:${invitationId}`,
    recipientHash: await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "mail-recipient", email), category: "onboarding" });
  const subject = "【ToToNoE+ TAYORI】お申し込み受付のご案内";
  const message = `TAYORIのウェイトリストへご登録いただき、ありがとうございます。\nお申し込み受付を開始しました。\n\n${signupUrl}\n\n申込時に決済情報の登録が必要です。申込完了後に14日間の無料トライアルが始まります。無料期間終了前に解約が完了しなければ、終了後から月額980円（税込）が自動で請求されます。無料期間終了前に解約が完了した場合、月額料金は発生しません。\n\nご登録のメールアドレスで本人確認をしてから、申込条件をご確認ください。このメールだけでは申込・課金は始まりません。心当たりがない場合は破棄してください。`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `totonoe-tayori-invite-${invitationId}`,
      "user-agent": "totonoe-customer-auth/1.0",
    },
    body: JSON.stringify({ from, to: [email], subject, text: message }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !result.id) throw serviceError("invitation_email_delivery_failed", 502);
  return { messageId: String(result.id) };
}

export function customerSessionCookie(token, maxAgeSeconds = 30 * 24 * 60 * 60) {
  return `totonoe_session=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCustomerSessionCookie() {
  return "totonoe_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

export function readCookie(request, name) {
  const prefix = `${name}=`;
  for (const item of String(request.headers.get("cookie") || "").split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return "";
}

export function resolveIrohaFirstPromotion({ code, planCode, feeType, env }) {
  if (code != null && (typeof code !== "string" || code.length > 64)) throw serviceError("invalid_promotion_code");
  const submittedCode = String(code || "").normalize("NFKC").trim();
  if (!submittedCode) return "";
  if (planCode !== "curriculum_monthly" || feeType !== "first") throw serviceError("promotion_not_applicable");
  const expectedCode = String(env.IROHA_FIRST_PROMOTION_CODE || "").normalize("NFKC").trim();
  const promotionId = String(env.IROHA_FIRST_PROMOTION_ID || "");
  if (!expectedCode || !/^promo_[A-Za-z0-9]+$/.test(promotionId)) throw serviceError("iroha_promotion_not_ready", 503);
  if (!timingSafeTextEqual(submittedCode.toUpperCase(), expectedCode.toUpperCase())) throw serviceError("invalid_promotion_code");
  return promotionId;
}

export function buildStripeCheckoutParams({ quote, env, customer, attemptId, successUrl, cancelUrl, promotionCodeId = "", appliedCampaignCode = "" }) {
  const recurringPrice = String(env[quote.recurringPriceEnv] || "");
  if (!/^price_[A-Za-z0-9]+$/.test(recurringPrice)) throw serviceError("stripe_price_missing", 503);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("locale", "ja");
  params.set("client_reference_id", customer.id);
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("line_items[0][price]", recurringPrice);
  params.set("line_items[0][quantity]", "1");
  if (quote.planCode === "weekly_monthly") params.set("allow_promotion_codes", "true");
  // A trial must not start without a payment method for the first paid renewal.
  params.set("payment_method_collection", "always");
  params.set("payment_method_types[0]", "card");
  if (promotionCodeId) {
    if (quote.planCode !== "curriculum_monthly" || quote.feeType !== "first" || !/^promo_[A-Za-z0-9]+$/.test(promotionCodeId)) {
      throw serviceError("promotion_not_applicable");
    }
    // The legacy code selects the three-month trial; there is no entry-fee line to discount.
  }
  if (quote.trialEndSeconds) params.set("subscription_data[trial_end]", String(quote.trialEndSeconds));
  else if (quote.trialPeriodDays > 0) params.set("subscription_data[trial_period_days]", String(quote.trialPeriodDays));
  if (customer.stripe_customer_id) params.set("customer", customer.stripe_customer_id);
  else params.set("customer_email", customer.email);
  const metadata = {
    attempt_id: attemptId,
    customer_id: customer.id,
    plan_code: quote.planCode,
    audience_type: quote.audienceType,
    fee_type: quote.feeType,
    campaign_code: appliedCampaignCode || quote.campaignCode,
  };
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, String(value));
    params.set(`subscription_data[metadata][${key}]`, String(value));
  }
  return params;
}

export async function createStripeCheckoutSession(env, params, idempotencyKey) {
  const secret = String(env.STRIPE_SECRET_KEY || "");
  const mode = String(env.STRIPE_MODE || "");
  if (!["test", "live"].includes(mode) || !new RegExp(`^(?:sk|rk)_${mode}_`).test(secret)) throw serviceError("stripe_secret_mode_mismatch", 503);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": idempotencyKey,
    },
    body: params,
    signal: AbortSignal.timeout(10000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !new RegExp(`^cs_${mode}_[A-Za-z0-9_]+$`).test(String(result.id || "")) || result.livemode !== (mode === "live") || !/^https:\/\/checkout\.stripe\.com\//.test(String(result.url || ""))) {
    const error = serviceError("stripe_checkout_failed", 502);
    error.detail = String(result?.error?.code || result?.error?.type || "upstream_error").slice(0, 120);
    error.checkoutNotCreated = response.status === 400 && result?.error?.type === 'invalid_request_error'
      && result?.error?.code !== 'idempotency_key_in_use';
    throw error;
  }
  return { id: String(result.id), url: String(result.url), customerId: String(result.customer || "") };
}

export async function retrieveStripeCheckoutSession(env, sessionId) {
  const mode = String(env.STRIPE_MODE || '');
  const secret = String(env.STRIPE_SECRET_KEY || '');
  if (!['test', 'live'].includes(mode) || !new RegExp(`^(?:sk|rk)_${mode}_`).test(secret)) throw serviceError('stripe_secret_mode_mismatch', 503);
  if (!new RegExp(`^cs_${mode}_[A-Za-z0-9_]+$`).test(sessionId)) throw serviceError('invalid_checkout_session');
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000),
  });
  const session = await readJsonLimit(response);
  if (!response.ok || session.id !== sessionId || session.livemode !== (mode === 'live')) throw serviceError('stripe_checkout_verification_failed', 502);
  return session;
}

export async function cancelReplacedTayoriSubscription(env, subscriptionId, customerId) {
  const mode = String(env.STRIPE_MODE || "");
  const secret = String(env.STRIPE_SECRET_KEY || "");
  if (!["test", "live"].includes(mode) || !new RegExp(`^(?:sk|rk)_${mode}_`).test(secret)) throw serviceError("stripe_secret_mode_mismatch", 503);
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) throw serviceError("invalid_stripe_subscription");
  const endpoint = `https://api.stripe.com/v1/subscriptions/${subscriptionId}`;
  const headers = { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" };
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
  const current = await readJsonLimit(response);
  if (!response.ok || current.id !== subscriptionId || current.livemode !== (mode === "live")
      || current.metadata?.customer_id !== customerId || current.metadata?.plan_code !== "weekly_monthly") {
    throw serviceError("stripe_replacement_verification_failed", 502);
  }
  if (current.status === "canceled") return current;
  const canceledResponse = await fetch(endpoint, {
    method: "DELETE", headers,
    body: new URLSearchParams({ invoice_now: "false", prorate: "false", "cancellation_details[comment]": "IROHA membership includes TAYORI" }),
    signal: AbortSignal.timeout(10000),
  });
  const canceled = await readJsonLimit(canceledResponse);
  if (!canceledResponse.ok || canceled.id !== subscriptionId || canceled.status !== "canceled" || canceled.livemode !== (mode === "live")) {
    throw serviceError("stripe_replacement_cancel_failed", 502);
  }
  return canceled;
}

export async function createStripePortalSession(env, { customerId, returnUrl }) {
  const secret = String(env.STRIPE_SECRET_KEY || "");
  const mode = String(env.STRIPE_MODE || "");
  if (!["test", "live"].includes(mode) || !new RegExp(`^(?:sk|rk)_${mode}_`).test(secret)) throw serviceError("stripe_secret_mode_mismatch", 503);
  if (!/^cus_[A-Za-z0-9_]+$/.test(String(customerId || ""))) throw serviceError("stripe_customer_missing", 409);
  let target;
  try {
    target = new URL(returnUrl);
  } catch (_error) {
    throw serviceError("invalid_portal_return_url", 503);
  }
  if (target.protocol !== "https:" && !["localhost", "127.0.0.1", "test.local"].includes(target.hostname)) {
    throw serviceError("invalid_portal_return_url", 503);
  }
  const params = new URLSearchParams({ customer: customerId, return_url: target.href, locale: "ja" });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(10000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !/^bps_[A-Za-z0-9_]+$/.test(String(result.id || "")) || result.object !== "billing_portal.session" || result.livemode !== (mode === "live") || !/^https:\/\/billing\.stripe\.com\/p\/session\/[A-Za-z0-9_]+$/.test(String(result.url || ""))) {
    const error = serviceError("stripe_portal_failed", 502);
    error.detail = String(result?.error?.code || result?.error?.type || "upstream_error").slice(0, 120);
    throw error;
  }
  return { id: String(result.id), url: String(result.url) };
}

export async function sendIrohaWaitlistReceipt(env, { email, interest, entryId }) {
  if (!String(env.RESEND_API_KEY || '').startsWith('re_')) throw serviceError('resend_api_key_missing', 503);
  const from = String(env.RESEND_FROM_EMAIL || '').trim();
  if (!from) throw serviceError('resend_from_email_missing', 503);
  await reserveEmailBudget(env, { id: `iroha-receipt:${entryId}`, recipientHash: await hashAuthValue(env.CUSTOMER_AUTH_SECRET, 'mail-recipient', email), category: 'onboarding' });
  const replyTo = 'totonoe.ai.essential@gmail.com';
  const questions = interest === 'iroha_corporate'
    ? 'このメールへの返信で、以下をお知らせください。\n・会社名\n・従業員数\n・会社所在地\n・現在のAI活用状況\n・導入済みのAIツールや取り組み\n・無料相談で話したいこと'
    : 'このメールへの返信で、学びたいこと、現在のAI活用状況、無料相談で話したいことをお知らせください。';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': `totonoe-iroha-receipt-${entryId}` },
    body: JSON.stringify({ from, to: [email], reply_to: replyTo, subject: '【ToToNoE+ IROHA】ご登録ありがとうございます', text: `IROHAのウェイトリストへご登録いただき、ありがとうございます。\n\n${questions}\n\n回答をもとにメールでやり取りし、無料相談をご案内します。\n回答先：${replyTo}\n\nこの登録だけでは契約・課金は始まりません。登録に心当たりがない場合、返信は不要です。` }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !result.id) throw serviceError('iroha_receipt_email_delivery_failed', 502);
}

export async function notifyIrohaWaitlistTeam(env, { email, interest, entryId }) {
  const destination = normalizeCustomerEmail(env.IROHA_WAITLIST_NOTIFY_EMAIL);
  if (!String(env.RESEND_API_KEY || '').startsWith('re_') || !env.RESEND_FROM_EMAIL) throw serviceError('iroha_notification_unconfigured', 503);
  await reserveEmailBudget(env, { id: `iroha-team:${entryId}`, recipientHash: await hashAuthValue(env.CUSTOMER_AUTH_SECRET, 'iroha-team-event', `${destination}:${entryId}`), category: 'onboarding' });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': `totonoe-iroha-team-${entryId}` },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [destination], reply_to: email, subject: '【IROHA】ウェイトリスト登録のお知らせ', text: `IROHAのウェイトリストに登録がありました。\n\n区分：${interest === 'iroha_corporate' ? '法人' : '個人'}\nメールアドレス：${email}\n登録ID：${entryId}\n\nこのメールに返信すると登録者へ届きます。登録は契約・課金ではありません。` }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await readJsonLimit(response);
  if (!response.ok || !result.id) throw serviceError('iroha_team_email_delivery_failed', 502);
}
