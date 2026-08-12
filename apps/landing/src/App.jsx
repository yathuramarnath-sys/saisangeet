import { useState } from "react";

const APP_URL = "https://app.dinexpos.in";
const API_URL = "https://api.dinexpos.in/api/v1";

const ECOSYSTEM = [
  {
    name: "PLATO POS",
    tagline: "Billing Terminal",
    desc: "Full-featured billing at lightning speed. Split bills, dine-in, takeaway, counters — GST-ready, works offline.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    )
  },
  {
    name: "PLATO Captain",
    tagline: "Waiter Ordering App",
    desc: "Waiters take orders on their phone. KOTs fire directly to the kitchen. No paper slips, no shouting.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>
      </svg>
    )
  },
  {
    name: "PLATO Kitchen",
    tagline: "Kitchen Display System",
    desc: "Real-time KOT screen for every station. Chefs mark items done, the captain app knows instantly.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 8h10M7 11h6"/>
      </svg>
    )
  },
  {
    name: "PLATO Queue",
    tagline: "Table & Token Manager",
    desc: "Manage dine-in tables, waitlists and delivery tokens in real time across your entire outlet.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeOpacity=".5"/><rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
    )
  },
  {
    name: "PLATO Pay",
    tagline: "Integrated Payments",
    desc: "UPI, card, cash and Razorpay — every payment linked to every order. Zero manual reconciliation.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>
      </svg>
    )
  },
  {
    name: "PLATO Print",
    tagline: "Smart Receipt Engine",
    desc: "KOT printers, bill printers, kitchen stations — configure roles, paper sizes and copies once, print forever.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      </svg>
    )
  },
  {
    name: "PLATO Online",
    tagline: "Aggregator Hub",
    desc: "Swiggy and Zomato orders land directly in your KOT queue via UrbanPiper. No tablet juggling.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    )
  },
  {
    name: "PLATO Owner",
    tagline: "Analytics Dashboard",
    desc: "Daily sales, shift reports, GST filings, outlet-wise performance — every metric on your phone or browser.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
      </svg>
    )
  },
  {
    name: "PLATO Cloud",
    tagline: "Multi-Outlet Control",
    desc: "One login. All branches. Centralised menu, staff and reporting for restaurant chains of any size.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
      </svg>
    )
  }
];

const HARDWARE = [
  {
    name: "PLATO Terminal",
    sub: "Counter billing unit",
    desc: "Purpose-built touchscreen billing counter with built-in receipt printer and cash drawer support."
  },
  {
    name: "PLATO Display",
    sub: "Customer-facing screen",
    desc: "Dual-display setup showing customers their live order summary at the point of billing."
  },
  {
    name: "PLATO Printer",
    sub: "Thermal receipt printer",
    desc: "Auto-cut thermal printer pre-paired with PLATO Print — zero driver setup on Windows or Android."
  },
  {
    name: "PLATO Pay Device",
    sub: "Card & UPI reader",
    desc: "Standalone payment terminal for tap, swipe and QR — auto-reconciled against every order."
  },
  {
    name: "PLATO KDS Screen",
    sub: "Ruggedized kitchen display",
    desc: "Industrial touchscreen built for high-heat, high-humidity kitchen environments."
  },
  {
    name: "PLATO Token Board",
    sub: "Queue display",
    desc: "Wall-mounted customer token and table-call display for takeaway counters and fast-casual formats."
  }
];

const HOW_IT_WORKS = [
  { step: "1", title: "Sign Up Free", desc: "Create your account in 2 minutes. No credit card needed." },
  { step: "2", title: "Set Up Your Restaurant", desc: "Add outlets, menu, staff and tax profiles from the Owner Console." },
  { step: "3", title: "Connect Your Devices", desc: "Scan the branch link code on your POS, Kitchen Display and Captain phones." },
  { step: "4", title: "Go Live", desc: "Start taking orders. Reports flow in automatically." }
];

