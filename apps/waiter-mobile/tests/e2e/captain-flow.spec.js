/**
 * Captain App — End-to-End Integration Tests
 *
 * These tests run against the live Vercel preview (or production) captain web app.
 * They exercise the real backend at api.dinexpos.in using a dedicated test outlet.
 *
 * Required env vars (set as GitHub Actions secrets):
 *   CAPTAIN_URL          — e.g. https://captain.dinexpos.in or Vercel preview URL
 *   CAPTAIN_BRANCH_CODE  — test outlet branch code (e.g. KANC-1001-FD5FE320)
 *   CAPTAIN_STAFF_NAME   — staff name to log in as (e.g. Murugan)
 *   CAPTAIN_STAFF_PIN    — 4-digit PIN (e.g. 5546)
 */

import { test, expect } from "@playwright/test";

const BASE_URL   = process.env.CAPTAIN_URL        || "https://captain.dinexpos.in";
const BRANCH     = process.env.CAPTAIN_BRANCH_CODE || "";
const STAFF_NAME = process.env.CAPTAIN_STAFF_NAME  || "";
const STAFF_PIN  = process.env.CAPTAIN_STAFF_PIN   || "";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Clear localStorage so every test starts from a fresh device setup */
async function clearState(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
}

/** Enter branch code on the setup screen and confirm */
async function setupDevice(page) {
  // Wait for setup screen input
  await page.waitForSelector(".su2-input", { timeout: 15000 });
  await page.fill(".su2-input", BRANCH);
  await page.click(".su2-btn");

  // Wait for outlet name to appear (verification succeeded)
  await page.waitForSelector(".su2-outlet", { timeout: 15000 });
  const outletName = await page.textContent(".su2-outlet");
  console.log("  Outlet:", outletName);

  // Confirm setup
  await page.click(".su2-btn");
  return outletName;
}

/** Select staff and enter PIN */
async function login(page) {
  // Wait for staff picker
  await page.waitForSelector(".ls2-who-heading", { timeout: 15000 });

  // Find and click the staff row
  const staffRow = page.locator(".ls2-list-name", { hasText: STAFF_NAME }).first();
  await expect(staffRow).toBeVisible({ timeout: 10000 });
  await staffRow.click();

  // Enter PIN digit by digit on the numpad
  for (const digit of STAFF_PIN) {
    await page.locator(".ls2-key", { hasText: digit }).first().click();
  }

  // Wait for floor plan (login success)
  await page.waitForSelector(".tf2-page", { timeout: 15000 });
}

/** Find the first free table and open it. Returns the table number text. */
async function openFreeTable(page) {
  // Tables are .tf2-card; free tables have data-st="free"
  const freeTables = page.locator('.tf2-card[data-st="free"]');
  const count = await freeTables.count();
  if (count === 0) {
    test.skip(true, "No free tables available in the outlet right now — skipping table flow test");
  }
  const freeTable = freeTables.first();
  await expect(freeTable).toBeVisible({ timeout: 10000 });
  const tableNum = await freeTable.locator(".tf2-table-num").textContent();
  await freeTable.click();

  // Order screen opens
  await page.waitForSelector(".os2-page", { timeout: 10000 });
  console.log("  Opened table:", tableNum?.trim());
  return tableNum?.trim();
}

