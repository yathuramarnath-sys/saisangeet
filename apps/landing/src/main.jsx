import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/landing.css";
import { App } from "./App.jsx";
import { AdminApp } from "./AdminApp.jsx";
import { LegalApp, legalPageFor } from "./legal/LegalApp.jsx";

const path      = window.location.pathname;
const isAdmin   = path.startsWith("/admin");
const legalPage = legalPageFor(path);   // /privacy, /terms, /refund-policy, /contact

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isAdmin ? <AdminApp /> : legalPage ? <LegalApp page={legalPage} /> : <App />}
  </StrictMode>
);
