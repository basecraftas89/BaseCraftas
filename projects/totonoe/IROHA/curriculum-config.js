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
    first: 9800,
    rejoin: 4800,
  }),
  campaign: null,
  apiBase: "/api/totonoe-member",
});
