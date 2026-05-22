import { useEffect, useState } from "react";

import { fetchBusinessProfile, saveBusinessProfile } from "./business.service";
import { api } from "../../lib/api";
import { buildSubdomainUrl } from "../../lib/subdomain";

// ── Business type options ─────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { id: "restaurant",   label: "Restaurant",     icon: "🍽️" },
  { id: "cafe",         label: "Cafe",           icon: "☕" },
  { id: "bakery",       label: "Bakery",         icon: "🥐" },
  { id: "sweetShop",    label: "Sweet Shop",     icon: "🍬" },
  { id: "iceCreamShop", label: "Ice Cream Shop", icon: "🍦" },
  { id: "qsr",          label: "QSR",            icon: "🍔" },
  { id: "bar",          label: "Bar / Pub",      icon: "🍺" },
  { id: "cloudKitchen", label: "Cloud Kitchen",  icon: "📦" },
];

// ── Optional menu field labels ─────────────────────────────────────────────────
const MENU_FIELD_LABELS = {
  description:       "Item Description",
  shortCode:         "Short Code (KOT print)",
  hsnCode:           "HSN / SAC Code",
  rank:              "Item Rank / Sort Order",
  packingCharges:    "Packing Charges",
  exposeInCaptain:   "Expose in Captain App",
  allowDecimalQty:   "Allow Decimal Quantity",
  manufacturingDate: "Manufacturing Date",
  expiryDate:        "Expiry Date",
  sku:               "SKU / Barcode",
};

// ── Default — all OFF ─────────────────────────────────────────────────────────
const DEFAULT_FIELD_SETTINGS = {
  description:       false,
  shortCode:         false,
  hsnCode:           false,
  rank:              false,
  packingCharges:    false,
  exposeInCaptain:   false,
  allowDecimalQty:   false,
  manufacturingDate: false,
  expiryDate:        false,
  sku:               false,
};

// ── Preset per business type ──────────────────────────────────────────────────
const BUSINESS_TYPE_PRESETS = {
  restaurant:   { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: true,  allowDecimalQty: false, manufacturingDate: false, expiryDate: false, sku: false },
  cafe:         { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: true,  allowDecimalQty: false, manufacturingDate: false, expiryDate: false, sku: false },
  bakery:       { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: false, allowDecimalQty: true,  manufacturingDate: true,  expiryDate: true,  sku: true  },
  sweetShop:    { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: false, allowDecimalQty: true,  manufacturingDate: true,  expiryDate: true,  sku: true  },
  iceCreamShop: { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: false, allowDecimalQty: true,  manufacturingDate: true,  expiryDate: true,  sku: false },
  qsr:          { description: false, shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: false, allowDecimalQty: false, manufacturingDate: false, expiryDate: false, sku: false },
  bar:          { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: false, exposeInCaptain: true,  allowDecimalQty: false, manufacturingDate: false, expiryDate: false, sku: false },
  cloudKitchen: { description: true,  shortCode: true,  hsnCode: true, rank: true, packingCharges: true,  exposeInCaptain: false, allowDecimalQty: false, manufacturingDate: false, expiryDate: false, sku: false },
};

const emptyProfile = {
  legalName:    "",
  tradeName:    "",
  gstin:        "",
  fssaiNo:      "",
  phone:        "",
  email:        "",
  addressLine1: "",
  addressLine2: "",
  city:         "",
  state:        "",
  postalCode:   "",
  invoiceHeader:"",
  invoiceFooter:"",
  businessType: "",
};

export function BusinessProfilePage() {
  const [profile, setProfile]               = useState(emptyProfile);
  const [menuFieldSettings, setMenuFieldSettings] = useState(DEFAULT_FIELD_SETTINGS);
  const [statusMessage, setStatusMessage]   = useState("");

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
      if (!cancelled) {
        setProfile({ ...emptyProfile, ...result });
        // Restore saved field settings (if any)
        if (result.menuFieldSettings) {
          setMenuFieldSettings({ ...DEFAULT_FIELD_SETTINGS, ...result.menuFieldSettings });
        }
      }
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

  // ── Business type change → apply preset ───────────────────────────────────
  function handleBusinessTypeChange(typeId) {
    setProfile((cur) => ({ ...cur, businessType: typeId }));
    if (BUSINESS_TYPE_PRESETS[typeId]) {
      setMenuFieldSettings({ ...DEFAULT_FIELD_SETTINGS, ...BUSINESS_TYPE_PRESETS[typeId] });
    }
  }

  // ── Toggle individual field ────────────────────────────────────────────────
  function toggleField(key) {
    setMenuFieldSettings((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await saveBusinessProfile({ ...profile, menuFieldSettings });
    setProfile({ ...emptyProfile, ...result });
    if (result.menuFieldSettings) {
      setMenuFieldSettings({ ...DEFAULT_FIELD_SETTINGS, ...result.menuFieldSettings });
    }
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

      <section className="dashboard-grid outlets-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Master Setup</p>
              <h3>Business Details</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleSubmit}>

            {/* ── Business Type ─────────────────────────────────────────── */}
            <div className="field-group">
              <p className="field-group-label">Business Type</p>
              <p className="field-group-hint">Select your business type — we'll automatically configure the right menu fields for you.</p>
              <div className="btype-grid">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    type="button"
                    className={`btype-card${profile.businessType === bt.id ? " btype-card--active" : ""}`}
                    onClick={() => handleBusinessTypeChange(bt.id)}
                  >
                    <span className="btype-icon">{bt.icon}</span>
                    <span className="btype-label">{bt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Menu Field Settings ───────────────────────────────────── */}
            {profile.businessType && (
              <div className="field-group">
                <p className="field-group-label">Menu Fields</p>
                <p className="field-group-hint">Fields are pre-configured for your business type. Toggle any field on or off to customise.</p>
                <div className="mfs-grid">
                  {Object.entries(MENU_FIELD_LABELS).map(([key, label]) => (
                    <div key={key} className="mfs-row">
                      <span className="mfs-label">{label}</span>
                      <button
                        type="button"
                        className={`mfs-toggle${menuFieldSettings[key] ? " mfs-toggle--on" : ""}`}
                        onClick={() => toggleField(key)}
                        title={menuFieldSettings[key] ? "Click to disable" : "Click to enable"}
                      >
                        {menuFieldSettings[key] ? "ON" : "OFF"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              FSSAI Licence Number
              <input type="text" name="fssaiNo" value={profile.fssaiNo || ""} onChange={updateField} placeholder="e.g. 10012345678901" />
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
