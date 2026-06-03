/**
 * afterPack hook — runs after electron-builder packages the app.
 * Disables the ASAR integrity fuse so the app starts correctly on Windows
 * when built from Apple Silicon Mac (where rcedit/wine can't embed the hash).
 */
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const path = require("path");

module.exports = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;

  // Only needed for Windows builds
  if (platform !== "windows") return;

  // productFilename may have spaces — handle both x64 and ia32 unpacked dirs
  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);

  console.log(`[afterPack] Flipping fuses for: ${exePath}`);

  try {
    await flipFuses(exePath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    });
    console.log("[afterPack] ASAR integrity fuse disabled — app will start correctly.");
  } catch (err) {
    // Non-fatal — log and continue. App may still work without this.
    console.warn("[afterPack] flipFuses failed (non-fatal):", err.message);
  }
};
