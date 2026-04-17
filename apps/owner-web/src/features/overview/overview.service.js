import { api } from "../../lib/api";

export async function fetchOverviewData() {
  const [appConfig, reportSummary] = await Promise.all([
    api.get("/setup/app-config"),
    api.get("/reports/owner-summary").catch(() => null)
  ]);

  return {
    appConfig,
    reportSummary
  };
}
