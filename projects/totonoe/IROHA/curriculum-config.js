window.TOTONOE_CURRICULUM = Object.freeze({
  version: 1,
  purchaseEnabled: false,
  currency: "JPY",
  plans: Object.freeze({
    weekly: Object.freeze({ monthly: Object.freeze({ general: 1480, therapist: 980 }) }),
    curriculum: Object.freeze({
      monthly: 2980,
      annual: 29800,
      annualSavingsMonths: 2,
    }),
  }),
  entryFees: Object.freeze({
    first: Object.freeze({ general: 48000, therapist: 4800 }),
    rejoin: Object.freeze({ general: 28000, therapist: 9800 }),
  }),
  campaign: null,
  apiBase: "/api/totonoe-member",
  qualificationRetentionDays: 30,
});
