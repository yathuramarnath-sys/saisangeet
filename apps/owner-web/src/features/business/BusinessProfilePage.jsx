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
