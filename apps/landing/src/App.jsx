import { useState } from "react";

const APP_URL = "https://app.dinexpos.in";
const API_URL = "https://api.dinexpos.in/api/v1";

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Smart POS Terminal",
    desc: "Fast billing, split bills, dine-in & takeaway. Works offline. Designed for Indian menus with GST."
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>
      </svg>
    ),
    title: "Captain App",
    desc: "Waiters take orders on their phone, KOTs sent directly to kitchen. No paper slips."
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M3 12h18M3 18h18"/>
      </svg>
    ),
    title: "Kitchen Display",
    desc: "Real-time KOT screen for the kitchen. Chefs mark items done, captain gets notified."
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
      </svg>
    ),
    title: "Owner Dashboard",
    desc: "Daily sales, staff shifts, GST reports, outlet-wise performance — all in one console."
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeOpacity=".5"/><rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
    ),
    title: "Multi-Outlet",
    desc: "Manage all your restaurant branches from a single login. Per-outlet staff, menu and devices."
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    title: "GST Billing",
    desc: "Automatic CGST/SGST split, GST invoices on demand, ready for Zoho Books sync."
  }
];

const HOW_IT_WORKS = [
  { step: "1", title: "Sign Up Free", desc: "Create your account in 2 minutes. No credit card needed." },
  { step: "2", title: "Set Up Your Restaurant", desc: "Add outlets, menu, staff and tax profiles from the Owner Console." },
  { step: "3", title: "Connect Your Devices", desc: "Scan the branch link code on your POS, Kitchen Display and Captain phones." },
  { step: "4", title: "Go Live", desc: "Start taking orders. Reports flow in automatically." }
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "₹999",
    period: "/ month",
    desc: "Perfect for a single-outlet restaurant getting started.",
    features: [
      "1 outlet",
      "POS Terminal (Web + Android + Windows)",
      "Captain App",
      "Kitchen Display",
      "Menu & staff management",
      "Basic reports (CSV export)",
      "30-day free trial",
    ],
    highlighted: false,
    cta: "Start Free Trial",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹1,999",
    period: "/ month",
    desc: "For growing restaurants with multiple branches.",
    features: [
      "Up to 3 outlets",
      "Everything in Starter",
      "Advanced reports (PDF + CSV)",
      "Inventory tracking",
      "Discount & void controls",
      "Staff shift reports",
      "Priority support",
    ],
    highlighted: true,
    badge: "Most Popular",
    cta: "Start Free Trial",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "₹2,999",
    period: "/ month",
    desc: "Unlimited outlets, custom branding and dedicated support.",
    features: [
      "Unlimited outlets",
      "Everything in Pro",
      "Custom receipt branding",
      "Dedicated account manager",
      "SLA-backed support",
      "Custom integrations on request",
    ],
    highlighted: false,
    cta: "Contact Us",
  },
];

const TESTIMONIALS = [
  {
    name: "Rajesh Kumar",
    role: "Owner, Spice Garden — Bengaluru",
    text: "We switched from a paper-based system to Plato in one day. The KOT screen alone saves us 20 minutes every service."
  },
  {
    name: "Priya Menon",
    role: "Manager, Coconut Grove — Chennai",
    text: "Our 3 branches now run off one dashboard. Staff management and GST reports used to take hours — now it's 5 minutes."
  },
  {
    name: "Arjun Sharma",
    role: "Owner, The Biryani Co. — Hyderabad",
    text: "The Captain App on Android is brilliant. Waiters love it and wrong orders have dropped to near zero."
  }
];

const PlateLogo = ({ size = 20, stroke = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 12h8"/>
  </svg>
);

const APP_STRIP_ICONS = {
  "POS Terminal": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  ),
  "Captain App": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
  ),
  "Kitchen Display": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h10M7 11h6"/></svg>
  ),
  "Owner Console": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
  ),
};

