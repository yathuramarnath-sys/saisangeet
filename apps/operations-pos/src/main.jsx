import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles/app.css";

// Fix iOS double-tap-to-click: adding a touchstart listener makes WebView
// treat all elements as interactive on first tap, even those with :hover styles
document.addEventListener("touchstart", function () {}, { passive: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA install support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
