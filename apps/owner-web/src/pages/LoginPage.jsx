import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { detectSubdomain, resolveSubdomain } from "../lib/subdomain";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const [restaurantInfo, setRestaurantInfo] = useState(null);
  useEffect(() => {
    const slug = detectSubdomain();
    if (!slug) return;
    resolveSubdomain(slug).then(info => {
      if (info?.restaurantName) setRestaurantInfo(info);
    });
  }, []);

  const [identifier, setIdentifier]   = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading]         = useState(false);

  const [canShowGoogle] = useState(
    () => localStorage.getItem("plato_pwd_login_done") === "1"
  );

  const searchParams = new URLSearchParams(window.location.search);
  const googleError  = searchParams.get("error");
  const [error, setError] = useState(
    googleError === "google_cancelled" ? "" :
    googleError ? "Google sign-in failed. Please try again or use your password." : ""
  );

  async function handleSignIn(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
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
    <div className="oc-auth-shell">
      {/* Logo above card */}
      <div className="oc-auth-logo">
        <div className="oc-auth-logo-chip">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1C1C" strokeWidth="2" strokeLinecap="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
          </svg>
        </div>
        <div className="oc-auth-logo-text">
          <span className="oc-auth-logo-brand">Plato</span>
          <span className="oc-auth-logo-caption">Owner Console</span>
        </div>
      </div>

      {/* Restaurant branding banner */}
      {restaurantInfo && (
        <div className="oc-auth-restaurant-banner">
          <span>🍽️</span>
          <div>
            <p className="oc-auth-restaurant-name">{restaurantInfo.restaurantName}</p>
            <p className="oc-auth-restaurant-sub">Owner Portal</p>
          </div>
        </div>
      )}

      {/* Card */}
      <div className="oc-auth-card">
        <h1 className="oc-auth-title">
          {restaurantInfo ? `Sign in to ${restaurantInfo.restaurantName}` : "Sign in to your console"}
        </h1>
        <p className="oc-auth-sub">
          Manage your outlets, menu, staff and reports — all in one place.
        </p>

        {error && <div className="oc-auth-error">{error}</div>}

        <form onSubmit={handleSignIn} noValidate>
          <div className="oc-auth-field">
            <label className="oc-auth-label">Email or phone</label>
            <input
              className="oc-auth-input"
              type="text"
              autoComplete="username"
              placeholder="owner@cafeamudham.com"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="oc-auth-field">
            <div className="oc-auth-label-row">
              <label className="oc-auth-label">Password</label>
              <Link to="/forgot-password" className="oc-auth-link">Forgot password?</Link>
            </div>
            <div className="oc-auth-pw-wrap">
              <input
                className="oc-auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="oc-auth-eye"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
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

          <label className="oc-auth-checkbox-row">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={e => setKeepSignedIn(e.target.checked)}
            />
            <span>Keep me signed in on this device</span>
          </label>

          <button type="submit" className="oc-auth-btn" disabled={loading || !identifier.trim() || !password}>
            {loading ? <span className="oc-auth-spinner" /> : "Sign in"}
          </button>
        </form>

        {canShowGoogle && (
          <>
            <div className="oc-auth-divider"><span>or</span></div>
            <a href={`${API_BASE}/auth/google`} className="oc-auth-google-btn">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Sign in with Google
            </a>
          </>
        )}
      </div>

      <p className="oc-auth-footer">Powered by DinexPOS · app.dinexpos.in</p>
    </div>
  );
}
