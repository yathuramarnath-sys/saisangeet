import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

// ── Step 1: Request Reset Email ───────────────────────────────────────────────
function RequestResetForm() {
  const [email,   setEmail]   = useState("");
  const [busy,    setBusy]    = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      // Only show network-level errors; don't reveal whether email exists
      const msg = err.message || "";
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setError("Network error — please check your connection and try again.");
      } else {
        // Treat any server error the same as success (anti-enumeration)
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="oc-auth-shell">
        <div className="oc-auth-logo">
          <div className="oc-auth-logo-chip">
            <span className="material-symbols-rounded"
              style={{ fontSize: 22, color: "#1C1C1C", fontVariationSettings: "'FILL' 1" }}>
              restaurant
            </span>
          </div>
          <div className="oc-auth-logo-text">
            <span className="oc-auth-logo-brand">Plato</span>
            <span className="oc-auth-logo-caption">Owner Console</span>
          </div>
        </div>

        <div className="oc-auth-card">
          <div className="oc-auth-sent-icon">📬</div>
          <h1 className="oc-auth-title" style={{ marginTop: 8 }}>Check your email</h1>
          <p className="oc-auth-sub">
            If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
            The link expires in <strong>1 hour</strong>.
          </p>
          <p className="oc-auth-sub" style={{ fontSize: 13, marginTop: 12 }}>
            Didn't get an email? Check your spam folder, or{" "}
            <button
              className="oc-auth-link"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
              onClick={() => setSent(false)}
            >
              try again
            </button>.
          </p>
          <Link to="/login" className="oc-auth-btn"
            style={{ display: "block", textAlign: "center", marginTop: 24, textDecoration: "none" }}>
            Back to Sign In
          </Link>
        </div>

        <p className="oc-auth-footer">Powered by DinexPOS · app.dinexpos.in</p>
      </div>
    );
  }

  return (
    <div className="oc-auth-shell">
      <div className="oc-auth-logo">
        <div className="oc-auth-logo-chip">
          <span className="material-symbols-rounded"
            style={{ fontSize: 22, color: "#1C1C1C", fontVariationSettings: "'FILL' 1" }}>
            restaurant
          </span>
        </div>
        <div className="oc-auth-logo-text">
          <span className="oc-auth-logo-brand">Plato</span>
          <span className="oc-auth-logo-caption">Owner Console</span>
        </div>
      </div>

      <div className="oc-auth-card">
        <h1 className="oc-auth-title">Forgot password?</h1>
        <p className="oc-auth-sub">Enter your registered email and we'll send you a reset link.</p>

        {error && <div className="oc-auth-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="oc-auth-field">
            <label className="oc-auth-label">Email address</label>
            <input
              className="oc-auth-input"
              type="email"
              autoComplete="email"
              placeholder="owner@cafeamudham.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>

          <button type="submit" className="oc-auth-btn" disabled={busy || !email.trim()}>
            {busy ? <span className="oc-auth-spinner" /> : "Send Reset Link"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/login" className="oc-auth-link">← Back to Sign In</Link>
        </div>
      </div>

      <p className="oc-auth-footer">Powered by DinexPOS · app.dinexpos.in</p>
    </div>
  );
}

// ── Step 2: Set New Password (arrived via email link with ?token=...) ─────────
function ResetPasswordForm({ token }) {
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [show,      setShow]      = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8)       return setError("New password must be at least 8 characters.");
    if (password !== confirm)      return setError("Passwords do not match.");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please request a new reset link.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="oc-auth-shell">
        <div className="oc-auth-logo">
          <div className="oc-auth-logo-chip">
            <span className="material-symbols-rounded"
              style={{ fontSize: 22, color: "#1C1C1C", fontVariationSettings: "'FILL' 1" }}>
              restaurant
            </span>
          </div>
          <div className="oc-auth-logo-text">
            <span className="oc-auth-logo-brand">Plato</span>
            <span className="oc-auth-logo-caption">Owner Console</span>
          </div>
        </div>

        <div className="oc-auth-card">
          <div className="oc-auth-sent-icon">✅</div>
          <h1 className="oc-auth-title" style={{ marginTop: 8 }}>Password updated!</h1>
          <p className="oc-auth-sub">
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <Link to="/login" className="oc-auth-btn"
            style={{ display: "block", textAlign: "center", marginTop: 24, textDecoration: "none" }}>
            Sign In
          </Link>
        </div>

        <p className="oc-auth-footer">Powered by DinexPOS · app.dinexpos.in</p>
      </div>
    );
  }

  return (
    <div className="oc-auth-shell">
      <div className="oc-auth-logo">
        <div className="oc-auth-logo-chip">
          <span className="material-symbols-rounded"
            style={{ fontSize: 22, color: "#1C1C1C", fontVariationSettings: "'FILL' 1" }}>
            restaurant
          </span>
        </div>
        <div className="oc-auth-logo-text">
          <span className="oc-auth-logo-brand">Plato</span>
          <span className="oc-auth-logo-caption">Owner Console</span>
        </div>
      </div>

      <div className="oc-auth-card">
        <h1 className="oc-auth-title">Set new password</h1>
        <p className="oc-auth-sub">Choose a strong password — at least 8 characters.</p>

        {error && <div className="oc-auth-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="oc-auth-field">
            <label className="oc-auth-label">New password</label>
            <div className="oc-auth-pw-wrap">
              <input
                className="oc-auth-input"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoFocus
                required
              />
              <button
                type="button"
                className="oc-auth-eye"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {show ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="oc-auth-field">
            <label className="oc-auth-label">Confirm new password</label>
            <input
              className="oc-auth-input"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              required
            />
          </div>

          <button type="submit" className="oc-auth-btn" disabled={busy || !password || !confirm}>
            {busy ? <span className="oc-auth-spinner" /> : "Update Password"}
          </button>
        </form>
      </div>

      <p className="oc-auth-footer">Powered by DinexPOS · app.dinexpos.in</p>
    </div>
  );
}

// ── Router: decide which form to show based on ?token= param ─────────────────
export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  return token ? <ResetPasswordForm token={token} /> : <RequestResetForm />;
}
