/**
 * BillingPage — Subscription & Plan Management
 *
 * Shows:
 *   1. Current plan status banner (trial / active / past_due / cancelled)
 *   2. Plan cards (Starter / Pro / Enterprise) with Subscribe button
 *   3. Cancel button for active subscriptions
 *
 * On "Subscribe": calls backend → gets Razorpay shortUrl → redirects to hosted checkout.
 * On return from Razorpay: status refetches and updates automatically.
 */

import { useState, useEffect } from "react";
import { api } from "../../lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────

function StatusBanner({ billing }) {
  if (!billing) return null;

  if (billing.isTrialing) {
    return (
      <div className="bill-banner bill-banner-trial">
        <span className="bill-banner-icon">🎁</span>
        <div>
          <strong>Free Trial Active</strong>
          <p>
            {billing.trialDaysLeft} day{billing.trialDaysLeft !== 1 ? "s" : ""} remaining.
            Subscribe to a plan before your trial ends to keep access.
          </p>
        </div>
      </div>
    );
  }

  if (billing.isActive) {
    return (
      <div className="bill-banner bill-banner-active">
        <span className="bill-banner-icon">✅</span>
        <div>
          <strong>{billing.planName} — Active</strong>
          {billing.currentPeriodEnd && (
            <p>Next billing date: {new Date(billing.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          )}
        </div>
      </div>
    );
  }

  if (billing.isPastDue) {
    return (
      <div className="bill-banner bill-banner-warn">
        <span className="bill-banner-icon">⚠️</span>
        <div>
          <strong>Payment Failed</strong>
          <p>Your last payment could not be collected. Please update your payment method in Razorpay to avoid service interruption.</p>
        </div>
      </div>
    );
  }

  if (billing.isCancelled) {
    return (
      <div className="bill-banner bill-banner-error">
        <span className="bill-banner-icon">❌</span>
        <div>
          <strong>Subscription Cancelled</strong>
          <p>Your access has ended. Subscribe to a plan below to resume.</p>
        </div>
      </div>
    );
  }

  if (billing.isExpired) {
    return (
      <div className="bill-banner bill-banner-error">
        <span className="bill-banner-icon">⏰</span>
        <div>
          <strong>Free Trial Expired</strong>
          <p>Your 30-day trial has ended. Subscribe to a plan below to restore access.</p>
        </div>
      </div>
    );
  }

  return null;
}

function PlanCard({ plan, currentPlanId, onSubscribe, subscribing }) {
  const isCurrent = plan.id === currentPlanId;
  const isLoading = subscribing === plan.id;

  return (
    <div className={`bill-plan-card${plan.highlighted ? " bill-plan-highlighted" : ""}${isCurrent ? " bill-plan-current" : ""}`}>
      {plan.highlighted && <div className="bill-plan-badge">⭐ Most Popular</div>}
      {isCurrent      && <div className="bill-plan-badge bill-plan-badge-current">Your Plan</div>}

      <div className="bill-plan-header">
        <strong className="bill-plan-name">{plan.name}</strong>
        <div className="bill-plan-price">
          <span className="bill-plan-amount">{plan.priceDisplay}</span>
        </div>
      </div>

      <ul className="bill-plan-features">
        {plan.features.map((f, i) => (
          <li key={i}>
            <span className="bill-feat-check">✓</span> {f}
          </li>
        ))}
      </ul>

      <button
        className={`bill-subscribe-btn${plan.highlighted ? " primary" : ""}`}
        onClick={() => onSubscribe(plan.id)}
        disabled={isCurrent || isLoading}
      >
        {isLoading
          ? "Opening checkout…"
          : isCurrent
            ? "Current Plan"
            : "Subscribe"}
      </button>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function BillingPage() {
  const [billing,     setBilling]     = useState(null);
  const [plans,       setPlans]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [subscribing, setSubscribing] = useState(null);  // planId being subscribed
  const [cancelling,  setCancelling]  = useState(false);
  const [error,       setError]       = useState("");
  const [cancelDone,  setCancelDone]  = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/billing/status"),
      api.get("/billing/plans"),
    ])
      .then(([statusRes, plansRes]) => {
        setBilling(statusRes);
        setPlans(plansRes.plans || []);
      })
      .catch((err) => setError("Could not load billing info: " + err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(planId) {
    setError("");
    setSubscribing(planId);
    try {
      const res = await api.post("/billing/subscribe", { planId });
      if (res.shortUrl) {
        // Open Razorpay hosted checkout page
        window.open(res.shortUrl, "_blank");
      } else {
        setError("Could not get checkout link. Please try again.");
      }
    } catch (err) {
      setError(err.message || "Subscription failed. Please try again.");
    } finally {
      setSubscribing(null);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel your subscription? You will retain access until the end of your current billing period.")) return;
    setCancelling(true);
    setError("");
    try {
      await api.post("/billing/cancel", {});
      setCancelDone(true);
      setBilling(prev => prev ? { ...prev, status: "cancelled", isCancelled: true, isActive: false } : prev);
    } catch (err) {
      setError(err.message || "Could not cancel subscription. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Billing &amp; Subscription</h2>
        </div>
      </header>

      <div className="bill-page">

        {loading ? (
          <div className="bill-loading">
            <span className="dash-spinner" />
            <p>Loading billing info…</p>
          </div>
        ) : (
          <>
            {/* ── Status banner ─────────────────────────────────────── */}
            <StatusBanner billing={billing} />

            {error && (
              <div className="bill-error">{error}</div>
            )}

            {cancelDone && (
              <div className="bill-success">
                Subscription cancelled. You retain access until the end of this billing period.
              </div>
            )}

            {/* ── Plans ─────────────────────────────────────────────── */}
            <div className="bill-section-head">
              <h3>Choose a Plan</h3>
              <p>All plans include a 30-day free trial for new accounts. No credit card required to start.</p>
            </div>

            <div className="bill-plans-grid">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={billing?.planId}
                  onSubscribe={handleSubscribe}
                  subscribing={subscribing}
                />
              ))}
            </div>

            {/* ── Cancel option ─────────────────────────────────────── */}
            {billing?.isActive && !cancelDone && (
              <div className="bill-cancel-section">
                <p>Want to cancel? Your access continues until the end of the current billing period.</p>
                <button
                  className="bill-cancel-btn"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling…" : "Cancel Subscription"}
                </button>
              </div>
            )}

            {/* ── Razorpay note ──────────────────────────────────────── */}
            <div className="bill-footer-note">
              <span>🔒 Payments secured by</span>
              <strong> Razorpay</strong>
              <span> · Supports UPI AutoPay, Credit / Debit Card, Net Banking</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
