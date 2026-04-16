import { api } from "../../lib/api";

export async function fetchBusinessProfile() {
  try {
    return await api.get("/business-profile");
  } catch (_error) {
    return {};
  }
}

export async function saveBusinessProfile(payload) {
  return api.patch("/business-profile", payload);
}
