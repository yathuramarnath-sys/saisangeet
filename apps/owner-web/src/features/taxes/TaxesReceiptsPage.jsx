import { useEffect, useState } from "react";

import { createReceiptTemplate, createTaxProfile, fetchTaxesData } from "./taxes.service";

function ToggleRow({ title, description, enabled = false }) {
  return (
    <div className="print-toggle-row">
      <div className={`print-toggle ${enabled ? "enabled" : ""}`} aria-hidden="true">
        <span className="print-toggle-knob" />
      </div>
      <div className="print-toggle-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}

export function TaxesReceiptsPage() {
  const [taxData, setTaxData] = useState({
    profiles: [],
    receiptTemplates: [],
    outletDefaults: [],
    alerts: []
  });
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchTaxesData();

      if (!cancelled) {
        setTaxData(result);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadTaxData() {
    const result = await fetchTaxesData();
    setTaxData(result);
  }

  async function handleCreateTaxProfile() {
    await createTaxProfile({
      name: `GST ${taxData.profiles.length * 3 + 6}%`,
      cgstRate: 3,
      sgstRate: 3,
      igstRate: 6,
      cessRate: 0,
      isInclusive: false
    });
    await reloadTaxData();
    setStatusMessage("New tax profile added.");
  }

  async function handleCreateTemplate() {
    await createReceiptTemplate({
      name: `Receipt Template ${taxData.receiptTemplates.length + 1}`,
      showQrPayment: true,
      showTaxBreakdown: true,
      footerNote: "Thank you, visit again",
      outletName: "All Outlets"
    });
    await reloadTaxData();
    setStatusMessage("Receipt template added.");
  }

  const activeProfile = taxData.profiles.find((profile) => profile.active) || taxData.profiles[0];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Billing Configuration</p>
          <h2>Print Profile</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={handleCreateTemplate}>
            Add Receipt Template
          </button>
          <button type="button" className="primary-btn" onClick={handleCreateTaxProfile}>
            Add Tax Profile
          </button>
        </div>
      </header>
      {statusMessage ? <section className="panel"><p>{statusMessage}</p></section> : null}

      <section className="print-profile-layout">
        <aside className="print-preview-shell">
          <div className="print-preview-card">
            <div className="print-preview-banner" />
            <div className="print-preview-logo">R</div>
            <div className="print-preview-brand">A2B Kitchens</div>

            <div className="receipt-preview compact">
              <div className="receipt-paper">
                <div className="receipt-header">
                  <strong>A2B Kitchens</strong>
                  <span>12 MG Road, Bengaluru</span>
                  <span>GSTIN: 29ABCDE1234F1Z5</span>
                </div>
                <div className="receipt-line"></div>
                <div className="receipt-row">
                  <span>Green Tea</span>
                  <strong>Rs 22.00</strong>
                </div>
                <div className="receipt-row muted">
                  <span>Reg price</span>
                  <strong>Rs 24.00</strong>
                </div>
                <div className="receipt-row muted">
                  <span>Discount: Item Sale</span>
                  <strong>Rs 1.00</strong>
                </div>
                <div className="receipt-row">
                  <span>Latte</span>
                  <strong>Rs 4.80</strong>
                </div>
                <div className="receipt-row muted">
                  <span>Discount: Whole Purchase</span>
                  <strong>- Rs 2.00</strong>
                </div>
                <div className="receipt-line"></div>
                <div className="receipt-row muted">
                  <span>Subtotal</span>
                  <strong>Rs 7.00</strong>
                </div>
                <div className="receipt-row muted">
                  <span>Tax ({activeProfile?.name || "GST 5%"})</span>
                  <strong>Rs 0.61</strong>
                </div>
                <div className="receipt-row total">
                  <span>Total</span>
                  <strong>Rs 7.61</strong>
                </div>
                <div className="receipt-line"></div>
                <div className="receipt-footer">
                  <span>Credit Card</span>
                  <span>QR payment enabled</span>
                  <span>Thank you, visit again</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="print-settings-column">
          <article className="panel print-settings-panel">
            <div className="panel-head print-profile-head">
              <div>
                <p className="eyebrow">Receipt Settings</p>
                <h3>Branding</h3>
              </div>
            </div>

            <p className="print-profile-note">
              Upload your logo, confirm business identity, and keep the printed receipt simple and
              clear for customers.
            </p>

            <div className="print-brand-card">
              <div className="print-brand-icon">R</div>
              <div className="print-brand-copy">
                <strong>A2B Kitchens</strong>
                <span>Primary receipt logo and business name</span>
              </div>
              <button type="button" className="ghost-chip">
                Edit
              </button>
            </div>
          </article>

          <article className="panel print-settings-panel">
            <div className="panel-head print-profile-head">
              <div>
                <p className="eyebrow">Printed</p>
                <h3>Printed Logo</h3>
              </div>
              <button type="button" className="ghost-btn">
                Collapse
              </button>
            </div>

            <div className="printed-preview-row">
              <div className="printed-preview-box">
                <div className="printed-logo-mark">R</div>
              </div>
              <div className="printed-preview-copy">
                <strong>Black-and-white print preview</strong>
                <span>
                  Printed logos are converted for receipt printers. Test on paper to confirm
                  readability and contrast.
                </span>
              </div>
            </div>
          </article>

          <article className="panel print-settings-panel">
            <div className="panel-head print-profile-head">
              <div>
                <p className="eyebrow">Items and total</p>
                <h3>Receipt Details</h3>
              </div>
              <button type="button" className="ghost-btn">
                Collapse
              </button>
            </div>

            <div className="print-toggle-group">
              <ToggleRow
                title="Show item description"
                description="Display item detail lines under each ordered item when needed."
              />
              <ToggleRow
                title="Show total savings row"
                description="Add a savings summary when more than one discount is applied."
              />
              <ToggleRow
                title="Show cart-level discounts on item level"
                description="Split whole-bill discounts into the item area for easier reading."
                enabled
              />
              <ToggleRow
                title="Show GST breakdown"
                description="Print CGST and SGST separately under subtotal."
                enabled
              />
              <ToggleRow
                title="Show QR payment block"
                description="Display payment QR information on dine-in and takeaway receipts."
                enabled
              />
            </div>
          </article>

          <article className="panel print-settings-panel">
            <div className="panel-head print-profile-head">
              <div>
                <p className="eyebrow">Profile Defaults</p>
                <h3>Billing Setup</h3>
              </div>
            </div>

            <div className="mini-stack">
              {taxData.profiles.map((profile) => (
                <div key={profile.id} className="mini-card">
                  <span>Tax profile</span>
                  <strong>{profile.name}</strong>
                  <span>{profile.summary}</span>
                </div>
              ))}
              {taxData.receiptTemplates.map((template) => (
                <div key={template.id} className="mini-card">
                  <span>Receipt template</span>
                  <strong>{template.name}</strong>
                  <span>{template.outletName || "All Outlets"}</span>
                </div>
              ))}
              <div className="mini-card">
                <span>GST profile</span>
                <strong>{activeProfile?.name || "GST 5%"}</strong>
              </div>
              <div className="mini-card">
                <span>Pricing mode</span>
                <strong>Exclusive tax</strong>
              </div>
              <div className="mini-card">
                <span>Default template</span>
                <strong>Dine-In Standard</strong>
              </div>
              <div className="mini-card">
                <span>Outlet needing review</span>
                <strong>Koramangala</strong>
              </div>
            </div>
          </article>
        </section>
      </section>
    </>
  );
}
