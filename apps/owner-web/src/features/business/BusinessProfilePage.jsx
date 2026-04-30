import { useEffect, useState } from "react";

import { fetchBusinessProfile, saveBusinessProfile } from "./business.service";
import { api } from "../../lib/api";
import { buildSubdomainUrl } from "../../lib/subdomain";

const emptyProfile = {
  legalName: "",
  tradeName: "",
  gstin: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  invoiceHeader: "",
  invoiceFooter: ""
};

export function BusinessProfilePage() {
  const [profile, setProfile]           = useState(emptyProfile);
  const [statusMessage, setStatusMessage] = useState("");

  // Subdomain state
  const [currentSlug, setCurrentSlug]   = useState(null);
  const [slugDraft, setSlugDraft]       = useState("");
  const [slugEditing, setSlugEditing]   = useState(false);
  const [slugSaving, setSlugSaving]     = useState(false);
  const [slugMsg, setSlugMsg]           = useState("");
  const [slugIsError, setSlugIsError]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchBusinessProfile();
      if (!cancelled) setProfile({ ...emptyProfile, ...result });
    }

    async function loadSubdomain() {
      try {
        const sub = await api.get("/business-profile/subdomain");
        if (!cancelled && sub?.subdomain) {
          setCurrentSlug(sub.subdomain);
          setSlugDraft(sub.subdomain);
        }
      } catch (_) {}
    }

    load();
    loadSubdomain();

    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await saveBusinessProfile(profile);
    setProfile({ ...emptyProfile, ...result });
    setStatusMessage("Business profile saved.");
    // Only update restaurant display name — never auto-submit slugDraft here
    const name = profile.tradeName || profile.legalName;
    if (name && currentSlug) {
      // Restaurant name update only — slug stays unchanged
      api.patch("/business-profile/subdomain", { subdomain: currentSlug, restaurantName: name })
        .catch(() => {});
    }
  }

  async function handleSaveSlug(e) {
    e.preventDefault();
    if (!slugDraft.trim()) return;
    setSlugSaving(true);
    setSlugMsg("");
    setSlugIsError(false);
    try {
      const result = await api.patch("/business-profile/subdomain", {
        subdomain:      slugDraft.trim().toLowerCase(),
        restaurantName: profile.tradeName || profile.legalName || "",
      });
      setCurrentSlug(result.subdomain);
      setSlugDraft(result.subdomain);
      setSlugEditing(false);
      setSlugMsg(`Your URL is now: ${result.url}`);
      setSlugIsError(false);
    } catch (err) {
      setSlugMsg(err.message || "Failed to save URL.");
      setSlugIsError(true);
    } finally {
      setSlugSaving(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setProfile((current) => ({
      ...current,
      [name]: value
    }));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Business Information</p>
          <h2>Business Profile</h2>
        </div>
      </header>

      <section className="hero-panel outlet-hero">
        <div>
          <p className="hero-label">Foundation first</p>
          <h3>Set up your legal business and invoice identity before rollout</h3>
          <p className="hero-copy">
            This information powers invoice headers, GST identity, contact details, and the default
            setup used across outlets, receipts, and devices.
          </p>
        </div>
      </section>

      {/* ── Your Plato URL ─────────────────────────────────────────────── */}
      <section className="subdomain-section">
        <div className="subdomain-panel">
          <div className="subdomain-panel-left">
            <p className="eyebrow">Custom URL</p>
            <h3>Your Plato URL</h3>
            <p className="subdomain-desc">
              Share this link with your staff instead of <code>app.dinexpos.in</code>.
              Your team sees your restaurant name on the login page.
            </p>

            {/* Current URL display */}
            {currentSlug ? (
              <div className="subdomain-url-display">
                <span className="subdomain-url-text">
                  🌐 {buildSubdomainUrl(currentSlug)}
                </span>
                <button
                  type="button"
                  className="ghost-chip"
                  onClick={() => { navigator.clipboard?.writeText(buildSubdomainUrl(currentSlug)); setSlugMsg("URL copied!"); setTimeout(() => setSlugMsg(""), 2000); }}
                >
                  Copy
                </button>
              </div>
            ) : (
              <p className="subdomain-none">No custom URL set yet — set one below.</p>
            )}

            {/* Edit form */}
            {slugEditing ? (
              <form className="subdomain-edit-form" onSubmit={handleSaveSlug}>
                <div className="subdomain-input-row">
                  <input
                    type="text"
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="e.g. tajhotel"
                    maxLength={30}
                    className="subdomain-input"
                    autoFocus
                  />
                  <span className="subdomain-suffix">.dinexpos.in</span>
                </div>
                <p className="subdomain-rules">3–30 characters · letters, numbers, hyphens only</p>
                <div className="subdomain-actions">
                  <button type="submit" className="primary-btn" disabled={slugSaving || slugDraft.length < 3}>
                    {slugSaving ? "Saving…" : "Save URL"}
                  </button>
                  <button type="button" className="ghost-chip" onClick={() => { setSlugEditing(false); setSlugDraft(currentSlug || ""); }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="ghost-chip" style={{ marginTop: 12 }} onClick={() => setSlugEditing(true)}>
                {currentSlug ? "Change URL" : "Set your URL"}
              </button>
            )}

            {slugMsg && <p className={`subdomain-msg ${slugIsError ? "subdomain-msg-error" : ""}`}>{slugMsg}</p>}
          </div>

          {/* Setup instructions */}
          <div className="subdomain-panel-right">
            <p className="eyebrow">DNS Setup</p>
            <h4>To activate your custom URL</h4>
            <ol className="subdomain-steps">
              <li>Go to your domain registrar (e.g. GoDaddy, Cloudflare)</li>
              <li>Add a <strong>CNAME</strong> record:<br />
                <code>*.dinexpos.in → cname.vercel-dns.com</code>
              </li>
              <li>In Vercel, add <code>*.dinexpos.in</code> as a wildcard domain on the owner-web project</li>
              <li>Share <strong>{currentSlug ? buildSubdomainUrl(currentSlug) : "yourbrand.dinexpos.in"}</strong> with your team</li>
            </ol>
            <p className="subdomain-note">
              DNS changes can take 1–24 hours to propagate.
              Until then, <code>app.dinexpos.in</code> always works.
            </p>
          </div>
        </div>
      </section>

      <section className="dashboard-grid outlets-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Master Setup</p>
              <h3>Business Details</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleSubmit}>
            <label>
              Legal business name
              <input type="text" name="legalName" value={profile.legalName} onChange={updateField} />
            </label>
            <label>
              Brand name
              <input type="text" name="tradeName" value={profile.tradeName} onChange={updateField} />
            </label>
            <label>
              GSTIN
              <input type="text" name="gstin" value={profile.gstin} onChange={updateField} />
            </label>
            <label>
              Phone
              <input type="text" name="phone" value={profile.phone} onChange={updateField} />
            </label>
            <label>
              Email
              <input type="email" name="email" value={profile.email} onChange={updateField} />
            </label>
            <label>
              Address line 1
              <input type="text" name="addressLine1" value={profile.addressLine1} onChange={updateField} />
            </label>
            <label>
              Address line 2
              <input type="text" name="addressLine2" value={profile.addressLine2} onChange={updateField} />
            </label>
            <label>
              City
              <input type="text" name="city" value={profile.city} onChange={updateField} />
            </label>
            <label>
              State
              <input type="text" name="state" value={profile.state} onChange={updateField} />
            </label>
            <label>
              Postal code
              <input type="text" name="postalCode" value={profile.postalCode} onChange={updateField} />
            </label>
            <label>
              Invoice header
              <input type="text" name="invoiceHeader" value={profile.invoiceHeader} onChange={updateField} />
            </label>
            <label>
              Invoice footer
              <input type="text" name="invoiceFooter" value={profile.invoiceFooter} onChange={updateField} />
            </label>
            {statusMessage ? <p>{statusMessage}</p> : null}
            <button type="submit" className="primary-btn full-width">
              Save Business Profile
            </button>
          </form>
        </article>
      </section>
    </>
  );
}
