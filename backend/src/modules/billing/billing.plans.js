/**
 * billing.plans.js
 * Single source of truth for all subscription plans.
 * Razorpay plan IDs are created once via their dashboard / API
 * and stored here so code never hard-codes amounts.
 *
 * To create plans in Razorpay test dashboard:
 *   POST https://api.razorpay.com/v1/plans
 *   { "period": "monthly", "interval": 1, "item": { "name": "Starter", "amount": 99900, "currency": "INR" } }
 *
 * Set RAZORPAY_PLAN_STARTER / _PRO / _ENTERPRISE in Railway env vars
 * once you've created plans in Razorpay.
 * Until then, plan IDs are null — subscription creation will fail gracefully.
 */

const PLANS = {
  starter: {
    id:          "starter",
    name:        "Starter",
    price:       999,
    priceDisplay:"₹999 / month",
    razorpayPlanId: process.env.RAZORPAY_PLAN_STARTER || null,
    features: [
      "1 outlet",
      "POS Terminal",
      "Captain App",
      "Kitchen Display",
      "Menu & staff management",
      "Basic reports",
    ],
    highlighted: false,
  },
  pro: {
    id:          "pro",
    name:        "Pro",
    price:       1999,
    priceDisplay:"₹1,999 / month",
    razorpayPlanId: process.env.RAZORPAY_PLAN_PRO || null,
    features: [
      "Up to 3 outlets",
      "Everything in Starter",
      "Advanced reports (CSV + PDF)",
      "Inventory tracking",
      "Discount & void controls",
      "Priority support",
    ],
    highlighted: true,   // shown as recommended
  },
  enterprise: {
    id:          "enterprise",
    name:        "Enterprise",
    price:       2999,
    priceDisplay:"₹2,999 / month",
    razorpayPlanId: process.env.RAZORPAY_PLAN_ENTERPRISE || null,
    features: [
      "Unlimited outlets",
      "Everything in Pro",
      "Custom receipt branding",
      "Dedicated account manager",
      "SLA support",
      "Custom integrations",
    ],
    highlighted: false,
  },
};

const TRIAL_DAYS = 30;

module.exports = { PLANS, TRIAL_DAYS };
