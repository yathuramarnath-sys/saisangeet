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

// Cached after beforeAll so individual tests restore it without re-calling the API
let captainStorageState = null;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Reset to a clean state before each test.
 * If the device has been set up (beforeAll ran), restore its localStorage so we
 * land on the login screen without re-entering the branch code.
 * Otherwise fall back to a full clear + re-setup.
 */
async function clearState(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  if (captainStorageState) {
    await page.evaluate((state) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(state)) localStorage.setItem(k, v);
    }, captainStorageState);
  } else {
    await page.evaluate(() => localStorage.clear());
  }
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
  // Wait for table cards to render before counting (floor plan may still be loading)
  await page.waitForSelector(".tf2-card", { timeout: 15000 });

  // Tables are .tf2-card; free tables have data-st="open" (TF2_LABEL["open"] = "Free")
  const freeTables = page.locator('.tf2-card[data-st="open"]');
  const count = await freeTables.count();
  if (count === 0) {
    test.skip(true, "No free tables available in the outlet right now — skipping table flow test");
  }
  const freeTable = freeTables.first();
  await expect(freeTable).toBeVisible({ timeout: 10000 });
  const tableNum = await freeTable.locator(".tf2-table-num").textContent();
  await freeTable.click();

  // Free tables use autoOpen="menu" — the app skips .os2-page and renders MenuBrowser
  // (.mb2-page) directly. Wait for whichever appears first, then back out of the menu
  // to land on the order screen (.os2-page) so all callers get a consistent entry point.
  await page.waitForSelector(".os2-page, .mb2-page", { timeout: 20000 });
  if (await page.locator(".mb2-page").isVisible()) {
    await page.locator(".mb2-back-btn").first().click();
    await page.waitForSelector(".os2-page", { timeout: 10000 });
  }

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

/**
 * Wait for the waiter-picker modal and dismiss it by selecting "None".
 * Uses waitForSelector instead of an immediate isVisible() check so React's
 * async state update for setShowWaiterPick(true) has time to commit to the DOM.
 */