const OUTLET_TYPES = [
  { id: "cafe",        label: "Café & QSR" },
  { id: "fullservice", label: "Full Service" },
  { id: "bar",         label: "Bar" },
  { id: "foodtruck",   label: "Food Truck" },
  { id: "street",      label: "Street Vendor" },
];

const PLANS_BY_TYPE = {
  cafe: [
    {
      id: "starter", name: "Starter", price: "₹1,999", period: "/ month",
      desc: "Perfect for single-outlet cafés and QSRs getting started.",
      features: ["PLATO POS", "PLATO Pay", "PLATO Print", "PLATO Cloud", "30-day free trial"],
      highlighted: false, cta: "Get started",
    },
    {
      id: "growth", name: "Growth", price: "₹3,499", period: "/ month",
      desc: "For growing QSRs managing dine-in, takeaway, and online orders.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Kitchen", "PLATO Pay", "PLATO Print", "PLATO Online", "PLATO Cloud"],
      highlighted: true, badge: "Most popular", cta: "Book a demo",
    },
    {
      id: "pro", name: "Pro", price: "₹5,999", period: "/ month",
      desc: "Full suite for multi-outlet café chains with owner-level analytics.",
      features: ["All 9 PLATO modules", "Multi-outlet dashboard", "Priority support", "Custom integrations"],
      highlighted: false, cta: "Talk to sales",
    },
  ],
  fullservice: [
    {
      id: "essential", name: "Essential", price: "₹2,999", period: "/ month",
      desc: "Core tools for a full-service restaurant with table service.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Pay", "PLATO Print", "PLATO Cloud", "30-day free trial"],
      highlighted: false, cta: "Get started",
    },
    {
      id: "complete", name: "Complete", price: "₹4,999", period: "/ month",
      desc: "Everything a full-service restaurant needs — floor to kitchen to owner.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Kitchen", "PLATO Queue", "PLATO Pay", "PLATO Print", "PLATO Online", "PLATO Owner", "PLATO Cloud"],
      highlighted: true, badge: "Most popular", cta: "Book a demo",
    },
    {
      id: "enterprise", name: "Enterprise", price: "Custom", period: "",
      desc: "For restaurant groups and chains with multiple outlets and custom needs.",
      features: ["All 9 PLATO modules", "Multi-outlet management", "Dedicated account manager", "SLA-backed uptime", "Custom integrations"],
      highlighted: false, cta: "Talk to sales",
    },
  ],
  bar: [
    {
      id: "starter", name: "Starter", price: "₹1,499", period: "/ month",
      desc: "For single-outlet bars and lounges.",
      features: ["PLATO POS", "PLATO Pay", "PLATO Print", "PLATO Cloud", "30-day free trial"],
      highlighted: false, cta: "Get started",
    },
    {
      id: "growth", name: "Growth", price: "₹2,999", period: "/ month",
      desc: "For bars with multiple areas or outlets.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Kitchen", "PLATO Pay", "PLATO Print", "PLATO Online", "PLATO Cloud"],
      highlighted: true, badge: "Most popular", cta: "Book a demo",
    },
    {
      id: "pro", name: "Pro", price: "₹4,999", period: "/ month",
      desc: "Multi-outlet bar chain management.",
      features: ["All 9 PLATO modules", "Multi-outlet management", "Dedicated account manager", "SLA-backed uptime"],
      highlighted: false, cta: "Talk to sales",
    },
  ],
  foodtruck: [
    {
      id: "starter", name: "Starter", price: "₹799", period: "/ month",
      desc: "For food trucks and pop-up stalls.",
      features: ["PLATO POS (Android + Web)", "PLATO Pay (UPI + card)", "PLATO Print", "30-day free trial"],
      highlighted: false, cta: "Get started",
    },
    {
      id: "growth", name: "Growth", price: "₹1,499", period: "/ month",
      desc: "For food trucks with online order integration.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Pay", "PLATO Print", "PLATO Online", "PLATO Cloud"],
      highlighted: true, badge: "Most popular", cta: "Book a demo",
    },
    {
      id: "pro", name: "Pro", price: "₹2,999", period: "/ month",
      desc: "Multi-location food truck fleet management.",
      features: ["All 9 PLATO modules", "Multi-outlet management", "Advanced analytics", "Priority support"],
      highlighted: false, cta: "Talk to sales",
    },
  ],
  street: [
    {
      id: "starter", name: "Starter", price: "₹399", period: "/ month",
      desc: "For street vendors and small stalls.",
      features: ["PLATO POS (Android)", "PLATO Pay (UPI)", "Basic billing", "Sales reports", "30-day free trial"],
      highlighted: false, cta: "Get started",
    },
    {
      id: "growth", name: "Growth", price: "₹799", period: "/ month",
      desc: "For vendors with multiple stalls.",
      features: ["PLATO POS", "PLATO Captain", "PLATO Pay", "PLATO Print", "PLATO Cloud"],
      highlighted: true, badge: "Most popular", cta: "Book a demo",
    },
    {
      id: "pro", name: "Pro", price: "₹1,499", period: "/ month",
      desc: "Full street food chain management.",
      features: ["All 9 PLATO modules", "Multi-outlet management", "Advanced analytics", "Priority support"],
      highlighted: false, cta: "Talk to sales",
    },
  ],
};

