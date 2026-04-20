const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

function getStations() {
  return (getOwnerSetupData().menu?.stations || []);
}

async function listKitchenStations() {
  return getStations();
}

async function createKitchenStation({ name, outletId, categories }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw Object.assign(new Error("Station name is required."), { status: 400 });

  const station = {
    id:         `station-${Date.now()}`,
    name:       trimmed,
    outletId:   outletId || "all",
    categories: Array.isArray(categories) ? categories : []
  };

  updateOwnerSetupData((data) => ({
    ...data,
    menu: {
      ...data.menu,
      stations: [...(data.menu?.stations || []), station]
    }
  }));

  return station;
}

async function updateKitchenStation(id, { name, outletId, categories }) {
  let updated = null;

  updateOwnerSetupData((data) => {
    const stations = (data.menu?.stations || []).map((s) => {
      if (s.id !== id) return s;
      updated = {
        ...s,
        ...(name      !== undefined && { name:       String(name).trim() }),
        ...(outletId  !== undefined && { outletId }),
        ...(categories !== undefined && { categories: Array.isArray(categories) ? categories : [] })
      };
      return updated;
    });
    return { ...data, menu: { ...data.menu, stations } };
  });

  if (!updated) throw Object.assign(new Error("Station not found."), { status: 404 });
  return updated;
}

async function deleteKitchenStation(id) {
  let found = false;

  updateOwnerSetupData((data) => {
    const stations = (data.menu?.stations || []).filter((s) => {
      if (s.id === id) { found = true; return false; }
      return true;
    });
    return { ...data, menu: { ...data.menu, stations } };
  });

  if (!found) throw Object.assign(new Error("Station not found."), { status: 404 });
  return { ok: true };
}

module.exports = {
  listKitchenStations,
  createKitchenStation,
  updateKitchenStation,
  deleteKitchenStation
};
