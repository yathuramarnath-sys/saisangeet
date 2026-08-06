// Stable device ID backed by IndexedDB — survives localStorage clears.
const DB_NAME = "captain_meta";
const STORE   = "kv";
const KEY     = "device_id";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function getStoredDeviceId() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } catch (_) {
    return localStorage.getItem("captain_device_id") || null;
  }
}

export async function storeDeviceId(id) {
  localStorage.setItem("captain_device_id", id);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put(id, KEY);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (_) {}
}
