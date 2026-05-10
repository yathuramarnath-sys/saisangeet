#!/usr/bin/env node
/**
 * gh-release.js
 * 1. Creates a GitHub Release for the current POS version
 * 2. Uploads Plato-POS-Setup.exe as the download asset
 * 3. Updates ONLY the "pos" key in backend/.data/app-versions.json
 *    — other apps keep their own independent version numbers
 *
 * Usage: node scripts/gh-release.js
 * Or via: npm run release
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const pkg     = require("../package.json");
const version = pkg.version;
const tag     = `v${version}`;
const exePath = path.resolve(__dirname, "../electron-dist/Plato-POS-Setup.exe");
const owner   = "yathuramarnath-sys";
const repo    = "saisangeet";

// Path to backend versions file (relative to this repo)
const versionsFile = path.resolve(__dirname, "../../../backend/.data/app-versions.json");

const GH_DL = `https://github.com/${owner}/${repo}/releases/latest/download`;

if (!fs.existsSync(exePath)) {
  console.error(`[release] ERROR: ${exePath} not found. Run build first.`);
  process.exit(1);
}

// ── 1. Update ONLY the "pos" key in app-versions.json ────────────────────────
//    Other apps (captain, kds, ownerWeb) keep their own version numbers.
console.log(`[release] Updating app-versions.json → pos v${version}…`);
if (!fs.existsSync(path.dirname(versionsFile))) {
  console.error(`[release] ERROR: ${path.dirname(versionsFile)} directory not found.`);
  process.exit(1);
}
const today = new Date().toISOString().split("T")[0];
let existing = {};
try { existing = JSON.parse(fs.readFileSync(versionsFile, "utf8")); } catch { /* first run */ }
const versions = {
  ...existing,
  pos: { version, label: "POS Terminal", downloadUrl: `${GH_DL}/Plato-POS-Setup.exe`, apkUrl: `${GH_DL}/plato-pos.apk`, releaseDate: today },
};
fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2) + "\n");
console.log(`[release] ✓ app-versions.json updated (pos → v${version}, others unchanged)`);

// ── 2. Delete existing tag/release (allow re-release same version) ────────────
try {
  execSync(`gh release delete ${tag} --repo ${owner}/${repo} --yes 2>/dev/null`, { stdio: "ignore" });
  execSync(`git tag -d ${tag} 2>/dev/null`, { stdio: "ignore" });
  execSync(`git push origin :refs/tags/${tag} 2>/dev/null`, { stdio: "ignore" });
} catch { /* ok if not exists */ }

// ── 3. Create GitHub Release ──────────────────────────────────────────────────
console.log(`[release] Creating GitHub Release ${tag}…`);
execSync(
  `gh release create ${tag} "${exePath}" ` +
  `--repo ${owner}/${repo} ` +
  `--title "Plato POS ${version}" ` +
  `--notes "### Plato POS v${version}

Download **Plato-POS-Setup.exe** and install on Windows.

This release updates the POS Terminal. Captain / KDS / Owner Web have independent version numbers." ` +
  `--latest`,
  { stdio: "inherit" }
);

// ── 4. Push updated versions file + tag to git ───────────────────────────────
console.log(`[release] Pushing versions file…`);
try {
  execSync(`git -C "${path.resolve(__dirname, "../../..")}" add backend/.data/app-versions.json`, { stdio: "inherit" });
  execSync(`git -C "${path.resolve(__dirname, "../../..")}" commit -m "chore: bump app-versions to v${version}"`, { stdio: "inherit" });
  execSync(`git -C "${path.resolve(__dirname, "../../..")}" push origin main`, { stdio: "inherit" });
} catch (e) {
  console.warn("[release] Git push skipped:", e.message);
}

console.log(`\n✅ POS v${version} released`);
console.log(`   EXE  : ${GH_DL}/Plato-POS-Setup.exe`);
console.log(`   POS users will see "Update available v${version}" banner automatically.`);
console.log(`   Captain / KDS / Owner Web versions are unchanged.\n`);
