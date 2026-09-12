const OTP_LENGTH = 6;
const SESSION_TOKEN_BYTES = 32;

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

export async function sendOtpWithResend(env, { email, code, challengeId }) {
  if (!String(env.RESEND_API_KEY || "").startsWith("re_")) throw serviceError("resend_api_key_missing", 503);
  const from = String(env.RESEND_FROM_EMAIL || "").trim();
  if (!from) throw serviceError("resend_from_email_missing", 503);
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

export function buildStripeCheckoutParams({ quote, env, customer, attemptId, successUrl, cancelUrl }) {
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
  if (quote.entryFeePriceEnv) {
    const entryPrice = String(env[quote.entryFeePriceEnv] || "");
    if (!/^price_[A-Za-z0-9]+$/.test(entryPrice)) throw serviceError("stripe_entry_price_missing", 503);
    params.set("line_items[1][price]", entryPrice);
    params.set("line_items[1][quantity]", "1");
  }
  if (quote.trialPeriodDays > 0) params.set("subscription_data[trial_period_days]", String(quote.trialPeriodDays));
  if (customer.stripe_customer_id) params.set("customer", customer.stripe_customer_id);
  else params.set("customer_email", customer.email);
  const metadata = {
    attempt_id: attemptId,
    customer_id: customer.id,
    plan_code: quote.planCode,
    audience_type: quote.audienceType,
    fee_type: quote.feeType,
    campaign_code: quote.campaignCode,
  };
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, String(value));
    params.set(`subscription_data[metadata][${key}]`, String(value));
  }
  return params;
}

export async function createStripeCheckoutSession(env, params, idempotencyKey) {
  const secret = String(env.STRIPE_SECRET_KEY || "");
  if (env.STRIPE_MODE !== "test" || !secret.startsWith("sk_test_")) throw serviceError("stripe_test_secret_missing", 503);
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
  if (!response.ok || !/^cs_test_[A-Za-z0-9_]+$/.test(String(result.id || "")) || !/^https:\/\/checkout\.stripe\.com\//.test(String(result.url || ""))) {
    const error = serviceError("stripe_checkout_failed", 502);
    error.detail = String(result?.error?.code || result?.error?.type || "upstream_error").slice(0, 120);
    throw error;
  }
  return { id: String(result.id), url: String(result.url), customerId: String(result.customer || "") };
}

export async function createStripePortalSession(env, { customerId, returnUrl }) {
  const secret = String(env.STRIPE_SECRET_KEY || "");
  if (env.STRIPE_MODE !== "test" || !secret.startsWith("sk_test_")) throw serviceError("stripe_test_secret_missing", 503);
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
  if (!response.ok || !/^bps_[A-Za-z0-9_]+$/.test(String(result.id || "")) || result.object !== "billing_portal.session" || result.livemode !== false || !/^https:\/\/billing\.stripe\.com\/p\/session\/test_[A-Za-z0-9_]+$/.test(String(result.url || ""))) {
    const error = serviceError("stripe_portal_failed", 502);
    error.detail = String(result?.error?.code || result?.error?.type || "upstream_error").slice(0, 120);
    throw error;
  }
  return { id: String(result.id), url: String(result.url) };
}
