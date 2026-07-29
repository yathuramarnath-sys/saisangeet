/**
 * FULL SYNC AUDIT — Captain ↔ POS Integration Test
 *
 * Opens BOTH apps simultaneously in separate browser contexts.
 * Tests every sync path and records exactly what each app shows at each step.
 *
 * Env vars (re-uses captain creds for POS setup):
 *   CAPTAIN_URL          — captain preview/production URL
 *   POS_URL              — POS preview/production URL
 *   CAPTAIN_BRANCH_CODE  — branch link code (used for BOTH apps)
 *   CAPTAIN_STAFF_NAME   — captain staff name
 *   CAPTAIN_STAFF_PIN    — captain staff PIN
 */

import { test, expect, chromium } from "@playwright/test";

const CAPTAIN_URL = process.env.CAPTAIN_URL        || "https://saisangeet-waiter-mobile-git-claude-recover-l-9587ad-saisangeet.vercel.app";
const POS_URL     = process.env.POS_URL             || "https://plato-pos-git-claude-recover-lost-work-mtow3-saisangeet.vercel.app";
const BRANCH      = process.env.CAPTAIN_BRANCH_CODE || "VNB2-B413368C";
const CAP_NAME    = process.env.CAPTAIN_STAFF_NAME  || "Arun";
const CAP_PIN     = process.env.CAPTAIN_STAFF_PIN   || "4444";

