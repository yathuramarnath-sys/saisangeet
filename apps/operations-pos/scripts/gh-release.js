#!/usr/bin/env node
/**
 * gh-release.js
 * Creates a GitHub Release for the current version and uploads
 * Plato-POS-Setup.exe so the owner-web Download button always
 * serves the latest installer.
 *
 * Usage: node scripts/gh-release.js
 * Or via: npm run release
 */

const { execSync } = require("child_process");
const fs  = require("fs");
const pkg = require("../package.json");

const version  = pkg.version;
const tag      = `v${version}`;
const exePath  = `${__dirname}/../electron-dist/Plato-POS-Setup.exe`;
const owner    = "yathuramarnath-sys";
const repo     = "saisangeet";

if (!fs.existsSync(exePath)) {
  console.error(`[release] ERROR: ${exePath} not found. Run build first.`);
  process.exit(1);
}

console.log(`[release] Creating GitHub Release ${tag}…`);

// Delete existing tag/release if it exists (so we can re-release same version)
try {
  execSync(`gh release delete ${tag} --repo ${owner}/${repo} --yes 2>/dev/null`, { stdio: "ignore" });
  execSync(`git tag -d ${tag} 2>/dev/null`, { stdio: "ignore" });
  execSync(`git push origin :refs/tags/${tag} 2>/dev/null`, { stdio: "ignore" });
} catch { /* ok if not exists */ }

// Create release and upload the exe
execSync(
  `gh release create ${tag} "${exePath}" ` +
  `--repo ${owner}/${repo} ` +
  `--title "Plato POS ${version}" ` +
  `--notes "POS Terminal v${version} — download and install on Windows." ` +
  `--latest`,
  { stdio: "inherit" }
);

console.log(`[release] ✓ Released v${version}`);
console.log(`[release] Download URL: https://github.com/${owner}/${repo}/releases/latest/download/Plato-POS-Setup.exe`);
