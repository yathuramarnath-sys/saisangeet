import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Already logged in — go straight to dashboard
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  // step: "identifier" | "password"
  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleContinue(e) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError("");
    setStep("password");
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lp2-shell">

      {/* Brand bar */}
      <div className="lp2-topbar">
        <div className="lp2-brand">
          <div className="lp2-brand-mark">D</div>
          <span>DineXPOS</span>
        </div>
      </div>

      {/* Card */}
      <div className="lp2-card">

        {step === "identifier" ? (
          <form onSubmit={handleContinue} noValidate>
            <h1 className="lp2-heading">Sign in</h1>
            <p className="lp2-sub">Enter your email or phone number</p>

            {error && <div className="lp2-error">{error}</div>}

            <div className="lp2-field-wrap">
              <input
                className="lp2-input"
                type="text"
                autoComplete="username"
                placeholder="Email or phone number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="lp2-btn"
              disabled={!identifier.trim()}
            >
              Continue
            </button>
          </form>

        ) : (
          <form onSubmit={handleSignIn} noValidate>
            <h1 className="lp2-heading">Enter your password</h1>

            {/* Show identifier with edit option */}
            <button
              type="button"
              className="lp2-id-pill"
              onClick={() => { setStep("identifier"); setPassword(""); setError(""); }}
            >
              <span className="lp2-id-text">{identifier}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            {error && <div className="lp2-error">{error}</div>}

            <div className="lp2-field-wrap lp2-pw-wrap">
              <input
                className="lp2-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                className="lp2-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
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

            <button
              type="submit"
              className="lp2-btn"
              disabled={loading || !password}
            >
              {loading ? <span className="lp2-spinner" /> : "Sign In"}
            </button>

            <div className="lp2-forgot-wrap">
              <Link to="/forgot-password" className="lp2-forgot-link">
                Forgot password?
              </Link>
            </div>
          </form>
        )}

      </div>

      <p className="lp2-footer">
        © 2026 DineXPOS · Restaurant OS for India 🇮🇳
      </p>
    </div>
  );
}
