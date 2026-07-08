import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { avatarBg } from "./LoginScreen";

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function CustomerInfoSheet({ tableNumber, guestInfo = {}, onSave, onClose }) {
  const [phone, setPhone] = useState(guestInfo.phone || "");

  const hasProfile = !!(guestInfo.name);

  function handleAttach() {
    tapImpact();
    onSave({ ...guestInfo, phone: phone.trim() });
    onClose();
  }

  return (
    <div className="cust3-page">
      {/* Header */}
      <div className="cust3-header">
        <button className="cust3-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="cust3-header-text">
          <h2 className="cust3-title">Customer</h2>
          <p className="cust3-subtitle">Table {tableNumber}</p>
        </div>
      </div>

      <div className="cust3-scroll">
        {/* Phone input */}
        <div className="cust3-phone-card">
          <span className="cust3-phone-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.13 6.13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z"/>
            </svg>
          </span>
          <input
            className="cust3-phone-input"
            type="tel"
            inputMode="tel"
            placeholder="+91 phone number"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ""))}
          />
          {(phone.length >= 10 || guestInfo.phone) && (
            <span className="cust3-phone-check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </span>
          )}
        </div>

        {/* Customer profile card — shown when a customer is linked */}
        {hasProfile && (
          <div className="cust3-profile-card">
            <div
              className="cust3-avatar"
              style={{ background: avatarBg(guestInfo.name), color: "#fff" }}
            >
              {initials(guestInfo.name)}
            </div>
            <div className="cust3-profile-info">
              <span className="cust3-profile-name">{guestInfo.name}</span>
              <span className="cust3-profile-sub">
                {guestInfo.visits ? `${guestInfo.visits} visits` : ""}
                {guestInfo.visits && guestInfo.lifetimeSpend ? " · " : ""}
                {guestInfo.lifetimeSpend ? `₹${guestInfo.lifetimeSpend.toLocaleString("en-IN")} lifetime` : ""}
                {!guestInfo.visits && !guestInfo.lifetimeSpend && (guestInfo.pax ? `${guestInfo.pax} guests` : "Regular customer")}
              </span>
            </div>
          </div>
        )}

        {/* Tags section */}
        {(guestInfo.tags?.length > 0 || hasProfile) && (
          <>
            <span className="cust3-section-label">TAGS</span>
            <div className="cust3-tags">
              {(guestInfo.tags || []).map((tag, i) => (
                <span key={i} className={`cust3-tag cust3-tag-plain`}>{tag}</span>
              ))}
              {guestInfo.note && (
                <span className="cust3-tag cust3-tag-plain">{guestInfo.note}</span>
              )}
              {!guestInfo.tags?.length && !guestInfo.note && (
                <span className="cust3-tag cust3-tag-add">+ Add tag</span>
              )}
            </div>
          </>
        )}

        {/* Recent orders section */}
        {guestInfo.recentOrders?.length > 0 && (
          <>
            <span className="cust3-section-label">RECENT ORDERS</span>
            <div className="cust3-orders-card">
              {guestInfo.recentOrders.map((order, i) => (
                <div key={i} className="cust3-order-row">
                  <div className="cust3-order-left">
                    <span className="cust3-order-items">{order.summary}</span>
                    <span className="cust3-order-meta">{order.when} · {order.table}</span>
                  </div>
                  <span className="cust3-order-amount">₹{order.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom attach button */}
      <div className="cust3-bottom">
        <button className="cust3-attach-btn" onClick={handleAttach}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          Attach to table
        </button>
      </div>
    </div>
  );
}
