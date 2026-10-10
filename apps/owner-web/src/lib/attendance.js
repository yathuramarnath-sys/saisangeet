import { api } from "./api";

/**
 * Open Plato Attendance (separate app) in a new tab, already logged in.
 * The tab is opened first (synchronously, inside the click) so pop-up blockers
 * allow it; the one-time login ticket is fetched and then loaded into it.
 */
export async function openAttendance() {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.document.title = "Opening Attendance…";
    tab.document.body.style.fontFamily = "sans-serif";
    tab.document.body.textContent = "Opening Plato Attendance…";
  }
  try {
    const { url } = await api.post("/attendance/sso-ticket", {});
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      window.location.href = url; // pop-up blocked: open in this tab instead
    }
  } catch (err) {
    if (tab) tab.close();
    window.alert(err.message || "Could not open Attendance. Please try again.");
  }
}
