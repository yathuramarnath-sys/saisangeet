import { useEffect, useState } from "react";
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
      <div className="lp2-shell">
        <div className="lp2-topbar">
          <div className="lp2-brand">
            <div className="lp2-brand-mark">D</div>
            <span>Plato</span>
          </div>
        </div>
        <div className="lp2-card">
          <div className="fpw-sent-icon">📬</div>
          <h1 className="lp2-heading" style={{ marginTop: 8 }}>Check your email</h1>
          <p className="lp2-sub" style={{ marginBottom: 24 }}>
            If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
            The link expires in <strong>1 hour</strong>.
          </p>
          <p className="lp2-sub" style={{ fontSize: 13, color: "#8A91A8" }}>
            Didn't get an email? Check your spam folder, or{" "}
            <button
              className="lp2-forgot-link"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              onClick={() => setSent(false)}
            >
              try again
            </button>.
          </p>
          <Link to="/login" className="lp2-btn" style={{ display: "block", textAlign: "center", marginTop: 24, textDecoration: "none" }}>
            Back to Sign In
          </Link>
        </div>
        <p className="lp2-footer">© 2026 Plato · Restaurant Intelligence Platform</p>
      </div>
    );
  }

  return (
    <div className="lp2-shell">
      <div className="lp2-topbar">
        <div className="lp2-brand">
          <div className="lp2-brand-mark">D</div>
          <span>Plato</span>
        </div>
      </div>
      <div className="lp2-card">
        <h1 className="lp2-heading">Forgot password?</h1>
        <p className="lp2-sub">Enter your registered email and we'll send you a reset link.</p>

        {error && <div className="lp2-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="lp2-field-wrap">
            <input
              className="lp2-input"
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            className="lp2-btn"
            disabled={busy || !email.trim()}
          >
            {busy ? <span className="lp2-spinner" /> : "Send Reset Link"}
          </button>
        </form>

        <div className="lp2-forgot-wrap">
          <Link to="/login" className="lp2-forgot-link">← Back to Sign In</Link>
        </div>
      </div>
      <p className="lp2-footer">© 2026 Plato · Restaurant Intelligence Platform</p>
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
    if (password.length < 6)       return setError("Password must be at least 6 characters.");
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
      <div className="lp2-shell">
        <div className="lp2-topbar">
          <div className="lp2-brand">
            <div className="lp2-brand-mark">D</div>
            <span>Plato</span>
          </div>
        </div>
        <div className="lp2-card">
          <div className="fpw-sent-icon">✅</div>
          <h1 className="lp2-heading" style={{ marginTop: 8 }}>Password updated!</h1>
          <p className="lp2-sub" style={{ marginBottom: 24 }}>
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <Link to="/login" className="lp2-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Sign In
          </Link>
        </div>
        <p className="lp2-footer">© 2026 Plato · Restaurant Intelligence Platform</p>
      </div>
    );
  }

  return (
    <div className="lp2-shell">
      <div className="lp2-topbar">
        <div className="lp2-brand">
          <div className="lp2-brand-mark">D</div>
          <span>Plato</span>
        </div>
      </div>
      <div className="lp2-card">
        <h1 className="lp2-heading">Set new password</h1>
        <p className="lp2-sub">Choose a strong password — at least 6 characters.</p>

        {error && <div className="lp2-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="lp2-field-wrap lp2-pw-wrap">
            <input
              className="lp2-input"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button
              type="button"
              className="lp2-eye"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <div className="lp2-field-wrap" style={{ marginTop: 12 }}>
            <input
              className="lp2-input"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="lp2-btn"
            disabled={busy || !password || !confirm}
          >
            {busy ? <span className="lp2-spinner" /> : "Update Password"}
          </button>
        </form>
      </div>
      <p className="lp2-footer">© 2026 Plato · Restaurant Intelligence Platform</p>
    </div>
  );
}

// ── Router: decide which form to show based on ?token= param ─────────────────
export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  return token ? <ResetPasswordForm token={token} /> : <RequestResetForm />;
}
