import { api } from "../../lib/api";

export async function fetchBusinessProfile() {
  return api.get("/business-profile");
}

export async function saveBusinessProfile(payload) {
  return api.patch("/business-profile", payload);
}
