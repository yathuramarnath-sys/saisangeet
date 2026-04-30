import React from "react";
import ReactDOM from "react-dom/client";

import { initSentry } from "./lib/sentry";
import { App } from "./App";
import "./styles/app.css";

// Init Sentry before rendering — captures errors from the very first render
initSentry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
