import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(identifier, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-mark">R</div>
          <div>
            <p className="eyebrow">Restaurant OS</p>
            <h1 className="login-title">Owner Console</h1>
          </div>
        </div>

        <p className="login-subtitle">
          Sign in to manage your outlets, menu, staff, and reports.
        </p>

        {error && (
          <div className="login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#b91c1c" strokeWidth="1.5" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="login-field">
            <span>Email or Phone</span>
            <input
              type="text"
              autoComplete="username"
              placeholder="owner@restaurant.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="login-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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

          <button
            type="submit"
            className="login-submit primary-btn"
            disabled={loading || !identifier || !password}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="login-footer">
          Restaurant OS · Indian POS Platform
        </p>
      </div>

      {/* Right panel */}
      <div className="login-visual" aria-hidden="true">
        <div className="login-visual-inner">
          <div className="login-stat-grid">
            {[
              { label: "Today's Sales", value: "₹2,45,800" },
              { label: "Active Tables", value: "14 / 18" },
              { label: "KOTs Sent", value: "62" },
              { label: "Net Profit", value: "₹58,200" }
            ].map((s) => (
              <div key={s.label} className="login-stat-card">
                <span>{s.label}</span>
                <strong>{s.value}</strong>
              </div>
            ))}
          </div>
          <p className="login-visual-tagline">
            Full visibility. Every outlet. One console.
          </p>
        </div>
      </div>
    </div>
  );
}
