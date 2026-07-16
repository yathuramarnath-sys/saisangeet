/**
 * AuthCallbackPage — catches the redirect from Google OAuth.
 *
 * Flow:
 *   Google → backend /auth/google/callback
 *   → backend redirects to https://app.dinexpos.in/auth/callback#token=JWT
 *   → this page reads the fragment, stores the token, goes to dashboard
 *   (fragment is used instead of query param so the token is not sent in referrer headers)
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash   = window.location.hash.slice(1); // strip leading '#'
    const params = new URLSearchParams(hash);
    const token  = params.get("token");

    if (token) {
      localStorage.setItem("pos_token", token);
      // Hard reload so AuthContext re-initialises cleanly with the new token
      window.location.href = "/";
    } else {
      navigate("/login?error=google_error", { replace: true });
    }
  }, [navigate]);

  return (
    <div style={{
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      justifyContent:  "center",
      height:          "100vh",
      gap:             12,
      fontFamily:      "Manrope, sans-serif",
      color:           "#374151",
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #059669",
        borderTopColor: "transparent", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ fontSize: 15, fontWeight: 600 }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
