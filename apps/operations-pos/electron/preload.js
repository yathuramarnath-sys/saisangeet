const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  scanPrinters: () => ipcRenderer.invoke("scan-printers"),
  isElectron:   true,
});
