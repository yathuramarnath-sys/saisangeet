/**
 * LegalApp — Privacy Policy, Terms of Service, Refund & Cancellation Policy, Contact.
 * Routes: /privacy (/privacy-policy), /terms (/terms-and-conditions, /terms-of-service),
 *         /refund-policy (/refund, /cancellation, /cancellation-policy), /contact
 * Required by Meta business verification (WhatsApp) and Razorpay.
 */

import { COMPANY as C, COMPANY_INCOMPLETE } from "./company";
import "./legal.css";

const ROUTES = {
  "/privacy": "privacy", "/privacy-policy": "privacy",
  "/terms": "terms", "/terms-and-conditions": "terms", "/terms-of-service": "terms",
  "/refund-policy": "refund", "/refund": "refund", "/cancellation": "refund", "/cancellation-policy": "refund",
  "/contact": "contact", "/contact-us": "contact",
};

export function legalPageFor(pathname) {
  return ROUTES[pathname.replace(/\/+$/, "") || "/"] || null;
}

const owner = `${C.legalName}${C.tradeName ? ` (trading as ${C.tradeName})` : ""}`;

function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="lg-updated">Last updated: {C.updated}</p>
      <p>
        {C.brand} ("{C.brand}", "we", "us") is a restaurant software platform operated by <strong>{owner}</strong>,
        a {C.structure.toLowerCase()} registered in {C.state}, India (GSTIN {C.gstin}). This policy explains what
        personal data we collect through {C.website}, the {C.brand} apps (POS, Captain, Kitchen, Owner) and the
        online ordering pages we host for restaurants, why we collect it, and your rights under the Digital
        Personal Data Protection Act, 2023.
      </p>

      <h2>Who this covers</h2>
      <ul>
        <li><strong>Restaurant owners and staff</strong> who use {C.brand} to run their business.</li>
        <li><strong>Customers of restaurants</strong> who order food through a restaurant's {C.brand} ordering page
          (for example <code>restaurant-name.dinexpos.in</code>) or are billed at a restaurant that uses {C.brand}.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, phone number and business details of restaurant owners and staff.</li>
        <li><strong>Customer details for orders:</strong> name, mobile number (verified by a one-time password), delivery
          address and map location you choose to share, order history and preferences such as cooking instructions.</li>
        <li><strong>Payment details:</strong> online payments are processed by Razorpay. We receive the payment status,
          amount and reference number. We do not see or store card numbers, UPI PINs or bank passwords.</li>
        <li><strong>Technical data:</strong> device and browser type, IP address and error logs, used to keep the service secure and working.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To take, prepare, deliver and bill orders, and to show you the status of your order.</li>
        <li>To verify your phone number and send order messages (OTP, order confirmation, status updates) by SMS or WhatsApp.</li>
        <li>To remember your details so your next order is faster.</li>
        <li>To process payments and refunds, and to keep records required by tax law.</li>
        <li>To provide support, prevent fraud and improve the service.</li>
      </ul>
      <p>We do not sell personal data. We do not send marketing messages without your consent.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>The restaurant you order from</strong> receives your name, phone, address and order so it can fulfil it.
          Each restaurant is responsible for how it uses that information.</li>
        <li><strong>Service providers</strong> who run parts of the service for us: Razorpay (payments), Meta Platforms /
          WhatsApp (messages), cloud hosting and error monitoring providers. They may only use the data to provide their service.</li>
        <li><strong>Authorities</strong> when required by law.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Order and billing records are kept as long as tax and accounting law requires (generally 8 years). Customer
        profiles are kept while you keep ordering and deleted on request, except records we must keep by law.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your personal data, or withdraw consent for messages, by writing to{" "}
        <a href={`mailto:${C.email}`}>{C.email}</a>. We respond within 30 days.
      </p>

      <h2>Security</h2>
      <p>Data is sent over encrypted connections (HTTPS) and access is limited to people who need it to run the service.</p>

      <h2>Grievance Officer</h2>
      <p>
        {C.grievanceOfficer}<br />
        {C.address}<br />
        Email: <a href={`mailto:${C.email}`}>{C.email}</a> · Phone: {C.phone}
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="lg-updated">Last updated: {C.updated}</p>
      <p>
        These terms govern the use of {C.brand}, provided by <strong>{owner}</strong> (GSTIN {C.gstin}), {C.address}.
        By using {C.brand} you agree to them.
      </p>

      <h2>1. What {C.brand} is</h2>
      <p>
        {C.brand} is software for restaurants: billing (POS), waiter ordering, kitchen display, owner reports and an
        online ordering page for each restaurant's own customers. {C.brand} provides technology only. It does not
        cook, sell or deliver food.
      </p>

      <h2>2. Restaurants using {C.brand}</h2>
      <ul>
        <li>Restaurants pay the subscription shown on our pricing page, and for online-paid orders a platform fee of
          ₹10 per order plus payment gateway charges, which are deducted before the order amount is settled to them.</li>
        <li>Each restaurant is responsible for its menu, prices, taxes, food quality, licences (including FSSAI),
          GST invoices and the accuracy of what it publishes on its ordering page.</li>
        <li>Restaurants must keep their login details secure and use {C.brand} lawfully.</li>
      </ul>

      <h2>3. Customers ordering from a restaurant</h2>
      <ul>
        <li>When you order through a restaurant's {C.brand} ordering page, <strong>your contract for the food is with
          that restaurant</strong>. Its name, address and GSTIN are shown on the page and at checkout, and the
          payment is made to that restaurant.</li>
        <li>The restaurant may accept or reject an order. Delivery times shown are estimates.</li>
        <li>Prices include the taxes and charges shown at checkout (packing, delivery) before you pay.</li>
        <li>Complaints about food or service should go to the restaurant first; we will help if you contact us.</li>
      </ul>

      <h2>4. Payments</h2>
      <p>
        Online payments are processed by Razorpay Software Private Limited under its terms. Refunds follow our{" "}
        <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Do not misuse the service: no false orders, fraud, attempts to break security, or copying of the software.</p>

      <h2>6. Availability and liability</h2>
      <p>
        We work to keep {C.brand} available but cannot promise it will never be interrupted. To the extent the law
        allows, our liability for any claim is limited to the fees paid to us for the service in the three months
        before the claim. We are not liable for food prepared or delivered by restaurants.
      </p>

      <h2>7. Changes and termination</h2>
      <p>
        We may update these terms; the date above shows the latest version. Restaurants may stop their subscription
        at any time. We may suspend accounts that break these terms.
      </p>

      <h2>8. Law and disputes</h2>
      <p>These terms are governed by the laws of India. Courts in {C.state} have jurisdiction.</p>

      <h2>Contact</h2>
      <p><a href={`mailto:${C.email}`}>{C.email}</a> · {C.phone}</p>
    </>
  );
}

