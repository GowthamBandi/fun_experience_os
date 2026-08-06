const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.join(__dirname, "../docs/prototype-evidence/mission-usability");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function run() {
  console.log("Starting Next.js dev server on port 3007...");
  const server = spawn("npx", ["next", "dev", "-p", "3007"], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "inherit",
  });

  try {
    await waitForServer("http://localhost:3007/login");
    console.log("Next.js dev server is ready at http://localhost:3007");

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const snap = async (filename) => {
      const targetPath = path.join(OUTPUT_DIR, filename);
      await page.screenshot({ path: targetPath, fullPage: false });
      console.log(`Saved screenshot: ${filename}`);
    };

    // 1. Login bypass
    await page.goto("http://localhost:3007/login");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      window.localStorage.setItem("xos.auth", JSON.stringify({ operatorId: "op-1", roleId: "platform-owner" }));
    });
    await page.waitForTimeout(500);

    // 2. Missions List (Desktop)
    await page.goto("http://localhost:3007/missions");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await snap("01-missions-desktop-list.png");

    // 3. Missions List (Mobile)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await snap("02-missions-mobile-list.png");

    // Reset Viewport to Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // 4. Event Overview
    await page.goto("http://localhost:3007/missions/s-1/overview");
    await page.waitForLoadState("networkidle");
    await snap("03-event-overview.png");

    // 5. Run Event Ready (Scheduled Session s-4)
    await page.goto("http://localhost:3007/missions/s-4/live");
    await page.waitForLoadState("networkidle");
    await snap("04-run-event-ready.png");

    // 6. Run Event Running (Live Session s-1)
    await page.goto("http://localhost:3007/missions/s-1/live");
    await page.waitForLoadState("networkidle");
    await snap("05-run-event-running.png");

    // 7. Pause Event Clock
    const pauseBtn = page.locator("button:has-text('Pause Event')");
    if (await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await page.waitForTimeout(500);
      await page.fill("textarea[placeholder='e.g. Equipment repair; court maintenance.']", "Weather condition checks");
      await page.click("button:has-text('Confirm Pause')");
      await page.waitForTimeout(1000);
    }
    await snap("06-run-event-paused.png");

    // 8. Event Plan Step Detail
    const planSection = page.locator("text=Event Plan");
    if (await planSection.isVisible()) {
      await planSection.scrollIntoViewIfNeeded();
    }
    await snap("07-event-plan.png");

    // 9. End Event Confirmation checklist
    const continueBtn = page.locator("button:has-text('Continue Event')");
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }
    const endBtn = page.locator("button:has-text('End Event')");
    if (await endBtn.isVisible()) {
      await endBtn.click();
      await page.waitForTimeout(500);
      await snap("08-end-event-confirmation.png");
      // Confirm Ending Event
      await page.click("div.fixed button:has-text('End Event')");
      await page.waitForTimeout(1000);
    } else {
      await snap("08-end-event-confirmation.png");
    }

    // 10. Sport Results Form
    await page.goto("http://localhost:3007/missions/s-1/results");
    await page.waitForLoadState("networkidle");
    await snap("09-sport-results.png");

    // 11. Non-sport Results Form
    await page.goto("http://localhost:3007/missions/s-7/results");
    await page.waitForLoadState("networkidle");
    await snap("10-non-sport-results.png");

    // 12. Corrected Result History
    await page.goto("http://localhost:3007/missions/s-1/results");
    await page.waitForLoadState("networkidle");
    const correctBtn = page.locator("button:has-text('Correct Result')");
    if (await correctBtn.isVisible()) {
      await correctBtn.click();
      await page.waitForTimeout(500);
      await page.fill("textarea[placeholder='e.g. Score miscount corrected by Lead Coordinator after scorecard review.']", "Coordinator entry correction");
      await page.click("button:has-text('Save Corrected Result')");
      await page.waitForTimeout(1000);
    }
    await snap("11-corrected-result-history.png");

    // 13. Finish Event Blockers
    await page.goto("http://localhost:3007/missions/s-1/completion");
    await page.waitForLoadState("networkidle");
    await snap("12-finish-event-blockers.png");

    // Confirm results to clear blocker
    await page.goto("http://localhost:3007/missions/s-1/results");
    await page.waitForLoadState("networkidle");
    const confirmResBtn = page.locator("button:has-text('Confirm Result')");
    if (await confirmResBtn.isVisible()) {
      await confirmResBtn.click();
      await page.waitForTimeout(500);
    }

    // Go back to completion page to see final numbers
    await page.goto("http://localhost:3007/missions/s-1/completion");
    await page.waitForLoadState("networkidle");
    await snap("13-finish-event-final-review.png");

    // 14. Completed State
    const overrideBtn = page.locator("button:has-text('Audited Completion Override')");
    const finishLockBtn = page.locator("button:has-text('Finish and Lock Event')");
    if (await finishLockBtn.isVisible()) {
      await finishLockBtn.click();
      await page.waitForTimeout(500);
      await page.click("div.fixed button:has-text('Finish Event')");
      await page.waitForTimeout(1000);
    } else if (await overrideBtn.isVisible()) {
      await overrideBtn.click();
      await page.waitForTimeout(500);
      await page.fill("textarea[placeholder='e.g. Lead Coordinator verified venue cleared and attendance confirmed on site.']", "Walkthrough verification closed");
      await page.click("button:has-text('Execute Audited Completion')");
      await page.waitForTimeout(1500);
    }
    await snap("14-completed-state.png");

    // 15. Final Summary Page
    await page.goto("http://localhost:3007/missions/s-1/summary");
    await page.waitForLoadState("networkidle");
    await snap("15-final-summary.png");

    // 16. Back Navigation (Overview Page back-actions)
    await page.goto("http://localhost:3007/missions/s-1/overview");
    await page.waitForLoadState("networkidle");
    await snap("16-back-navigation.png");

    console.log("All 16 screenshots captured successfully!");
    await browser.close();
  } catch (error) {
    console.error("Screenshot capture failed:", error);
  } finally {
    console.log("Stopping Next.js server...");
    server.kill();
  }
}

run();
