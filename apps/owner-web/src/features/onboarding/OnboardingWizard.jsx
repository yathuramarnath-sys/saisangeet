/**
 * OnboardingWizard
 *
 * Shown once after first signup — guides the owner through 4 steps:
 *   Step 1 — Business name  (PATCH /business-profile)
 *   Step 2 — First outlet   (POST  /outlets)
 *   Step 3 — First menu     (POST  /menu/categories  +  POST /menu/items × N)
 *   Step 4 — Download apps  (links to POS / Captain / KDS)
 *
 * Completion flag stored in localStorage so it never shows again:
 *   key: "plato_onboarding_done"
 *
 * Can be skipped at any step — user can always redo from Sidebar.
 */

import { useState } from "react";
import { api } from "../../lib/api";

// ─── constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "plato_onboarding_done";

export function isOnboardingDone() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function markOnboardingDone() {
  localStorage.setItem(STORAGE_KEY, "1");
}

// ─── step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Business"  },
  { n: 2, label: "Outlet"    },
  { n: 3, label: "Menu"      },
  { n: 4, label: "Get Apps"  },
];

function StepBar({ current }) {
  return (
    <div className="ob-stepbar">
      {STEPS.map((s, i) => (
        <div key={s.n} className="ob-step-wrap">
          <div className={`ob-step-dot ${current === s.n ? "active" : current > s.n ? "done" : ""}`}>
            {current > s.n ? "✓" : s.n}
          </div>
          <span className={`ob-step-label ${current === s.n ? "active" : ""}`}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <div className={`ob-step-line ${current > s.n ? "done" : ""}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1 — Business name ───────────────────────────────────────────────────

function Step1({ onNext, onSkip }) {
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [city,  setCity]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  async function handleNext() {
    if (!name.trim()) return setErr("Restaurant name is required.");
    setErr(""); setBusy(true);
    try {
      await api.patch("/business-profile", {
        tradeName: name.trim(),
        legalName: name.trim(),
        phone:     phone.trim() || undefined,
        city:      city.trim()  || undefined,
      });
      onNext({ businessName: name.trim() });
    } catch (e) {
      setErr(e.message || "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-step-body">
      <div className="ob-step-icon">🏪</div>
      <h2 className="ob-step-title">What's your restaurant called?</h2>
      <p className="ob-step-sub">This appears on bills, reports and your Owner Dashboard.</p>

      {err && <div className="ob-error">{err}</div>}

      <div className="ob-fields">
        <label className="ob-field">
          Restaurant name <span className="ob-req">*</span>
          <input
            className="ob-input"
            placeholder="e.g. Hotel Saisangeet"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={150}
          />
        </label>
        <label className="ob-field">
          City
          <input
            className="ob-input"
            placeholder="e.g. Indore"
            value={city}
            onChange={e => setCity(e.target.value)}
            maxLength={100}
          />
        </label>
        <label className="ob-field">
          Owner phone
          <input
            className="ob-input"
            placeholder="+91 9876543210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            maxLength={20}
          />
        </label>
      </div>

      <div className="ob-actions">
        <button className="ob-next-btn" onClick={handleNext} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Next — Add Outlet →"}
        </button>
        <button className="ob-skip-link" onClick={onSkip}>Skip setup for now</button>
      </div>
    </div>
  );
}

// ─── Step 2 — First outlet ────────────────────────────────────────────────────

function Step2({ businessName, onNext, onSkip }) {
  const [name,  setName]  = useState(businessName || "");
  const [city,  setCity]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  async function handleNext() {
    if (!name.trim()) return setErr("Outlet name is required.");
    setErr(""); setBusy(true);
    try {
      const outlet = await api.post("/outlets", {
        name: name.trim(),
        city: city.trim() || undefined,
      });
      onNext({ outletId: outlet?.id || outlet?.outlet?.id });
    } catch (e) {
      setErr(e.message || "Could not create outlet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-step-body">
      <div className="ob-step-icon">📍</div>
      <h2 className="ob-step-title">Add your first outlet</h2>
      <p className="ob-step-sub">
        An outlet is one physical location — branch, kitchen, or counter.
        Staff sync their POS / Captain App to this outlet using a link code.
      </p>

      {err && <div className="ob-error">{err}</div>}

      <div className="ob-fields">
        <label className="ob-field">
          Outlet name <span className="ob-req">*</span>
          <input
            className="ob-input"
            placeholder="e.g. Main Branch"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={150}
          />
        </label>
        <label className="ob-field">
          City
          <input
            className="ob-input"
            placeholder="e.g. Indore"
            value={city}
            onChange={e => setCity(e.target.value)}
            maxLength={100}
          />
        </label>
      </div>

      <div className="ob-actions">
        <button className="ob-next-btn" onClick={handleNext} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Next — Build Menu →"}
        </button>
        <button className="ob-skip-link" onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}

// ─── Step 3 — Quick menu ──────────────────────────────────────────────────────

const EMPTY_ITEM = () => ({ name: "", price: "" });

function Step3({ onNext, onSkip }) {
  const [catName, setCatName] = useState("");
  const [items,   setItems]   = useState([EMPTY_ITEM(), EMPTY_ITEM(), EMPTY_ITEM()]);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  function updateItem(i, field, val) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }

  async function handleNext() {
    if (!catName.trim()) return setErr("Category name is required.");
    const validItems = items.filter(it => it.name.trim());
    if (validItems.length === 0) return setErr("Add at least one menu item.");
    setErr(""); setBusy(true);
    try {
      // Create category
      const catRes = await api.post("/menu/categories", { name: catName.trim() });
      const categoryId = catRes?.id || catRes?.category?.id;

      // Create items
      for (const it of validItems) {
        await api.post("/menu/items", {
          name:       it.name.trim(),
          price:      it.price ? parseFloat(it.price) : 0,
          categoryId: categoryId || undefined,
        });
      }
      onNext({ itemCount: validItems.length });
    } catch (e) {
      setErr(e.message || "Could not save menu. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const validCount = items.filter(it => it.name.trim()).length;

  return (
    <div className="ob-step-body">
      <div className="ob-step-icon">🍽️</div>
      <h2 className="ob-step-title">Add your first menu items</h2>
      <p className="ob-step-sub">
        Start with one category and a few items — you can add more anytime from the Menu page.
      </p>

      {err && <div className="ob-error">{err}</div>}

      <div className="ob-fields">
        <label className="ob-field">
          Category name <span className="ob-req">*</span>
          <input
            className="ob-input"
            placeholder="e.g. Starters, Main Course, Beverages"
            value={catName}
            onChange={e => setCatName(e.target.value)}
            autoFocus
            maxLength={100}
          />
        </label>
      </div>

      <div className="ob-menu-grid">
        <div className="ob-menu-header">
          <span>Item name</span>
          <span>Price (₹)</span>
        </div>
        {items.map((it, i) => (
          <div key={i} className="ob-menu-row">
            <input
              className="ob-input"
              placeholder={`Item ${i + 1}`}
              value={it.name}
              onChange={e => updateItem(i, "name", e.target.value)}
              maxLength={150}
            />
            <input
              className="ob-input ob-price-input"
              placeholder="0"
              type="number"
              min="0"
              step="0.01"
              value={it.price}
              onChange={e => updateItem(i, "price", e.target.value)}
            />
          </div>
        ))}
        <button
          className="ob-add-row-btn"
          onClick={() => setItems(prev => [...prev, EMPTY_ITEM()])}
          type="button"
        >
          + Add another item
        </button>
      </div>

      <div className="ob-actions">
        <button
          className="ob-next-btn"
          onClick={handleNext}
          disabled={busy || !catName.trim() || validCount === 0}
        >
          {busy ? "Saving…" : `Save ${validCount > 0 ? validCount : ""} item${validCount !== 1 ? "s" : ""} →`}
        </button>
        <button className="ob-skip-link" onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}

// ─── Step 4 — Download apps ───────────────────────────────────────────────────

const GH = "https://github.com/yathuramarnath-sys/saisangeet/releases/latest/download";

const APP_LINKS = [
  {
    icon: "🖥️",
    name: "POS Terminal",
    desc: "Billing counter · Windows / Android / Web",
    links: [
      { label: "Open Web App", url: "https://pos.dinexpos.in", dl: false },
      { label: "Windows .exe", url: `${GH}/Plato POS Setup 1.2.0.exe`, dl: true },
      { label: "Android APK",  url: `${GH}/plato-pos.apk`,  dl: true },
    ]
  },
  {
    icon: "📱",
    name: "Captain App",
    desc: "Waiter order-taking · Android phone/tablet",
    links: [
      { label: "Open Web App", url: "https://captain.dinexpos.in", dl: false },
      { label: "Android APK",  url: `${GH}/plato-captain.apk`, dl: true },
    ]
  },
  {
    icon: "📺",
    name: "Kitchen Display",
    desc: "KOT queue · Any screen with Chrome",
    links: [
      { label: "Open Web App", url: "https://kds.dinexpos.in", dl: false },
      { label: "Android APK",  url: `${GH}/plato-kds.apk`, dl: true },
    ]
  },
];

function Step4({ onDone }) {
  return (
    <div className="ob-step-body">
      <div className="ob-step-icon">🎉</div>
      <h2 className="ob-step-title">You're all set! Download the apps</h2>
      <p className="ob-step-sub">
        Install one app per station. Each device enters the <strong>branch link code</strong> from
        the App Store page to sync to your outlet.
      </p>

      <div className="ob-app-list">
        {APP_LINKS.map(app => (
          <div key={app.name} className="ob-app-card">
            <span className="ob-app-icon">{app.icon}</span>
            <div className="ob-app-info">
              <strong>{app.name}</strong>
              <span>{app.desc}</span>
            </div>
            <div className="ob-app-links">
              {app.links.map(l => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={l.dl ? true : undefined}
                  className="ob-app-link-btn"
                >
                  {l.dl ? "↓" : "↗"} {l.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ob-actions">
        <button className="ob-next-btn ob-finish-btn" onClick={onDone}>
          Go to Dashboard →
        </button>
        <p className="ob-done-note">
          You can always find download links in <strong>App Store</strong> from the sidebar.
        </p>
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }) {
  const [step,    setStep]    = useState(1);
  const [context, setContext] = useState({});

  function goNext(data = {}) {
    setContext(prev => ({ ...prev, ...data }));
    if (step < 4) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  }

  function finish() {
    markOnboardingDone();
    onComplete();
  }

  function skipAll() {
    markOnboardingDone();
    onComplete();
  }

  return (
    <div className="ob-overlay">
      <div className="ob-modal">
        {/* Header */}
        <div className="ob-modal-head">
          <div className="ob-brand">
            <div className="ob-brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9"/>
                <path d="M8 12h8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="ob-brand-name">Plato</span>
          </div>
          <button className="ob-close-btn" onClick={skipAll} title="Skip setup">✕</button>
        </div>

        {/* Step bar */}
        <StepBar current={step} />

        {/* Content */}
        <div className="ob-content">
          {step === 1 && (
            <Step1
              onNext={goNext}
              onSkip={() => goNext()}
            />
          )}
          {step === 2 && (
            <Step2
              businessName={context.businessName}
              onNext={goNext}
              onSkip={() => goNext()}
            />
          )}
          {step === 3 && (
            <Step3
              onNext={goNext}
              onSkip={() => goNext()}
            />
          )}
          {step === 4 && (
            <Step4 onDone={finish} />
          )}
        </div>

        {/* Footer */}
        <div className="ob-modal-foot">
          <span className="ob-foot-step">Step {step} of {STEPS.length}</span>
          {step > 1 && step < 4 && (
            <button className="ob-back-btn" onClick={() => setStep(s => s - 1)}>← Back</button>
          )}
        </div>
      </div>
    </div>
  );
}