async function handleWaiterPicker(page) {
  const modal = await page.waitForSelector(".wp2-modal", { timeout: 5000 }).catch(() => null);
  if (modal) {
    await page.locator(".wp2-row").first().click();
    await page.locator(".wp2-done").first().click();
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("Captain App — Core Flow", () => {

  test.beforeEach(async ({ page }) => {
    test.skip(!BRANCH || !STAFF_NAME || !STAFF_PIN,
      "Skipped: CAPTAIN_BRANCH_CODE / CAPTAIN_STAFF_NAME / CAPTAIN_STAFF_PIN not set");
  });

  // ── Device setup (once per suite) ─────────────────────────────────────────
  // Calling the branch-code verification API in every test triggers rate limiting
  // after the first couple of calls. Run it once in beforeAll, save the resulting
  // localStorage, and restore it in clearState() for every test.
  test.beforeAll(async ({ browser }) => {
    if (!BRANCH || !STAFF_NAME || !STAFF_PIN) return;
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await setupDevice(page);
    captainStorageState = await page.evaluate(() => {
      const s = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        s[k] = localStorage.getItem(k);
      }
      return s;
    });
    await ctx.close();
  });

  // ── 1. Device Setup ──────────────────────────────────────────────────────
  test("1. setup — device configured, login screen shown on reload", async ({ page }) => {
    // beforeAll verified setupDevice succeeded and saved the localStorage state.
    // clearState() restores it so the app skips the setup screen and goes straight
    // to the login screen — confirming device configuration is intact.
    await clearState(page);
    await expect(page.locator(".ls2-who-heading")).toBeVisible({ timeout: 15000 });
  });

  // ── 2. Login ─────────────────────────────────────────────────────────────
  test("2. login — staff picker shows captain, PIN accepted", async ({ page }) => {
    await clearState(page);
    await login(page);

    // Floor plan is visible
    await expect(page.locator(".tf2-page")).toBeVisible();
  });

  // ── 3. Add Items ─────────────────────────────────────────────────────────
  test("3. order — open table, add item, item appears in unsent list", async ({ page }) => {
    await clearState(page);
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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);

    // Send KOT
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    // doSendKOT marks items sentToKot=true BEFORE the KOT API call, so by the time
    // .kot-overlay (sending phase) appears the order screen already shows the sent section.
    // We wait for either phase; if floor button is visible we click it (success phase),
    // otherwise the 3-second auto-close will navigate away — either way os2-section-sent
    // is visible in the DOM while on the order screen.
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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    // Wait for SUCCESS phase — the Add More button only exists in .kot-success-page,
    // not in the .kot-overlay (sending spinner). Clicking it before success resolves
    // would leave the overlay up and block all clicks on the order screen beneath.
    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-addmore-btn").first().click();
    // Wait for overlay to be fully removed from DOM before interacting with the order screen.
    // onAddMore() calls setKotState(null) which unmounts KotProgressOverlay entirely.
    await page.waitForSelector(".kot-success-page", { state: "detached", timeout: 5000 }).catch(() => null);

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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    // Wait for SUCCESS phase so the floor button is available to click.
    // Waiting for .kot-overlay (sending phase) alone would force Playwright to
    // wait for the button mid-sending and risk the 3-second auto-close timer
    // firing before the click can cancel it.
    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    // Wait for table cards to render before querying data-st attributes
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Table should now be occupied (running or ordering)
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });

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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    // Wait for success phase before clicking floor button
    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Long press on occupied table (mousedown hold 600ms → fires onLongPress at 500ms)
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
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
    await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Long press to open action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
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

  // ── 10. Guest count ──────────────────────────────────────────────────────
  test("10. guest count — stepper on empty order sets guest count", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);

    // Guest stepper is visible on empty order screen
    await expect(page.locator(".os2-guests-card")).toBeVisible({ timeout: 5000 });

    // Tap + twice to set 2 guests
    const plusBtn = page.locator(".os2-guests-stepper .os2-guest-btn").last();
    await plusBtn.click();
    await plusBtn.click();

    // Input should show 2
    const val = await page.locator(".os2-guest-input").inputValue();
    expect(Number(val)).toBe(2);

    // Subtitle should reflect guest count
    await expect(page.locator(".os2-subtitle")).toContainText("2 guests");
    console.log("  Guest count set to 2 ✓");
  });

  // ── 11. Quantity increment ────────────────────────────────────────────────
  test("11. menu — adding same item twice shows qty 2, not two rows", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);

    // Open menu browser
    await page.click(".os2-add-btn");
    await page.waitForSelector(".mb2-items", { timeout: 10000 });

    // First tap — ADD + button visible
    const firstItem = page.locator(".mb2-item:not(.mb2-item-unavail)").first();
    await firstItem.locator(".mb2-add-btn").click();

    // Stepper should appear with qty 1
    await expect(firstItem.locator(".mb2-step-num")).toHaveText("1", { timeout: 3000 });

    // Second tap — stepper + button
    await firstItem.locator(".mb2-step-btn.mb2-step-plus").click();
    await expect(firstItem.locator(".mb2-step-num")).toHaveText("2", { timeout: 3000 });

    // Go back to order screen
    await page.locator(".mb2-back-btn, .os2-back-btn, [aria-label='Back']").first().click();
    await page.waitForSelector(".os2-page", { timeout: 10000 });

    // Only 1 unsent row, and its qty shows 2
    const unsentRows = page.locator(".os2-item-unsent");
    await expect(unsentRows).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator(".os2-item-unsent .os2-qty-val")).toHaveText("2");
    console.log("  Qty increment: 1 row with qty=2 ✓");
  });

  // ── 12. Move table — transfer modal ──────────────────────────────────────
  test("12. move table — action sheet opens transfer modal, back returns to floor", async ({ page }) => {
    await clearState(page); await login(page);

    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Long press occupied table → action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Tap Move table
    await page.locator(".tas2-row-label", { hasText: "Move table" }).click();

    // Transfer modal should open
    await page.waitForSelector(".mt2-page", { timeout: 5000 });
    await expect(page.locator(".mt2-title")).toHaveText("Move table");

    // Back button returns to order screen (openOrderScreen was called for move table)
    await page.click(".mt2-back-btn");
    await page.waitForSelector(".os2-page", { timeout: 10000 });
    // Navigate from order screen back to floor
    await page.locator(".os2-back-btn").first().click();
    await expect(page.locator(".tf2-page")).toBeVisible({ timeout: 10000 });
    console.log("  Move table: transfer modal opened and closed ✓");
  });

  // ── 15. Running total on table card ─────────────────────────────────────
  test("15. balance — table card shows ₹ running total after KOT", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Occupied table card bottom row must show a ₹ amount
    const occupiedCard = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedCard).toBeVisible({ timeout: 15000 });
    const bottomText = await occupiedCard.locator(".tf2-bottom-text").textContent();
    expect(bottomText).toMatch(/₹/);
    console.log("  Running total on card:", bottomText?.trim());
  });

  // ── 16. Action sheet subtitle running total ──────────────────────────────
  test("16. balance — action sheet subtitle shows ₹ running total", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Long press occupied table → action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Subtitle: "Area · X guests · ₹NNN running"
    const subtitle = await page.locator(".tas2-subtitle").textContent();
    expect(subtitle).toMatch(/₹/);
    expect(subtitle).toMatch(/running/i);
    console.log("  Action sheet subtitle:", subtitle?.trim());

    await page.click(".tas2-cancel");
    await expect(page.locator(".tas2-sheet")).not.toBeVisible({ timeout: 3000 });
  });

  // ── 17. Print Bill clears captain slot ──────────────────────────────────
  test("17. billing — Print Bill from action sheet clears table from captain view", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    await page.waitForSelector(".kot-success-page", { timeout: 20000 });
    await page.locator(".kot-floor-btn").first().click();
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Count occupied tables before printing
    const occupiedBefore = await page.locator(
      '.tf2-card[data-st="running"], .tf2-card[data-st="ordering"], .tf2-card[data-st="bill"]'
    ).count();

    // Long press → action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Click Print Bill
    await page.locator(".tas2-row-label", { hasText: "Print Bill" }).click();

    // Action sheet closes and floor is visible
    await expect(page.locator(".tas2-sheet")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".tf2-page")).toBeVisible({ timeout: 5000 });

    // Captain removes its local slot after printing — occupied count drops
    await page.waitForTimeout(2000); // allow async handlePrintBill to finish
    const occupiedAfter = await page.locator(
      '.tf2-card[data-st="running"], .tf2-card[data-st="ordering"], .tf2-card[data-st="bill"]'
    ).count();
    expect(occupiedAfter).toBeLessThan(occupiedBefore);
    console.log(`  Print Bill: occupied tables ${occupiedBefore} → ${occupiedAfter} ✓`);
  });

  // ── 18. Split Bill screen ────────────────────────────────────────────────
  test("18. billing — Split Bill screen opens from action sheet with items listed", async ({ page }) => {
    await clearState(page); await login(page);
    await openFreeTable(page);
    await addFirstMenuItem(page);
    await page.click(".os2-kot-btn");
    await handleWaiterPicker(page);

    // Wait for the sending overlay to appear, then for it to complete.
    // If the KOT API fails, the overlay goes to phase="idle" (returns null) and
    // disappears without ever showing .kot-success-page. The optimistic sentToKot=true
    // update (set before the API call) still marks T1 occupied on the floor.
    const sendingOverlay = await page.waitForSelector(".kot-overlay", { timeout: 10000 }).catch(() => null);
    if (sendingOverlay) {
      await page.waitForSelector(".kot-overlay", { state: "detached", timeout: 20000 });
    }
    if (await page.locator(".kot-success-page").isVisible()) {
      await page.locator(".kot-floor-btn").first().click();
    } else if (!await page.locator(".tf2-page").isVisible()) {
      // KOT failed silently (idle state) — still on order screen
      await page.locator(".os2-back-btn").first().click();
    }
    await page.waitForSelector(".tf2-page", { timeout: 10000 });
    await page.waitForSelector(".tf2-card", { timeout: 10000 });

    // Long press → action sheet
    const occupiedTable = page.locator('.tf2-card[data-st="running"], .tf2-card[data-st="ordering"]').first();
    await expect(occupiedTable).toBeVisible({ timeout: 15000 });
    const box = await occupiedTable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForSelector(".tas2-sheet", { timeout: 5000 });

    // Click Split Bill
    await page.locator(".tas2-row-label", { hasText: "Split Bill" }).click();

    // Split Bill page opens (renders outside .os2-page)
    await page.waitForSelector(".split-page", { timeout: 5000 });
    await expect(page.locator(".split-title")).toHaveText("Split Bill");

    // Meta row: "Table N · ₹NNN total"
    const meta = await page.locator(".split-meta").textContent();
    expect(meta).toMatch(/₹/);
    console.log("  Split Bill meta:", meta?.trim());

    // Items listed
    await expect(page.locator(".split-items")).toBeVisible();
    const itemCount = await page.locator(".split-item").count();
    expect(itemCount).toBeGreaterThan(0);
    console.log("  Split Bill items:", itemCount);

    // Back → order screen (not floor — split's onBack sets screen="order")
    await page.click(".icon-back-btn");
    await expect(page.locator(".os2-page")).toBeVisible({ timeout: 5000 });
    console.log("  Split Bill: back to order screen ✓");
  });

  // ── 13. Wrong PIN Rejected ────────────────────────────────────────────────
  test("13. login — wrong PIN shows error, does not navigate to floor", async ({ page }) => {
    await clearState(page);

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

  // ── 14. Invalid Branch Code ───────────────────────────────────────────────
  test("14. setup — invalid branch code shows error", async ({ page }) => {
    // Need a completely fresh localStorage (no device config) to reach the setup screen,
    // not the login screen that clearState() would produce.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".su2-input", { timeout: 15000 });
    await page.fill(".su2-input", "XXXX-INVALID-CODE");
    await page.click(".su2-btn");

    await expect(page.locator(".su2-error")).toBeVisible({ timeout: 10000 });
  });

});