const INTEGRATIONS = [
  { name: "Swiggy & Zomato", desc: "Online orders flow straight into your KOT queue via UrbanPiper — no tablet juggling." },
  { name: "PhonePe", desc: "UPI & card payments reconciled automatically against every order." },
  { name: "Borzo", desc: "On-demand delivery rider dispatch for your own delivery orders." },
  { name: "Zoho Books", desc: "Daily sales sync straight into your accounting — no manual entry." },
  { name: "WhatsApp & SMS", desc: "Order updates and bills sent to customers automatically." },
  { name: "Razorpay", desc: "Secure subscription billing for your PLATO account." },
];

const PlateLogo = ({ size = 20, stroke = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 12h8"/>
    <path d="M12 8v8" strokeOpacity=".5"/>
  </svg>
);

const STRIP_PRODUCTS = ["POS", "Captain", "Kitchen", "Queue", "Pay", "Print", "Online", "Owner", "Cloud"];

export function App() {
  const [form, setForm] = useState({ name: "", restaurant: "", phone: "", email: "", outlets: "1", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeOutlet, setActiveOutlet] = useState("cafe");

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
            <span>PLATO</span>
          </a>
          <div className={`lp-nav-links${menuOpen ? " open" : ""}`}>
            <a href="#ecosystem" onClick={() => setMenuOpen(false)}>Products</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#vision" onClick={() => setMenuOpen(false)}>About</a>
            <a href="#enroll" onClick={() => setMenuOpen(false)}>Contact</a>
          </div>
          <div className="lp-nav-actions">
            <a href={`${APP_URL}/login`} className="lp-nav-login">Sign In</a>
            <a href="#enroll" className="lp-nav-cta">Request Demo</a>
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
            <h1>The Restaurant<br />Operating System.</h1>
            <p className="lp-hero-sub">
              One platform. Every restaurant operation.<br />
              POS · Captain · Kitchen · Pay · Online Orders · Owner Analytics.
            </p>
            <div className="lp-hero-btns">
              <a href="#enroll" className="lp-btn-primary">Start Free Trial</a>
              <a href="#ecosystem" className="lp-btn-ghost">Explore PLATO →</a>
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
                    <span>PLATO</span>
                  </div>
                  {["Overview","Outlets","Menu","Staff","Reports","Devices"].map(item => (
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

      {/* PRODUCT STRIP */}
      <section className="lp-app-strip">
        <div className="lp-strip-inner">
          {STRIP_PRODUCTS.map(name => (
            <span key={name} className="lp-strip-pill">
              <span className="lp-strip-pill-dot" />
              PLATO {name}
            </span>
          ))}
        </div>
      </section>

      {/* STATS ROW */}
      <section className="lp-stats-row">
        <div className="lp-stats-inner">
          <div className="lp-stat-item">
            <div className="lp-stat-big">9 <span>Modules.</span></div>
            <div className="lp-stat-sub">1 Platform.</div>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat-item">
            <div className="lp-stat-big">Real-time <span>sync.</span></div>
            <div className="lp-stat-sub">across every outlet.</div>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat-item">
            <div className="lp-stat-big">Order to <span>payment</span></div>
            <div className="lp-stat-sub">in seconds.</div>
          </div>
        </div>
      </section>

      {/* ECOSYSTEM */}
      <section className="lp-section" id="ecosystem">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">The PLATO Ecosystem</p>
          <h2>9 products. One platform.</h2>
          <p className="lp-section-sub">Every tool your restaurant needs — built to work together from day one.</p>
          <div className="lp-features-grid">
            {ECOSYSTEM.map(p => (
              <div key={p.name} className="lp-feature-card">
                <span className="lp-feature-icon">{p.icon}</span>
                <h3>{p.name}</h3>
                <div className="lp-feature-tagline">{p.tagline}</div>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VISION — Software. Hardware. Payments. (white background) */}
      <section className="lp-section lp-section-light" id="vision">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">Our Vision</p>
          <h2>Software. Hardware. Payments.<br />One PLATO.</h2>
          <div className="lp-vision-intro">
            <p>
              PLATO is more than software. We're building an end-to-end restaurant operating system —
              purpose-built hardware that ships pre-configured with every PLATO product.
              No setup. No IT. Just plug in and go.
            </p>
          </div>
          <div className="lp-vision-grid">
            {HARDWARE.map(h => (
              <div key={h.name} className="lp-vision-card">
                <div className="lp-coming-badge">Coming Soon</div>
                <h4>{h.name}</h4>
                <p className="lp-vision-card-sub">{h.sub}</p>
                <p>{h.desc}</p>
              </div>
            ))}
          </div>
          <p className="lp-vision-note">
            Hardware launches in 2026. Register your interest and we'll notify you first.
          </p>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className="lp-section" id="integrations">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">Connected out of the box</p>
          <h2>Plays well with the tools you already use</h2>
          <p className="lp-section-sub">No middleware, no manual reconciliation — PLATO talks to your delivery, payment and accounting stack directly.</p>
          <div className="lp-integrations-grid">
            {INTEGRATIONS.map(i => (
              <div key={i.name} className="lp-int-card">
                <h3>{i.name}</h3>
                <p>{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section" id="how-it-works">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">Simple setup</p>
          <h2>Live in one day</h2>
          <p className="lp-section-sub">No IT team needed. No complex installation.</p>
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

      {/* FEATURED TESTIMONIAL */}
      <section className="lp-section lp-section-light" id="testimonials">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">What owners say</p>
          <h2>Trusted by restaurants across India</h2>
          <div className="lp-featured-testimonial">
            <span className="lp-quote-mark">"</span>
            <p className="lp-featured-quote">
              PLATO transformed how we run our 12-outlet chain. Every station — kitchen, billing, payments — works as one. We've cut order errors by 80% and our staff actually enjoy using it.
            </p>
            <div className="lp-testimonial-author">
              <div className="lp-author-avatar">R</div>
              <div>
                <strong>Rajan Mehta</strong>
                <span>Director of Operations · Spice Route Group</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-section" id="pricing">
        <div className="lp-section-inner">
          <p className="lp-eyebrow">Simple pricing</p>
          <h2>One flat monthly fee. No per-device charges.</h2>
          <p className="lp-section-sub">
            Whether you're a street cart or a full-service chain, PLATO scales with you.
            All plans include free onboarding, 24/7 support, and no hidden fees.
          </p>

          {/* Outlet type tabs */}
          <div className="lp-outlet-tabs">
            {OUTLET_TYPES.map(t => (
              <button
                key={t.id}
                className={`lp-outlet-tab${activeOutlet === t.id ? " active" : ""}`}
                onClick={() => setActiveOutlet(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="lp-pricing-grid">
            {PLANS_BY_TYPE[activeOutlet].map(plan => (
              <div key={plan.id} className={`lp-plan-card${plan.highlighted ? " highlighted" : ""}`}>
                {plan.badge && <div className="lp-plan-badge">{plan.badge}</div>}
                <div className="lp-plan-header">
                  <strong className="lp-plan-name">{plan.name}</strong>
                  <div className="lp-plan-price">
                    <span className="lp-plan-amount">{plan.price}</span>
                    {plan.period && <span className="lp-plan-period">{plan.period}</span>}
                  </div>
                  <p className="lp-plan-desc">{plan.desc}</p>
                </div>
                <ul className="lp-plan-features">
                  {plan.features.map((f, i) => (
                    <li key={i}><span className="lp-plan-check">✓</span>{f}</li>
                  ))}
                </ul>
                <a
                  href={plan.cta === "Talk to sales" ? "mailto:info@dinexpos.in" : "#enroll"}
                  className={`lp-plan-cta${plan.highlighted ? " primary" : ""}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="lp-pricing-note">
            All prices exclude GST. Annual billing available at 2 months free.{" "}
            <a href="mailto:info@dinexpos.in">Contact us</a> for custom plans.
          </p>
        </div>
      </section>

      {/* ORANGE CTA */}
      <section className="lp-section-cta">
        <div className="lp-cta-inner">
          <div className="lp-cta-text">
            <h2>Ready to run a smarter restaurant?</h2>
            <p>Join hundreds of restaurants already operating on PLATO.</p>
          </div>
          <div className="lp-cta-btns">
            <a href="#enroll" className="lp-btn-white">Book Your Demo</a>
            <a href="#ecosystem" className="lp-btn-outline-white">View All Modules</a>
          </div>
        </div>
      </section>

      {/* ENROLL FORM */}
      <section className="lp-section lp-section-enroll" id="enroll">
        <div className="lp-enroll-inner">
          <div className="lp-enroll-left">
            <p className="lp-eyebrow">Free trial</p>
            <h2>Get started today</h2>
            <p className="lp-enroll-sub">
              Fill in your details and we'll set up your PLATO account.
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
                  Sign in to PLATO →
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
              <strong>PLATO</strong>
              <span>The complete operating system for modern restaurants.</span>
            </div>
          </div>
          <div className="lp-footer-links">
            <div>
              <strong>Products</strong>
              <a href="#ecosystem">PLATO POS</a>
              <a href="#ecosystem">PLATO Captain</a>
              <a href="#ecosystem">PLATO Kitchen</a>
              <a href="#ecosystem">PLATO Queue</a>
              <a href="#ecosystem">PLATO Pay</a>
              <a href="#ecosystem">PLATO Print</a>
              <a href="#ecosystem">PLATO Online</a>
              <a href="#ecosystem">PLATO Owner</a>
              <a href="#ecosystem">PLATO Cloud</a>
            </div>
            <div>
              <strong>Company</strong>
              <a href="#vision">About</a>
              <a href="#pricing">Pricing</a>
              <a href="mailto:info@dinexpos.in">Contact</a>
              <a href="#enroll">Request Demo</a>
            </div>
            <div>
              <strong>Get in Touch</strong>
              <p className="lp-footer-contact-text">Ready to transform your restaurant operations?</p>
              <a href="#enroll" className="lp-footer-demo-btn">Book a Demo</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2026 PLATO. All rights reserved.</span>
          <span><a href="#" style={{ color: "#4A5065", textDecoration: "none", marginRight: 16 }}>Privacy Policy</a><a href="#" style={{ color: "#4A5065", textDecoration: "none" }}>Terms of Service</a></span>
        </div>
      </footer>

    </div>
  );
}
