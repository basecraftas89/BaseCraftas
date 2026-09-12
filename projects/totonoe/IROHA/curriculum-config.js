window.TOTONOE_CURRICULUM = Object.freeze({
  version: 1,
  purchaseEnabled: false,
  currency: "JPY",
  plans: Object.freeze({
    weekly: Object.freeze({ monthly: 980 }),
    curriculum: Object.freeze({
      monthly: 2980,
      annual: 29800,
      annualSavingsMonths: 2,
    }),
  }),
  entryFees: Object.freeze({
    first: Object.freeze({ general: 50000, therapist: 30000 }),
    rejoin: Object.freeze({ general: 30000, therapist: 10000 }),
  }),
  campaign: Object.freeze({
    code: "trial_entry_5000",
    entryFee: 5000,
    plan: "monthly",
    audience: "therapist",
    trialDays: 30,
  }),
  apiBase: "/api/totonoe-member",
  qualificationRetentionDays: 30,
});