function Refund() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p className="lg-updated">Last updated: {C.updated}</p>
      <p>This policy covers food orders placed through {C.brand} ordering pages and {C.brand} software subscriptions.</p>

      <h2>Food orders (customers)</h2>
      <ul>
        <li><strong>Cancelled by the restaurant:</strong> if the restaurant rejects or cannot fulfil your order, the full
          amount paid online is refunded automatically to the original payment method.</li>
        <li><strong>Cancelled by you:</strong> you can cancel free of charge until the restaurant accepts the order by
          calling the restaurant (its number is on your order page). Once the restaurant has started preparing the
          food, cancellation and any refund are at the restaurant's discretion.</li>
        <li><strong>Wrong, missing or poor-quality items:</strong> contact the restaurant or us within 24 hours with your
          order number. Where the restaurant agrees, a full or partial refund is issued to the original payment method.</li>
        <li><strong>Cash / pay-at-counter orders:</strong> no online refund applies; settle any issue with the restaurant.</li>
        <li><strong>Refund time:</strong> refunds are started within 1 working day of approval and usually reach your
          account in 5–7 working days, depending on your bank.</li>
      </ul>

      <h2>{C.brand} subscriptions (restaurants)</h2>
      <ul>
        <li>New accounts start with a free trial; no payment is taken during the trial.</li>
        <li>Subscriptions can be cancelled any time from Billing &amp; Plans and stay active until the end of the paid period.</li>
        <li>Subscription fees already paid are not refunded, except for a duplicate or wrong charge, which we refund in
          full within 7 working days of being told.</li>
      </ul>

      <h2>How to ask for a refund</h2>
      <p>
        Email <a href={`mailto:${C.email}`}>{C.email}</a> or call {C.phone} with your order number or payment reference.
      </p>
    </>
  );
}

function Contact() {
  return (
    <>
      <h1>Contact Us</h1>
      <div className="lg-card">
        <p><strong>{C.brand}</strong> is a brand of <strong>{owner}</strong> ({C.structure}).</p>
        <dl>
          <dt>GSTIN</dt><dd>{C.gstin}</dd>
          <dt>Address</dt><dd>{C.address}</dd>
          <dt>Email</dt><dd><a href={`mailto:${C.email}`}>{C.email}</a></dd>
          <dt>Phone</dt><dd>{C.phone}</dd>
          <dt>Hours</dt><dd>Monday – Saturday, 10 am – 7 pm IST</dd>
        </dl>
      </div>
      <p>
        For an order placed with a restaurant, please contact that restaurant first — its phone number is on your
        order page. For anything about {C.brand}, payments or your data, write to us and we reply within 2 working days.
      </p>
    </>
  );
}

const PAGES = { privacy: Privacy, terms: Terms, refund: Refund, contact: Contact };
const TITLES = { privacy: "Privacy Policy", terms: "Terms of Service", refund: "Refund & Cancellation Policy", contact: "Contact Us" };

export function LegalFooterLinks({ className = "" }) {
  return (
    <span className={className}>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/refund-policy">Refund &amp; Cancellation</a>
      <a href="/contact">Contact</a>
    </span>
  );
}

export function LegalApp({ page }) {
  const Page = PAGES[page];
  document.title = `${TITLES[page]} — ${C.brand}`;
  return (
    <div className="lg-page">
      <header className="lg-head">
        <a href="/" className="lg-brand">{C.brand}</a>
        <nav aria-label="Policies"><LegalFooterLinks className="lg-nav" /></nav>
      </header>
      {COMPANY_INCOMPLETE && import.meta.env.DEV && (
        <p className="lg-todo">Company details are incomplete — fill in src/legal/company.js before publishing.</p>
      )}
      <main className="lg-main"><Page /></main>
      <footer className="lg-foot">
        © 2026 {C.brand} — a brand of {owner} · GSTIN {C.gstin}
      </footer>
    </div>
  );
}