/** Add the first visible menu item. Returns the item name. */
async function addFirstMenuItem(page) {
  // Open menu browser
  await page.click(".os2-add-btn"); // "Add Items" button
  await page.waitForSelector(".mb2-items", { timeout: 10000 });

  // Find first available item (not unavailable)
  const addBtn = page.locator(".mb2-item:not(.mb2-item-unavail) .mb2-add-btn").first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });

  // Get item name before clicking
  const itemName = await page.locator(".mb2-item:not(.mb2-item-unavail) .mb2-item-name").first().textContent();

  await addBtn.click();

  // Go back to order screen
  await page.locator(".mb2-back-btn, .os2-back-btn, [aria-label='Back']").first().click();
  await page.waitForSelector(".os2-page", { timeout: 10000 });

  console.log("  Added item:", itemName?.trim());
  return itemName?.trim();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("Captain App — Core Flow", () => {

  test.beforeEach(async ({ page }) => {
    test.skip(!BRANCH || !STAFF_NAME || !STAFF_PIN,
      "Skipped: CAPTAIN_BRANCH_CODE / CAPTAIN_STAFF_NAME / CAPTAIN_STAFF_PIN not set");
  });

  // ── 1. Device Setup ──────────────────────────────────────────────────────
  test("1. setup — branch code accepted and outlet name shown", async ({ page }) => {
    await clearState(page);
    const outletName = await setupDevice(page);
    expect(outletName).toBeTruthy();
    expect(outletName?.length).toBeGreaterThan(2);
  });

  // ── 2. Login ─────────────────────────────────────────────────────────────
  test("2. login — staff picker shows captain, PIN accepted", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    // Floor plan is visible
    await expect(page.locator(".tf2-page")).toBeVisible();
  });

  // ── 3. Add Items ─────────────────────────────────────────────────────────
  test("3. order — open table, add item, item appears in unsent list", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    const itemName = await addFirstMenuItem(page);

    // Item should appear in the "NOT SENT YET" section
    await expect(page.locator(".os2-section-unsent")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".os2-item-unsent .os2-item-name").filter({ hasText: itemName })).toBeVisible();

    // "Send to Kitchen" button should be visible
    await expect(page.locator(".os2-kot-btn")).toBeVisible();
  });

  // ── 4. KOT Send ──────────────────────────────────────────────────────────
  test("4. KOT — send to kitchen shows success overlay, not failure toast", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);

    // Send KOT
    await page.click(".os2-kot-btn");

    // Waiter picker may appear — select "None" or the first option
    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      const noneBtn = page.locator(".wp2-row").first();
      await noneBtn.click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    // Success overlay should appear (not error toast)
    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });

    // Must NOT show error toast
    const errorToast = page.locator("[data-testid='toast'], .go3958317564").filter({ hasText: /fail|error|queued/i });
    await expect(errorToast).not.toBeVisible();

    // KOT number shown
    const kotNumEl = page.locator(".kot-ticket-num");
    const hasKotNum = await kotNumEl.isVisible().catch(() => false);
    if (hasKotNum) {
      const kotText = await kotNumEl.textContent();
      console.log("  KOT number shown:", kotText?.trim());
    }
  });

  // ── 5. Item Count After KOT ───────────────────────────────────────────────
  test("5. after KOT — items move to SENT TO KITCHEN section", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");

    // Handle waiter picker
    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      await page.locator(".wp2-row").first().click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    // Wait for success, then close overlay
    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });
    const closeBtn = page.locator(".kot-floor-btn").first();
    if (await closeBtn.isVisible()) await closeBtn.click();

    // Items should now be in SENT TO KITCHEN, not NOT SENT YET
    await expect(page.locator(".os2-section-sent")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".os2-section-unsent")).not.toBeVisible();
    // Send KOT button should be gone (no unsent items)
    await expect(page.locator(".os2-kot-btn")).not.toBeVisible();
  });

  // ── 6. Add More Items After KOT ──────────────────────────────────────────
  test("6. add item after KOT — only new item in unsent, sent items unchanged", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");

    // Handle waiter picker
    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      await page.locator(".wp2-row").first().click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });

    // Click "Add More" if visible, otherwise go back to floor
    const addMoreBtn = page.locator(".kot-addmore-btn").first();
    if (await addMoreBtn.isVisible().catch(() => false)) {
      await addMoreBtn.click();
    } else {
      const closeBtn = page.locator(".kot-floor-btn").first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // Add a second item
    await page.waitForSelector(".os2-page", { timeout: 10000 });
    await addFirstMenuItem(page);

    // Unsent section should have exactly 1 item
    const unsentItems = page.locator(".os2-item-unsent");
    await expect(unsentItems).toHaveCount(1, { timeout: 5000 });

    // Sent section should also have items (from first KOT)
    await expect(page.locator(".os2-section-sent")).toBeVisible();
  });

  // ── 7. Occupied Table — tap opens order screen ───────────────────────────
  test("7. occupied table — tap opens order screen with sent items", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");

    // Handle waiter picker
    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      await page.locator(".wp2-row").first().click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    // Wait for success then go back to floor
    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });

    // Table should now be occupied (running or ordering)
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 5000 });

    // Regular tap → opens order screen for that table
    await occupiedTable.click();
    await page.waitForSelector(".os2-page", { timeout: 10000 });

    // Sent items should be visible (the KOT we just sent)
    await expect(page.locator(".os2-section-sent")).toBeVisible({ timeout: 5000 });
    console.log("  Occupied table tap: order screen opened with sent items ✓");
  });

  // ── 8. Action Sheet — long press on occupied table ───────────────────────
  test("8. action sheet — long press shows Print Bill and Move Table options", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");

    // Handle waiter picker
    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      await page.locator(".wp2-row").first().click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    // Go back to floor
    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });

    // Long press on occupied table (mousedown hold 600ms → fires onLongPress at 500ms)
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 5000 });
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    // Action sheet should slide up
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Print Bill row visible (table has sent items so billable.length > 0)
    await expect(page.locator(".tas2-row-label", { hasText: "Print Bill" })).toBeVisible();
    // Move Table always visible
    await expect(page.locator(".tas2-row-label", { hasText: "Move table" })).toBeVisible();
    // Cancel button always present
    await expect(page.locator(".tas2-cancel")).toBeVisible();

    console.log("  Action sheet: Print Bill and Move table rows confirmed ✓");
  });

  // ── 9. Action Sheet — cancel dismisses it ────────────────────────────────
  test("9. action sheet — cancel button dismisses sheet, floor stays visible", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");

    const waiterPickerVisible = await page.locator(".wp2-modal").isVisible().catch(() => false);
    if (waiterPickerVisible) {
      await page.locator(".wp2-row").first().click();
      const confirmBtn = page.locator(".wp2-done").first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
    }

    await page.waitForSelector(".kot-success-page, .kot-overlay", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });

    // Long press to open action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Cancel dismisses the sheet
    await page.click(".tas2-cancel");
    await expect(page.locator(".tas2-sheet")).not.toBeVisible({ timeout: 3000 });

    // Floor plan still visible
    await expect(page.locator(".tf2-page")).toBeVisible();
    console.log("  Action sheet cancel: sheet dismissed, floor restored ✓");
  });

  // ── 10. Wrong PIN Rejected ────────────────────────────────────────────────
  test("10. login — wrong PIN shows error, does not navigate to floor", async ({ page }) => {
    await clearState(page);
    await setupDevice(page);

    await page.waitForSelector(".ls2-who-heading", { timeout: 15000 });
    const staffRow = page.locator(".ls2-list-name", { hasText: STAFF_NAME }).first();
    await expect(staffRow).toBeVisible({ timeout: 10000 });
    await staffRow.click();

    // Enter wrong PIN
    for (const digit of "0000") {
      await page.locator(".ls2-key", { hasText: digit }).first().click();
    }

    // Error state should appear — error label text
    await expect(page.locator(".ls2-pin-label-error")).toBeVisible({ timeout: 5000 });
    // Floor plan must NOT appear
    await expect(page.locator(".tf2-page")).not.toBeVisible();
  });

  // ── 11. Invalid Branch Code ───────────────────────────────────────────────
  test("11. setup — invalid branch code shows error", async ({ page }) => {
    await clearState(page);
    await page.waitForSelector(".su2-input", { timeout: 15000 });
    await page.fill(".su2-input", "XXXX-INVALID-CODE");
    await page.click(".su2-btn");

    await expect(page.locator(".su2-error")).toBeVisible({ timeout: 10000 });
  });

});