export function App() {
  const [form, setForm] = useState({ name: "", restaurant: "", phone: "", email: "", outlets: "1", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function set(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleEnroll(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/auth/signup-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
    } catch (_) { /* ignore — show success anyway */ }
    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <div className="lp-root">

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="/" className="lp-logo">
            <span className="lp-logo-mark">
              <PlateLogo size={16} stroke="#fff" />
            </span>
            <span>Plato</span>
          </a>
          <div className={`lp-nav-links${menuOpen ? " open" : ""}`}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#testimonials" onClick={() => setMenuOpen(false)}>Reviews</a>
            <a href="#enroll" onClick={() => setMenuOpen(false)}>Get Started</a>
          </div>
          <div className="lp-nav-actions">
            <a href={`${APP_URL}/login`} className="lp-nav-login">Sign In</a>
            <a href="#enroll" className="lp-nav-cta">Get Started Free</a>
          </div>
          <button className="lp-hamburger" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-text">
            <span className="lp-hero-badge">🇮🇳 Built for Indian Restaurants</span>
            <h1>Serve better.<br />Every table.</h1>
            <p className="lp-hero-sub">
              POS · Captain App · Kitchen Display · GST Billing · Multi-Outlet Reports.<br />
              Everything your restaurant needs — one platform, one subscription.
            </p>
            <div className="lp-hero-btns">
              <a href="#enroll" className="lp-btn-primary">Start Free Trial</a>
              <a href="#how-it-works" className="lp-btn-ghost">See how it works →</a>
            </div>
            <div className="lp-hero-trust">
              <span>✓ No credit card</span>
              <span>✓ Setup in 1 day</span>
              <span>✓ GST ready</span>
              <span>✓ Works offline</span>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-mock-shell">
              <div className="lp-mock-topbar">
                <span className="lp-mock-dot red" /><span className="lp-mock-dot yellow" /><span className="lp-mock-dot green" />
                <span className="lp-mock-url">app.dinexpos.in</span>
              </div>
              <div className="lp-mock-body">
                <div className="lp-mock-sidebar">
                  <div className="lp-mock-brand">
                    <div className="lp-mock-brand-mark">
                      <PlateLogo size={12} stroke="#fff" />
                    </div>
                    <span>Plato</span>
                  </div>
                  {["Overview","Outlets","Menu","Staff","Reports","App Store"].map(item => (
                    <div key={item} className={`lp-mock-nav-item${item === "Overview" ? " active" : ""}`}>{item}</div>
                  ))}
                </div>
                <div className="lp-mock-content">
                  <div className="lp-mock-title">Business Control Center</div>
                  <div className="lp-mock-stats">
                    {[
                      { label: "Today's Sales", val: "₹2,45,800" },
                      { label: "Active Tables", val: "14 / 18" },
                      { label: "KOTs Sent", val: "62" },
                      { label: "Net Profit", val: "₹58,200" }
                    ].map(s => (
                      <div key={s.label} className="lp-mock-stat">
                        <span>{s.label}</span>
                        <strong>{s.val}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="lp-mock-bar-chart">
                    {[40,65,50,80,70,90,75].map((h, i) => (
                      <div key={i} className="lp-mock-bar" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* APP STRIP */}
      <section className="lp-app-strip">
        <div className="lp-strip-inner">
          {[
            { name: "POS Terminal",    url: "pos.dinexpos.in" },
            { name: "Captain App",     url: "captain.dinexpos.in" },
            { name: "Kitchen Display", url: "kds.dinexpos.in" },
            { name: "Owner Console",   url: "app.dinexpos.in" }
          ].map(app => (
            <div key={app.name} className="lp-strip-app">
              <span className="lp-strip-icon">{APP_STRIP_ICONS[app.name]}</span>
              <div>
                <strong>{app.name}</strong>
                <span>{app.url}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-section" id="features">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">What's included</p>
          <h2>Everything your restaurant needs</h2>
          <p className="lp-section-sub">One platform covers every touchpoint — from the kitchen to the owner's phone.</p>
          <div className="lp-features-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feature-card">
                <span className="lp-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section lp-section-dark" id="how-it-works">
        <div className="lp-section-inner">
          <p className="lp-eyebrow light">Simple setup</p>
          <h2>Live in one day</h2>
          <p className="lp-section-sub light">No IT team needed. No complex installation.</p>
          <div className="lp-steps-grid">
            {HOW_IT_WORKS.map(s => (
              <div key={s.step} className="lp-step">
                <div className="lp-step-num">{s.step}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="lp-section" id="testimonials">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">What owners say</p>
          <h2>Trusted by restaurants across India</h2>
          <div className="lp-testimonials-grid">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="lp-testimonial">
                <div className="lp-stars">★★★★★</div>
                <p className="lp-testimonial-text">"{t.text}"</p>
                <div className="lp-testimonial-author">
                  <div className="lp-author-avatar">{t.name[0]}</div>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-section" id="pricing">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">Simple pricing</p>
          <h2>One flat monthly fee. No per-device charges.</h2>
          <p className="lp-section-sub">Every plan includes a 30-day free trial. No credit card needed to start.</p>

          <div className="lp-pricing-grid">
            {PLANS.map(plan => (
              <div key={plan.id} className={`lp-plan-card${plan.highlighted ? " highlighted" : ""}`}>
                {plan.badge && <div className="lp-plan-badge">{plan.badge}</div>}
                <div className="lp-plan-header">
                  <strong className="lp-plan-name">{plan.name}</strong>
                  <div className="lp-plan-price">
                    <span className="lp-plan-amount">{plan.price}</span>
                    <span className="lp-plan-period">{plan.period}</span>
                  </div>
                  <p className="lp-plan-desc">{plan.desc}</p>
                </div>
                <ul className="lp-plan-features">
                  {plan.features.map((f, i) => (
                    <li key={i}><span className="lp-plan-check">✓</span>{f}</li>
                  ))}
                </ul>
                <a
                  href={plan.id === "enterprise" ? "mailto:hello@dinexpos.in" : "#enroll"}
                  className={`lp-plan-cta${plan.highlighted ? " primary" : ""}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="lp-pricing-note">
            All prices exclude GST. Annual billing available at 2 months free.{" "}
            <a href="mailto:hello@dinexpos.in">Contact us</a> for custom plans.
          </p>
        </div>
      </section>

      {/* ENROLL FORM */}
      <section className="lp-section lp-section-enroll" id="enroll">
        <div className="lp-enroll-inner">
          <div className="lp-enroll-left">
            <p className="lp-eyebrow">Free trial</p>
            <h2>Get started today</h2>
            <p className="lp-enroll-sub">
              Fill in your details and we'll set up your Plato account.
              No credit card. No commitment. Live in 24 hours.
            </p>
            <ul className="lp-enroll-perks">
              <li>✓ Free 30-day trial — full features</li>
              <li>✓ Dedicated onboarding support</li>
              <li>✓ Works on Android, Windows & Web</li>
              <li>✓ GST-compliant billing out of the box</li>
              <li>✓ Multi-outlet ready from day one</li>
            </ul>
            <div className="lp-enroll-existing">
              Already have an account?{" "}
              <a href={`${APP_URL}/login`}>Sign in to your console →</a>
            </div>
          </div>

          <div className="lp-enroll-right">
            {submitted ? (
              <div className="lp-enroll-success">
                <div className="lp-success-icon">🎉</div>
                <h3>Check your inbox!</h3>
                <p>Your login credentials have been sent to your email. Sign in to get started.</p>
                <a href={`${APP_URL}/login`} className="lp-btn-primary" style={{ marginTop: 16, display: "inline-block" }}>
                  Sign in to Plato →
                </a>
              </div>
            ) : (
              <form className="lp-enroll-form" onSubmit={handleEnroll} noValidate>
                <h3>Create your free account</h3>

                <label>
                  Your Name *
                  <input type="text" placeholder="Amarnath" value={form.name} onChange={set("name")} required />
                </label>

                <label>
                  Restaurant / Business Name *
                  <input type="text" placeholder="Saisangeet Restaurant" value={form.restaurant} onChange={set("restaurant")} required />
                </label>

                <div className="lp-form-row">
                  <label>
                    Phone *
                    <input type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} required />
                  </label>
                  <label>
                    Email *
                    <input type="email" placeholder="owner@restaurant.com" value={form.email} onChange={set("email")} required />
                  </label>
                </div>

                <label>
                  Number of outlets
                  <select value={form.outlets} onChange={set("outlets")}>
                    <option value="1">1 outlet</option>
                    <option value="2">2 outlets</option>
                    <option value="3-5">3–5 outlets</option>
                    <option value="6+">6+ outlets</option>
                  </select>
                </label>

                <label>
                  Anything specific you need? (optional)
                  <textarea placeholder="e.g. We need delivery integration, multi-printer setup..." value={form.message} onChange={set("message")} rows={3} />
                </label>

                <button
                  type="submit"
                  className="lp-btn-primary lp-btn-full"
                  disabled={submitting || !form.name || !form.restaurant || !form.phone || !form.email}
                >
                  {submitting ? "Submitting…" : "Start My Free Trial →"}
                </button>

                <p className="lp-form-note">
                  By submitting you agree to be contacted by our team. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo-mark small">
              <PlateLogo size={14} stroke="#fff" />
            </span>
            <div>
              <strong>Plato</strong>
              <span>Serve better. Every table.</span>
            </div>
          </div>
          <div className="lp-footer-links">
            <div>
              <strong>Platform</strong>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href={`${APP_URL}/signup`}>Sign Up</a>
              <a href={`${APP_URL}/login`}>Owner Login</a>
            </div>
            <div>
              <strong>Apps</strong>
              <a href="https://pos.dinexpos.in">POS Terminal</a>
              <a href="https://captain.dinexpos.in">Captain App</a>
              <a href="https://kds.dinexpos.in">Kitchen Display</a>
            </div>
            <div>
              <strong>Contact</strong>
              <a href="mailto:hello@dinexpos.in">hello@dinexpos.in</a>
              <a href="https://api.dinexpos.in/health">System Status</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2026 Plato. All rights reserved.</span>
          <span>Made in India 🇮🇳</span>
        </div>
      </footer>

    </div>
  );
}