const LOG = [];
function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  LOG.push(line);
  console.log(line);
}
function section(title) {
  log(`\n${"─".repeat(60)}`);
  log(`  ${title}`);
  log(`${"─".repeat(60)}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setupCaptain(page) {
  await page.goto(CAPTAIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  const needsSetup = await page.locator(".su2-input").isVisible({ timeout: 5000 }).catch(() => false);
  if (needsSetup) {
    await page.fill(".su2-input", BRANCH);
    await page.click(".su2-btn");
    await page.waitForSelector(".su2-outlet", { timeout: 20000 });
    const name = await page.textContent(".su2-outlet");
    log(`  Captain setup → outlet: "${name.trim()}"`);
    await page.click(".su2-btn");
  }
}

async function loginCaptain(page, name = CAP_NAME, pin = CAP_PIN) {
  await page.waitForSelector(".ls2-who-heading", { timeout: 20000 });
  await page.locator(".ls2-list-name", { hasText: name }).first().click();
  for (const d of pin) {
    await page.locator(".ls2-key", { hasText: d }).first().click();
    await page.waitForTimeout(100);
  }
  await page.waitForSelector(".tf2-page", { timeout: 20000 });
  log(`  Captain logged in as ${name}`);
}

async function setupPOS(page) {
  await page.goto(POS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  // May need to enter branch code
  const needsSetup = await page.locator(".branch-code-input").isVisible({ timeout: 5000 }).catch(() => false);
  if (needsSetup) {
    log("  POS: entering branch code...");
    await page.fill(".branch-code-input", BRANCH);
    await page.locator("button[type='submit'], .branch-setup-form button").first().click();
    await page.waitForTimeout(3000);
    const success = await page.locator(".branch-setup-success, .branch-setup-confirm, .branch-setup-outlet").isVisible({ timeout: 10000 }).catch(() => false);
    if (success) {
      const confirmBtn = page.locator("button", { hasText: /confirm|continue|proceed|start/i }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    }
  }

  // Read pos_staff from localStorage to see who can log in
  const posStaff = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("pos_staff") || "[]"); } catch { return []; }
  });
  log(`  POS: staff available (${posStaff.length}): ${posStaff.map(s => `${s.name}(${s.role})`).join(", ")}`);
  return posStaff;
}

async function loginPOS(page, staffList) {
  // POS shows cashier/manager/supervisor/admin/staff roles
  const POS_ROLES = ["cashier", "manager", "supervisor", "admin", "staff"];
  const posStaff = staffList.filter(s => POS_ROLES.includes((s.role || "").toLowerCase()));

  if (posStaff.length === 0) {
    log("  POS: NO cashier/manager staff found — POS login not possible");
    return null;
  }

  const staffMember = posStaff[0];
  log(`  POS: attempting login as ${staffMember.name} (role: ${staffMember.role})`);

  // Wait for login screen
  const loginScreen = await page.locator(".poslogin-screen").isVisible({ timeout: 10000 }).catch(() => false);
  if (!loginScreen) {
    log("  POS: login screen not visible");
    return null;
  }

  // Click staff button
  const btn = page.locator(".poslogin-staff-btn", { hasText: staffMember.name }).first();
  const visible = await btn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    log(`  POS: staff button for "${staffMember.name}" not found`);
    return null;
  }
  await btn.click();

  // Enter PIN if needed
  if (staffMember.pin) {
    for (const d of String(staffMember.pin)) {
      await page.locator(".poslogin-numpad-key", { hasText: d }).first().click();
      await page.waitForTimeout(100);
    }
  }
  await page.waitForTimeout(1000);

  // Check if shift gate appeared
  const shiftGate = await page.locator(".sg-session-btn, .sg-numpad, .shift-gate").isVisible({ timeout: 5000 }).catch(() => false);
  if (shiftGate) {
    log("  POS: shift gate shown — opening shift");
    // Select Lunch session
    const lunchBtn = page.locator("button", { hasText: /lunch|full day/i }).first();
    if (await lunchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lunchBtn.click();
    }
    // Enter opening cash: 0
    const startBtn = page.locator("button", { hasText: /start shift|open shift/i }).first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click();
    }
    await page.waitForTimeout(2000);
  }

  // Should be at POS main screen
  const posMain = await page.locator(".tpp, .pos-main, .pos-container").isVisible({ timeout: 10000 }).catch(() => false);
  if (posMain) {
    log(`  POS: logged in as ${staffMember.name}, main screen visible`);
    return staffMember;
  } else {
    log("  POS: main screen NOT visible after login");
    return null;
  }
}

async function captainGetTableStatus(page) {
  const cards = await page.locator(".tf2-card").all();
  const statuses = [];
  for (const card of cards.slice(0, 10)) {
    const st    = await card.getAttribute("data-st").catch(() => "?");
    const numEl = card.locator(".tf2-num, .tf2-card-num, span").first();
    const num   = await numEl.textContent().catch(() => "?");
    statuses.push(`T${num.trim()}:${st}`);
  }
  return statuses.join(", ");
}

async function posGetTableStatus(page, tableNumber) {
  const btn = page.locator(`.tpp-table-btn`).filter({ hasText: String(tableNumber) }).first();
  const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) return "not found";
  const st = await btn.getAttribute("data-st").catch(() => "?");
  return st;
}

// ── TEST SUITE ─────────────────────────────────────────────────────────────────

test.describe("Full Sync Audit — Captain ↔ POS", () => {
  let captainPage, posPage, posStaff, testTableId;

  test.beforeAll(async ({ browser }) => {
    // Open two independent contexts — separate localStorage, separate sockets
    const captainCtx = await browser.newContext();
    const posCtx     = await browser.newContext();
    captainPage = await captainCtx.newPage();
    posPage     = await posCtx.newPage();

    captainPage.on("console", m => {
      if (m.type() === "error") log(`  [CAP console.error] ${m.text().slice(0, 120)}`);
    });
    posPage.on("console", m => {
      if (m.type() === "error") log(`  [POS console.error] ${m.text().slice(0, 120)}`);
    });
  });

  test.afterAll(async () => {
    section("FINAL AUDIT LOG");
    log(LOG.join("\n"));
  });

  // ── 1. Setup & Login ────────────────────────────────────────────────────────
  test("01 — Setup both apps", async () => {
    section("SETUP");
    await Promise.all([
      setupCaptain(captainPage),
      setupPOS(posPage).then(s => { posStaff = s; }),
    ]);
    log(`Captain URL: ${CAPTAIN_URL}`);
    log(`POS URL: ${POS_URL}`);
    log(`Branch: ${BRANCH}`);
    await captainPage.screenshot({ path: "test-results/01-captain-setup.png" });
    await posPage.screenshot({ path: "test-results/01-pos-setup.png" });
  });

  test("02 — Login captain", async () => {
    section("LOGIN - CAPTAIN");
    await loginCaptain(captainPage);
    await captainPage.waitForTimeout(3000); // let socket connect
    const tables = await captainGetTableStatus(captainPage);
    log(`  Captain floor: ${tables}`);
    await captainPage.screenshot({ path: "test-results/02-captain-floor.png" });
  });

  test("03 — Login POS", async () => {
    section("LOGIN - POS");
    if (!posStaff || posStaff.length === 0) {
      log("  SKIP: no POS staff configured — cannot test POS side");
      test.skip(true, "No POS-role staff configured in this outlet");
      return;
    }
    const loggedIn = await loginPOS(posPage, posStaff);
    if (!loggedIn) {
      log("  SKIP: POS login failed");
      test.skip(true, "POS login could not be completed");
      return;
    }
    await posPage.waitForTimeout(3000);
    await posPage.screenshot({ path: "test-results/03-pos-main.png" });
  });

  // ── 2. Find a free table and open it on Captain ─────────────────────────────
  test("04 — Captain opens free table", async () => {
    section("OPEN FREE TABLE - CAPTAIN");
    await captainPage.waitForSelector(".tf2-card", { timeout: 15000 });
    const freeCard = captainPage.locator('.tf2-card[data-st="open"]').first();
    const visible = await freeCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      log("  No free tables — need to check outlet state");
      const allStatuses = await captainGetTableStatus(captainPage);
      log(`  All tables: ${allStatuses}`);
      test.skip(true, "No free tables available");
      return;
    }

    // Get table number
    const numEl = freeCard.locator(".tf2-num, .tf2-card-num").first();
    const tableNum = (await numEl.textContent().catch(() => "?")).trim();
    testTableId = tableNum;
    log(`  Opening table T${tableNum}`);

    await freeCard.click();
    await captainPage.waitForTimeout(2000);

    // Should open menu or order screen directly
    const onMenu = await captainPage.locator(".mb2-page, .menu-browser").isVisible({ timeout: 5000 }).catch(() => false);
    const onOrder = await captainPage.locator(".os2-page, .order-screen").isVisible({ timeout: 5000 }).catch(() => false);
    log(`  After tap: menu=${onMenu}, order=${onOrder}`);
    await captainPage.screenshot({ path: "test-results/04-captain-table-open.png" });

    // Check POS: table should still show free (no KOT yet)
    await posPage.waitForTimeout(1000);
    const posSt = await posGetTableStatus(posPage, tableNum);
    log(`  POS T${tableNum} status: ${posSt} (should be "available" — KOT not sent yet)`);
    await posPage.screenshot({ path: "test-results/04-pos-table-status.png" });
  });

  // ── 3. Add items on Captain ─────────────────────────────────────────────────
  test("05 — Captain adds items to cart", async () => {
    section("ADD ITEMS - CAPTAIN");

    // Find menu items to add
    const menuItems = captainPage.locator(".mb2-item, .menu-item-btn, .mi-card");
    const count = await menuItems.count().catch(() => 0);
    log(`  Menu items visible: ${count}`);

    if (count === 0) {
      // Try navigating to menu
      const menuBtn = captainPage.locator("button", { hasText: /add|menu/i }).first();
      if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await menuBtn.click();
        await captainPage.waitForTimeout(2000);
      }
    }

    // Add first item 3 times
    const firstItem = captainPage.locator(".mb2-item, .menu-item-btn, .mi-card").first();
    const itemVisible = await firstItem.isVisible({ timeout: 8000 }).catch(() => false);
    if (!itemVisible) {
      log("  WARNING: No menu items visible — checking page state");
      await captainPage.screenshot({ path: "test-results/05-no-menu-items.png" });
      return;
    }

    const itemName = await firstItem.locator(".mb2-item-name, .item-name, span").first().textContent().catch(() => "item");
    log(`  Adding "${itemName.trim()}" 3 times`);

    for (let i = 0; i < 3; i++) {
      await firstItem.click();
      await captainPage.waitForTimeout(500);
    }

    // Also add a second item
    const items = captainPage.locator(".mb2-item, .menu-item-btn, .mi-card");
    const itemCount = await items.count();
    if (itemCount >= 2) {
      const secondItem = items.nth(1);
      const name2 = await secondItem.locator(".mb2-item-name, .item-name, span").first().textContent().catch(() => "item2");
      log(`  Adding "${name2.trim()}" once`);
      await secondItem.click();
      await captainPage.waitForTimeout(500);
    }

    // Read cart badge
    const badge = captainPage.locator(".mb2-badge, .cart-badge, .basket-count");
    const badgeText = await badge.textContent().catch(() => "?");
    log(`  Cart badge: "${badgeText.trim()}"`);

    await captainPage.screenshot({ path: "test-results/05-captain-items-added.png" });

    // POS: should still show available (items added but NOT KOT'd)
    await posPage.waitForTimeout(2000);
    const posSt = await posGetTableStatus(posPage, testTableId);
    log(`  POS T${testTableId} status: ${posSt} (EXPECTED: available — items not KOT'd yet)`);
    await posPage.screenshot({ path: "test-results/05-pos-before-kot.png" });
  });

  // ── 4. Send KOT ─────────────────────────────────────────────────────────────
  test("06 — Captain sends KOT", async () => {
    section("SEND KOT - CAPTAIN");

    // Navigate to order screen first if on menu
    const onMenu = await captainPage.locator(".mb2-page, .menu-browser").isVisible({ timeout: 3000 }).catch(() => false);
    if (onMenu) {
      const backBtn = captainPage.locator(".mb2-back, .back-btn, button[aria-label='back']").first();
      if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.click();
        await captainPage.waitForTimeout(1000);
      }
    }

    // Find KOT button
    const kotBtn = captainPage.locator("button", { hasText: /send kot|kot|send to kitchen/i }).first();
    const kotVisible = await kotBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (!kotVisible) {
      log("  WARNING: KOT button not found");
      await captainPage.screenshot({ path: "test-results/06-no-kot-btn.png" });
      return;
    }

    log("  Clicking Send KOT...");
    await kotBtn.click();
    await captainPage.waitForTimeout(1000);

    // Waiter picker may appear
    const waiterPicker = captainPage.locator(".wp2-sheet, .waiter-pick, .picker-sheet");
    if (await waiterPicker.isVisible({ timeout: 3000 }).catch(() => false)) {
      log("  Waiter picker appeared");
      const sendBtn = captainPage.locator("button", { hasText: /send|confirm|done/i }).first();
      if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendBtn.click();
      }
    }

    // Wait for KOT success overlay
    await captainPage.waitForTimeout(4000);
    const kotSuccess = await captainPage.locator(".kp2-overlay, .kot-progress, .kot-success").isVisible({ timeout: 8000 }).catch(() => false);
    const kotNum = await captainPage.locator(".kp2-kot-num, .kot-number, [class*='kot-num']").textContent().catch(() => "?");
    log(`  KOT overlay visible: ${kotSuccess}, KOT number: "${kotNum.trim()}"`);
    await captainPage.screenshot({ path: "test-results/06-captain-kot-sent.png" });

    // Close success overlay
    const doneBtn = captainPage.locator("button", { hasText: /done|ok|close/i }).first();
    if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await doneBtn.click();
    }
    await captainPage.waitForTimeout(1000);

    // POS: should now show "occupied" (KOT sent)
    await posPage.waitForTimeout(4000);
    const posSt = await posGetTableStatus(posPage, testTableId);
    log(`  POS T${testTableId} status: ${posSt} (EXPECTED: occupied)`);
    await posPage.screenshot({ path: "test-results/06-pos-after-kot.png" });
  });

  // ── 5. Add more items & send 2nd KOT ───────────────────────────────────────
  test("07 — Captain adds more items + sends 2nd KOT", async () => {
    section("SECOND KOT - CAPTAIN");

    // Go to order screen and add more items
    await captainPage.waitForTimeout(1000);

    const addBtn = captainPage.locator("button", { hasText: /add|menu|\+/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await captainPage.waitForTimeout(2000);
    }

    const items = captainPage.locator(".mb2-item, .menu-item-btn, .mi-card");
    if (await items.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const thirdItem = await items.count() >= 3 ? items.nth(2) : items.first();
      const name = await thirdItem.locator("span").first().textContent().catch(() => "item3");
      log(`  Adding "${name.trim()}" for 2nd KOT`);
      await thirdItem.click();
      await captainPage.waitForTimeout(500);
    }

    // Navigate back and send KOT
    const backBtn = captainPage.locator(".mb2-back, .back-btn").first();
    if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backBtn.click();
      await captainPage.waitForTimeout(1000);
    }

    const kotBtn = captainPage.locator("button", { hasText: /send kot|kot/i }).first();
    if (await kotBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await kotBtn.click();
      await captainPage.waitForTimeout(1000);
      const sendBtn = captainPage.locator("button", { hasText: /send|confirm|done/i }).first();
      if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) await sendBtn.click();
      await captainPage.waitForTimeout(4000);
      const doneBtn = captainPage.locator("button", { hasText: /done|ok|close/i }).first();
      if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) await doneBtn.click();
      log("  2nd KOT sent");
    }

    await captainPage.screenshot({ path: "test-results/07-captain-2nd-kot.png" });
    await posPage.screenshot({ path: "test-results/07-pos-2nd-kot.png" });
  });

  // ── 6. Captain requests bill (Print Bill) ───────────────────────────────────
  test("08 — Captain prints bill (requests bill)", async () => {
    section("PRINT BILL - CAPTAIN");

    await captainPage.waitForTimeout(1000);

    // Go back to floor to long-press table
    await captainPage.locator(".btab-label, .tab-label", { hasText: /floor/i }).first().click().catch(() => {});
    await captainPage.waitForTimeout(1000);

    // Find the occupied table (testTableId) and long press
    const tableCard = captainPage.locator(".tf2-card").filter({ hasText: String(testTableId) }).first();
    const cardVisible = await tableCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardVisible) {
      const box = await tableCard.boundingBox();
      if (box) {
        log(`  Long-pressing T${testTableId}...`);
        await captainPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await captainPage.mouse.down();
        await captainPage.waitForTimeout(750);
        await captainPage.mouse.up();
        await captainPage.waitForTimeout(1000);
      }
    } else {
      log(`  T${testTableId} not visible on floor — trying alternate path`);
      await captainPage.screenshot({ path: "test-results/08-no-table-visible.png" });
      return;
    }

    // Action sheet should appear
    const sheet = await captainPage.locator(".tas2-sheet, .action-sheet").isVisible({ timeout: 5000 }).catch(() => false);
    log(`  Action sheet visible: ${sheet}`);
    await captainPage.screenshot({ path: "test-results/08-captain-action-sheet.png" });

    if (sheet) {
      const printBtn = captainPage.locator(".tas2-row-label, .action-row", { hasText: /print bill|print/i }).first();
      if (await printBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        log("  Clicking Print Bill...");
        await printBtn.click();
        await captainPage.waitForTimeout(4000);
      }
    }

    // After printing bill, captain table should be cleared from floor
    await captainPage.waitForTimeout(3000);
    const captainTableVisible = await captainPage.locator(".tf2-card").filter({ hasText: String(testTableId) }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const captainTableSt = captainTableVisible
      ? await captainPage.locator(".tf2-card").filter({ hasText: String(testTableId) }).first().getAttribute("data-st").catch(() => "?")
      : "gone";
    log(`  Captain T${testTableId} after Print Bill: ${captainTableSt}`);
    log(`  (EXPECTED: captain should clear the table from floor after print bill)`);
    await captainPage.screenshot({ path: "test-results/08-captain-after-print-bill.png" });

    // POS: table should show "bill" status
    await posPage.waitForTimeout(4000);
    const posSt = await posGetTableStatus(posPage, testTableId);
    log(`  POS T${testTableId} status: ${posSt} (EXPECTED: bill)`);
    await posPage.screenshot({ path: "test-results/08-pos-bill-state.png" });
  });

  // ── 7. KEY TEST: POS settles → Captain must clear ──────────────────────────
  test("09 — POS SETTLES TABLE → captain must clear [KEY BUG TEST]", async () => {
    section("★ KEY BUG TEST: POS SETTLE → CAPTAIN CLEAR");

    // Check if POS is logged in
    const posMainVisible = await posPage.locator(".tpp, .pos-main").isVisible({ timeout: 5000 }).catch(() => false);
    if (!posMainVisible) {
      log("  SKIP: POS not logged in — cannot test this flow");
      return;
    }

    // Click the bill table on POS
    const billTable = posPage.locator(`.tpp-table-btn[data-st="bill"]`).first();
    const billVisible = await billTable.isVisible({ timeout: 8000 }).catch(() => false);

    if (!billVisible) {
      log("  No 'bill' table found on POS — checking all tables...");
      const allBtns = await posPage.locator(".tpp-table-btn").all();
      for (const btn of allBtns.slice(0, 15)) {
        const st  = await btn.getAttribute("data-st").catch(() => "?");
        const num = await btn.locator(".tpp-table-num").textContent().catch(() => "?");
        log(`  POS T${num.trim()}: ${st}`);
      }
      await posPage.screenshot({ path: "test-results/09-pos-no-bill-table.png" });
      return;
    }

    const billTableNum = await billTable.locator(".tpp-table-num").textContent().catch(() => "?");
    log(`  POS: clicking bill table T${billTableNum.trim()}`);
    await billTable.click();
    await posPage.waitForTimeout(2000);
    await posPage.screenshot({ path: "test-results/09-pos-order-panel.png" });

    // Look for payment/collect/settle button
    const settleBtn = posPage.locator("button", { hasText: /collect|settle|pay|cash|upi/i }).first();
    const settleVisible = await settleBtn.isVisible({ timeout: 8000 }).catch(() => false);
    log(`  POS: settle/collect button visible: ${settleVisible}`);

    if (!settleVisible) {
      log("  TRYING: print bill first, then settle");
      const printBillBtn = posPage.locator("button", { hasText: /print bill/i }).first();
      if (await printBillBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await printBillBtn.click();
        await posPage.waitForTimeout(3000);
      }
      await posPage.screenshot({ path: "test-results/09-pos-after-print.png" });
    }

    // Open payment sheet
    const payBtn = posPage.locator("button", { hasText: /collect|payment|settle/i }).first();
    if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await payBtn.click();
      await posPage.waitForTimeout(2000);
      await posPage.screenshot({ path: "test-results/09-pos-payment-sheet.png" });

      // Select UPI (safest — no drawer open)
      const upiBtn = posPage.locator("button, .payment-tab", { hasText: /upi/i }).first();
      if (await upiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await upiBtn.click();
        await posPage.waitForTimeout(500);
      }

      // Confirm/settle
      const confirmBtn = posPage.locator("button", { hasText: /confirm|settle|paid|done/i }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        log("  POS: confirming payment (UPI)...");
        await confirmBtn.click();
        await posPage.waitForTimeout(4000);
      }
    }

    await posPage.screenshot({ path: "test-results/09-pos-after-settle.png" });

    // ── THE CRITICAL CHECK ──────────────────────────────────────────────────────
    log("\n  ★ CHECKING: did captain clear table after POS settled?");
    await captainPage.waitForTimeout(6000); // give time for socket

    const captainTableEl = captainPage.locator(".tf2-card").filter({ hasText: String(testTableId) }).first();
    const stillVisible   = await captainTableEl.isVisible({ timeout: 3000 }).catch(() => false);
    const stAfterSettle  = stillVisible
      ? await captainTableEl.getAttribute("data-st").catch(() => "?")
      : "CLEARED (not visible)";

    log(`  ★ Captain T${testTableId} AFTER POS SETTLE: ${stAfterSettle}`);
    if (stillVisible && stAfterSettle !== "open") {
      log(`  ★ BUG CONFIRMED: Captain still shows T${testTableId} as "${stAfterSettle}" after POS settled!`);
    } else {
      log(`  ★ PASS: Captain correctly cleared T${testTableId} after POS settlement`);
    }

    await captainPage.screenshot({ path: "test-results/09-captain-after-pos-settle.png" });
    await posPage.screenshot({ path: "test-results/09-pos-table-final.png" });
  });

  // ── 8. Additional sync checks ───────────────────────────────────────────────
  test("10 — Check pending bill count parity", async () => {
    section("PENDING BILL COUNT CHECK");

    // Navigate to More tab on captain
    await captainPage.locator(".btab-label", { hasText: /more/i }).first().click().catch(() => {});
    await captainPage.waitForTimeout(2000);

    // Count pending bills in captain
    const captainBills = await captainPage.locator(".more2-pb-item, .pending-bill-row").count().catch(() => 0);
    const captainTotal = await captainPage.locator(".more2-pb-total, .pb-total").textContent().catch(() => "?");
    log(`  Captain pending bills: ${captainBills}, total: "${captainTotal.trim()}"`);
    await captainPage.screenshot({ path: "test-results/10-captain-more-screen.png" });

    // Count pending bills on POS
    const posBillTiles = await posPage.locator('.tpp-table-btn[data-st="bill"]').count().catch(() => 0);
    log(`  POS bill tables: ${posBillTiles}`);
    await posPage.screenshot({ path: "test-results/10-pos-overview.png" });

    if (captainBills !== posBillTiles) {
      log(`  MISMATCH: Captain shows ${captainBills} pending bills, POS shows ${posBillTiles} bill tables`);
    } else {
      log(`  MATCH: Both show ${captainBills} pending/bill tables`);
    }
  });

  test("11 — Floor state sync after all operations", async () => {
    section("FLOOR STATE FINAL CHECK");

    // Go back to floor on captain
    await captainPage.locator(".btab-label", { hasText: /floor/i }).first().click().catch(() => {});
    await captainPage.waitForTimeout(2000);

    const captainStatuses = await captainGetTableStatus(captainPage);
    log(`  Captain floor final: ${captainStatuses}`);
    await captainPage.screenshot({ path: "test-results/11-captain-floor-final.png" });
    await posPage.screenshot({ path: "test-results/11-pos-floor-final.png" });
  });

  test("12 — Console errors captured during session", async () => {
    section("CONSOLE ERRORS");
    const errors = LOG.filter(l => l.includes("console.error"));
    if (errors.length === 0) {
      log("  No console errors during session");
    } else {
      log(`  ${errors.length} console errors:`);
      errors.forEach(e => log(`    ${e}`));
    }
  });
});
