import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/landing.css";
import { App } from "./App.jsx";
import { AdminApp } from "./AdminApp.jsx";

const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </StrictMode>
);
