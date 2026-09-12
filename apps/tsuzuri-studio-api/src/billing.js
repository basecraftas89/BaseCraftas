const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const STRIPE_SIGNATURE_MAX_LENGTH = 4096;

export const BILLING_PLANS = Object.freeze({
  weekly_monthly: Object.freeze({
    planCode: "weekly_monthly",
    productCode: "weekly",
    billingInterval: "monthly",
    recurringAmountYen: 980,
    recurringPriceEnv: "STRIPE_PRICE_WEEKLY_MONTHLY",
    entitlementCodes: Object.freeze(["weekly_access"]),
  }),
  curriculum_monthly: Object.freeze({
    planCode: "curriculum_monthly",
    productCode: "curriculum",
    billingInterval: "monthly",
    recurringAmountYen: 2980,
    recurringPriceEnv: "STRIPE_PRICE_CURRICULUM_MONTHLY",
    entitlementCodes: Object.freeze(["curriculum_all_access", "weekly_access"]),
  }),
  curriculum_annual: Object.freeze({
    planCode: "curriculum_annual",
    productCode: "curriculum",
    billingInterval: "annual",
    recurringAmountYen: 29800,
    recurringPriceEnv: "STRIPE_PRICE_CURRICULUM_ANNUAL",
    entitlementCodes: Object.freeze(["curriculum_all_access", "weekly_access"]),
  }),
});

export const CURRICULUM_ENTRY_FEES = Object.freeze({
  "general:first": Object.freeze({ amountYen: 50000, priceEnv: "STRIPE_PRICE_ENTRY_GENERAL_FIRST" }),
  "therapist:first": Object.freeze({ amountYen: 30000, priceEnv: "STRIPE_PRICE_ENTRY_THERAPIST_FIRST" }),
  "general:rejoin": Object.freeze({ amountYen: 30000, priceEnv: "STRIPE_PRICE_ENTRY_GENERAL_REJOIN" }),
  "therapist:rejoin": Object.freeze({ amountYen: 10000, priceEnv: "STRIPE_PRICE_ENTRY_THERAPIST_REJOIN" }),
});

export const CURRICULUM_CAMPAIGNS = Object.freeze({
  trial_entry_5000: Object.freeze({
    campaignCode: "trial_entry_5000",
    allowedPlanCodes: Object.freeze(["curriculum_monthly"]),
    allowedFeeTypes: Object.freeze(["first"]),
    allowedAudienceTypes: Object.freeze(["therapist"]),
    entryFeeAmountYen: 5000,
    entryFeePriceEnv: "STRIPE_PRICE_ENTRY_CAMPAIGN_TRIAL",
    trialPeriodDays: 30,
  }),
});

function billingError(code) {
  return Object.assign(new Error(code), { code, status: 400 });
}

export function resolveBillingQuote({ planCode, audienceType = "general", feeType = "none", campaignCode = "none" } = {}) {
  const plan = BILLING_PLANS[String(planCode || "")];
  if (!plan) throw billingError("invalid_plan");
  if (!["general", "therapist"].includes(audienceType)) throw billingError("invalid_audience");
  if (!["none", "first", "rejoin"].includes(feeType)) throw billingError("invalid_fee_type");
  const normalizedCampaignCode = String(campaignCode || "none");
  const campaign = normalizedCampaignCode === "none" ? null : CURRICULUM_CAMPAIGNS[normalizedCampaignCode];
  if (normalizedCampaignCode !== "none" && !campaign) throw billingError("invalid_campaign");

  if (plan.productCode === "weekly") {
    if (feeType !== "none") throw billingError("weekly_has_no_entry_fee");
    if (campaign) throw billingError("weekly_campaign_not_allowed");
    return Object.freeze({
      ...plan,
      audienceType,
      feeType: "none",
      entryFeeAmountYen: 0,
      entryFeePriceEnv: null,
      firstChargeAmountYen: plan.recurringAmountYen,
      campaignCode: "none",
      trialPeriodDays: 0,
      currency: "jpy",
    });
  }

  if (feeType === "none") throw billingError("curriculum_fee_required");
  if (campaign && (!campaign.allowedPlanCodes.includes(plan.planCode) || !campaign.allowedFeeTypes.includes(feeType) || !campaign.allowedAudienceTypes.includes(audienceType))) {
    throw billingError("campaign_not_applicable");
  }
  const entryFee = campaign
    ? { amountYen: campaign.entryFeeAmountYen, priceEnv: campaign.entryFeePriceEnv }
    : CURRICULUM_ENTRY_FEES[`${audienceType}:${feeType}`];
  if (!entryFee) throw billingError("invalid_entry_fee");
  const trialPeriodDays = campaign?.trialPeriodDays || (feeType === "first" ? 30 : 0);
  return Object.freeze({
    ...plan,
    audienceType,
    feeType,
    entryFeeAmountYen: entryFee.amountYen,
    entryFeePriceEnv: entryFee.priceEnv,
    firstChargeAmountYen: entryFee.amountYen + (trialPeriodDays ? 0 : plan.recurringAmountYen),
    campaignCode: campaign?.campaignCode || "none",
    trialPeriodDays,
    currency: "jpy",
  });
}

export function assertStripeTestConfiguration(env) {
  if (env.STRIPE_MODE !== "test") throw Object.assign(new Error("stripe_test_mode_required"), { status: 503 });
  if (!String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")) {
    throw Object.assign(new Error("stripe_test_secret_missing"), { status: 503 });
  }
  if (!String(env.STRIPE_WEBHOOK_SECRET || "").startsWith("whsec_")) {
    throw Object.assign(new Error("stripe_webhook_secret_missing"), { status: 503 });
  }
}

function parseSignatureHeader(header) {
  const value = String(header || "");
  if (!value || value.length > STRIPE_SIGNATURE_MAX_LENGTH) throw billingError("invalid_stripe_signature");
  const parts = new Map();
  for (const pair of value.split(",")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const key = pair.slice(0, separator).trim();
    const item = pair.slice(separator + 1).trim();
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(item);
  }
  const timestampText = parts.get("t")?.[0] || "";
  const timestamp = Number(timestampText);
  const signatures = (parts.get("v1") || []).filter((item) => /^[a-f0-9]{64}$/i.test(item));
  if (!/^\d{10,13}$/.test(timestampText) || !Number.isSafeInteger(timestamp) || !signatures.length) {
    throw billingError("invalid_stripe_signature");
  }
  return { timestamp, signatures };
}

function hexBytes(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function constantTimeEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  if (typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(left, right);
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyStripeWebhook(rawBody, signatureHeader, secret, options = {}) {
  if (typeof rawBody !== "string") throw billingError("stripe_raw_body_required");
  const webhookSecret = String(secret || "");
  if (!webhookSecret.startsWith("whsec_")) throw billingError("stripe_webhook_secret_missing");
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  const nowSeconds = Number.isSafeInteger(options.nowSeconds) ? options.nowSeconds : Math.floor(Date.now() / 1000);
  const toleranceSeconds = Number.isSafeInteger(options.toleranceSeconds) ? options.toleranceSeconds : STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) throw billingError("stale_stripe_signature");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  if (!signatures.some((candidate) => constantTimeEqual(expected, hexBytes(candidate)))) {
    throw billingError("invalid_stripe_signature");
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_error) {
    throw billingError("invalid_stripe_event");
  }
  if (!/^evt_[A-Za-z0-9_]+$/.test(String(event?.id || "")) || event?.object !== "event" || typeof event?.type !== "string" || typeof event?.livemode !== "boolean") {
    throw billingError("invalid_stripe_event");
  }
  return { event, timestamp };
}
