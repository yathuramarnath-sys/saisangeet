import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [available, setAvailable] = useState(null); // null = checking
  const [step, setStep] = useState(1); // 1 = your details, 2 = your restaurant
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    businessName: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if signup is open
  useEffect(() => {
    api.get("/auth/signup-available")
      .then((r) => setAvailable(r.available))
      .catch(() => setAvailable(false));
  }, []);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validateStep1() {
    if (!form.fullName.trim()) return "Please enter your full name.";
    if (!form.email.trim() || !form.email.includes("@")) return "Please enter a valid email address.";
    if (!form.password || form.password.length < 6) return "Password must be at least 6 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return null;
  }

  function handleNext(e) {
    e.preventDefault();
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError("");
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.businessName.trim()) { setError("Please enter your restaurant name."); return; }
    setError("");
    setLoading(true);
    try {
      await signup({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        businessName: form.businessName.trim(),
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (available === null) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ justifyContent: "center", alignItems: "center" }}>
          <span className="login-spinner" />
        </div>
      </div>
    );
  }

  // ── Signup closed ─────────────────────────────────────────────────────────
  if (!available) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-mark">R</div>
            <div>
              <p className="eyebrow">Restaurant OS</p>
              <h1 className="login-title">Account Setup</h1>
            </div>
          </div>
          <div className="signup-closed-box">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
            <p>This platform already has an owner account.</p>
            <p className="signup-closed-sub">Ask your administrator to invite you as a staff member.</p>
          </div>
          <Link to="/login" className="signup-back-link">← Back to Sign In</Link>
        </div>
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-inner">
            <div className="login-stat-grid">
              {[
                { label: "Today's Sales", value: "₹2,45,800" },
                { label: "Active Tables", value: "14 / 18" },
                { label: "KOTs Sent", value: "62" },
                { label: "Net Profit", value: "₹58,200" },
              ].map((s) => (
                <div key={s.label} className="login-stat-card">
                  <span>{s.label}</span>
                  <strong>{s.value}</strong>
                </div>
              ))}
            </div>
            <p className="login-visual-tagline">Full visibility. Every outlet. One console.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────
  return (
    <div className="login-shell">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-mark">R</div>
          <div>
            <p className="eyebrow">Restaurant OS</p>
            <h1 className="login-title">Create Your Account</h1>
          </div>
        </div>

        {/* Step indicator */}
        <div className="signup-steps">
          <div className={`signup-step ${step >= 1 ? "active" : ""}`}>
            <span className="signup-step-dot">{step > 1 ? "✓" : "1"}</span>
            <span>Your Details</span>
          </div>
          <div className="signup-step-line" />
          <div className={`signup-step ${step >= 2 ? "active" : ""}`}>
            <span className="signup-step-dot">2</span>
            <span>Your Restaurant</span>
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#b91c1c" strokeWidth="1.5" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* ── Step 1: Your Details ── */}
        {step === 1 && (
          <form className="login-form" onSubmit={handleNext} noValidate>
            <label className="login-field">
              <span>Full Name</span>
              <input
                type="text"
                placeholder="Amarnath"
                value={form.fullName}
                onChange={set("fullName")}
                autoComplete="name"
                required
              />
            </label>

            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="owner@yourrestaurant.com"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                required
              />
            </label>

            <label className="login-field">
              <span>Phone <span className="signup-optional">(optional)</span></span>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={set("phone")}
                autoComplete="tel"
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <label className="login-field">
              <span>Confirm Password</span>
              <input
                type="password"
                placeholder="Re-enter your password"
                value={form.confirmPassword}
                onChange={set("confirmPassword")}
                autoComplete="new-password"
                required
              />
            </label>

            <button
              type="submit"
              className="login-submit primary-btn"
              disabled={!form.fullName || !form.email || !form.password || !form.confirmPassword}
            >
              Continue →
            </button>
          </form>
        )}

        {/* ── Step 2: Your Restaurant ── */}
        {step === 2 && (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="signup-greeting">
              <p>Hi <strong>{form.fullName.split(" ")[0]}</strong> 👋 — one last step.</p>
            </div>

            <label className="login-field">
              <span>Restaurant / Business Name</span>
              <input
                type="text"
                placeholder="e.g. Saisangeet Restaurant"
                value={form.businessName}
                onChange={set("businessName")}
                autoFocus
                required
              />
            </label>

            <p className="signup-hint">
              This appears on your dashboard, bills, and reports. You can change it later in Business Profile.
            </p>

            <button
              type="submit"
              className="login-submit primary-btn"
              disabled={loading || !form.businessName}
            >
              {loading ? <span className="login-spinner" /> : "Create My Account"}
            </button>

            <button
              type="button"
              className="signup-back-btn"
              onClick={() => { setStep(1); setError(""); }}
            >
              ← Back
            </button>
          </form>
        )}

        <p className="login-footer">
          Already have an account?{" "}
          <Link to="/login" className="signup-signin-link">Sign In</Link>
        </p>
      </div>

      {/* Right panel */}
      <div className="login-visual" aria-hidden="true">
        <div className="login-visual-inner">
          <div className="signup-visual-steps">
            {[
              { icon: "🏪", label: "Set up your restaurant profile" },
              { icon: "📋", label: "Build your menu in minutes" },
              { icon: "📱", label: "Connect POS, KDS & Captain apps" },
              { icon: "📊", label: "Live reports across all outlets" },
            ].map((s) => (
              <div key={s.label} className="signup-visual-step">
                <span className="signup-visual-icon">{s.icon}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <p className="login-visual-tagline">Your restaurant. Fully connected.</p>
        </div>
      </div>
    </div>
  );
}
