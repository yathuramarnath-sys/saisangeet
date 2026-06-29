import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { detectSubdomain, resolveSubdomain } from "../lib/subdomain";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Already logged in — go straight to dashboard
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  // Subdomain branding (e.g. tajhotel.dinexpos.in → show "Taj Hotel" on login page)
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  useEffect(() => {
    const slug = detectSubdomain();
    if (!slug) return;
    resolveSubdomain(slug).then((info) => {
      if (info?.restaurantName) setRestaurantInfo(info);
    });
  }, []);

  // step: "identifier" | "password"
  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Google sign-in only ever works for accounts that already exist (it never
  // creates one) — so we hide it until this device has completed at least
  // one successful password login, to avoid new users hitting GOOGLE_NOT_REGISTERED.
  const [canShowGoogle] = useState(
    () => localStorage.getItem("plato_pwd_login_done") === "1"
  );

  // Show error from Google callback redirect (?error=...)
  const searchParams = new URLSearchParams(window.location.search);
  const googleError  = searchParams.get("error");
  const [error, setError] = useState(
    googleError === "google_cancelled" ? "" :
    googleError ? "Google sign-in failed. Please try again or use your password." : ""
  );

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
      localStorage.setItem("plato_pwd_login_done", "1");
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
        <div className="lp2-brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/favicon.svg" width="40" height="40" alt="Plato" style={{ borderRadius: 6 }} />
          <span>Plato</span>
        </div>
      </div>

      {/* Restaurant branding banner — shown when accessing via custom subdomain */}
      {restaurantInfo && (
        <div className="lp2-restaurant-banner">
          <span className="lp2-restaurant-icon">🍽️</span>
          <div>
            <p className="lp2-restaurant-name">{restaurantInfo.restaurantName}</p>
            <p className="lp2-restaurant-sub">Owner Portal</p>
          </div>
        </div>
      )}

      {/* Card */}
      <div className="lp2-card">

        {/* ── Google Sign-In — only shown once this device has logged in with a password before ── */}
        {canShowGoogle && (
          <>
            <a
              href={`${API_BASE.replace("/api/v1", "")}/auth/google`}
              className="lp2-google-btn"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Sign in with Google
            </a>

            <div className="lp2-divider">
              <span>or sign in with password</span>
            </div>
          </>
        )}

        {step === "identifier" ? (
          <form onSubmit={handleContinue} noValidate>
            <h1 className="lp2-heading">
              {restaurantInfo ? `Sign in to ${restaurantInfo.restaurantName}` : "Sign in"}
            </h1>
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
        © 2026 Plato · Restaurant Intelligence Platform
      </p>
    </div>
  );
}
