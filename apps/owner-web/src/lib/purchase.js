import { api } from "./api";

/**
 * Open Plato Purchase & Expenses (separate app) in a new tab, already logged in.
 * Same as Attendance: open the tab inside the click (pop-up blockers), then load the
 * one-time login link into it.
 */
export async function openPurchase() {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.document.title = "Opening Purchase…";
    tab.document.body.style.fontFamily = "sans-serif";
    tab.document.body.textContent = "Opening Plato Purchase & Expenses…";
  }
  try {
    const { url } = await api.post("/purchase/sso-ticket", {});
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      window.location.href = url;
    }
  } catch (err) {
    if (tab) tab.close();
    window.alert(err.message || "Could not open Purchase. Please try again.");
  }
}
