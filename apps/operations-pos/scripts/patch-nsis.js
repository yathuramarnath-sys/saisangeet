/**
 * patch-nsis.js — patches electron-builder NSIS templates to remove
 * the "cannot be closed" blocking dialogs from the Windows installer.
 *
 * Two sources patched:
 *   1. allowOnlyOneInstallerInstance.nsh — _CHECK_APP_RUNNING made no-op
 *   2. installUtil.nsh               — old-uninstaller retry dialog removed
 *
 * Run automatically before every Windows build via the "prerelease" script.
 * Also run manually: node scripts/patch-nsis.js
 */

const fs = require("fs");
const path = require("path");

const nsisIncludeDir = path.join(
  __dirname,
  "../../..",
  "node_modules/app-builder-lib/templates/nsis/include"
);

// ── Patch 1: allowOnlyOneInstallerInstance.nsh ─────────────────────────────
const checkAppFile = path.join(nsisIncludeDir, "allowOnlyOneInstallerInstance.nsh");
let checkApp = fs.readFileSync(checkAppFile, "utf8");

// Check if already patched
if (!checkApp.includes("; patched — skip process check")) {
  // Replace the entire _CHECK_APP_RUNNING macro body with a no-op
  checkApp = checkApp.replace(
    /!macro _CHECK_APP_RUNNING[\s\S]*?!macroend/,
    `; _CHECK_APP_RUNNING patched for Plato POS:\n; Process check removed entirely — installer kills the app before this runs.\n!macro _CHECK_APP_RUNNING\n  ; patched — skip process check\n!macroend`
  );
  fs.writeFileSync(checkAppFile, checkApp, "utf8");
  console.log("[patch-nsis] ✓ allowOnlyOneInstallerInstance.nsh patched");
} else {
  console.log("[patch-nsis] ✓ allowOnlyOneInstallerInstance.nsh already patched");
}

// ── Patch 2: installUtil.nsh ───────────────────────────────────────────────
const installUtilFile = path.join(nsisIncludeDir, "installUtil.nsh");
let installUtil = fs.readFileSync(installUtilFile, "utf8");

if (!installUtil.includes("; patched — skip")) {
  // Remove dialog AND the now-unused OneMoreAttempt: label
  installUtil = installUtil.replace(
    /MessageBox MB_RETRYCANCEL\|MB_ICONEXCLAMATION "\$\(appCannotBeClosed\)" \/SD IDCANCEL IDRETRY OneMoreAttempt\s*\n\s*Return\s*\n\s*\$\{endIf\}\s*\n\s*OneMoreAttempt:/,
    `; patched — skip "cannot be closed" dialog, silently continue with new install\n      Return\n    \${endIf}\n`
  );
  fs.writeFileSync(installUtilFile, installUtil, "utf8");
  console.log("[patch-nsis] ✓ installUtil.nsh patched");
} else {
  console.log("[patch-nsis] ✓ installUtil.nsh already patched");
}

console.log("[patch-nsis] Done — NSIS templates ready for build");
