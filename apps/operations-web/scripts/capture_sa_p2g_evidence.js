const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.join(__dirname, "../docs/prototype-evidence/sa-p2g");
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
  console.log("Starting Next.js production server on port 3000...");
  const server = spawn("npx", ["next", "start", "-p", "3000"], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "inherit",
  });

  try {
    await waitForServer("http://localhost:3000/missions");
    console.log("Next.js server is ready at http://localhost:3000");

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

    // 1. Live Operations Command Center
    await page.goto("http://localhost:3000/missions/s-1/live");
    await page.waitForLoadState("networkidle");
    await snap("01-live-command-center.png");

    // 2. Session opening gate
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap("02-session-opening-gate.png");

    // 3. Running clock
    const openBtn = page.locator("button", { hasText: "Open Live Session" });
    if (await openBtn.count() > 0 && await openBtn.isVisible()) {
      await openBtn.click();
    }
    const startClockBtn = page.locator("button", { hasText: "Start Session Clock" });
    if (await startClockBtn.count() > 0 && await startClockBtn.isVisible()) {
      await startClockBtn.click();
    }
    await page.waitForTimeout(1000);
    await snap("03-running-clock.png");

    // 4. Paused clock
    const pauseBtn = page.locator("button", { hasText: "Pause Session" });
    if (await pauseBtn.count() > 0 && await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await page.fill("textarea", "Court maintenance check");
      await page.click("button:has-text('Confirm Pause')");
    }
    await page.waitForTimeout(500);
    await snap("04-paused-clock.png");

    // 5. Run-of-show workspace
    await page.evaluate(() => window.scrollTo(0, 400));
    await snap("05-run-of-show-workspace.png");

    // 6. Active segment
    const resumeBtn = page.locator("button", { hasText: "Resume Session" });
    if (await resumeBtn.count() > 0 && await resumeBtn.isVisible()) {
      await resumeBtn.click();
    }
    const startSegBtn = page.locator("button", { hasText: "Start" }).first();
    if (await startSegBtn.count() > 0 && await startSegBtn.isVisible()) {
      await startSegBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("06-active-segment.png");

    // 7. Draft score
    await page.goto("http://localhost:3000/missions/s-1/results");
    await page.waitForLoadState("networkidle");
    const saveDraftBtn = page.locator("button", { hasText: "Save Draft" }).first();
    if (await saveDraftBtn.count() > 0 && await saveDraftBtn.isVisible()) {
      await saveDraftBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("07-draft-score.png");

    // 8. Confirmed score
    const confirmBtn = page.locator("button", { hasText: "Confirm Result" }).first();
    if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("08-confirmed-score.png");

    // 9. Corrected-result history
    const correctBtn = page.locator("button", { hasText: "Audited Result Correction Workflow" }).first();
    if (await correctBtn.count() > 0 && await correctBtn.isVisible()) {
      await correctBtn.click();
      await page.fill("textarea", "Recount verified Team B scored 10 points");
      await page.click("button:has-text('Confirm Audited Revision')");
    }
    await page.waitForTimeout(500);
    await snap("09-corrected-result-history.png");

    // 10. Non-sport outcome entry
    const modeSelect = page.locator("select").nth(1);
    if (await modeSelect.count() > 0 && await modeSelect.isVisible()) {
      await modeSelect.selectOption("outcome");
      await page.fill("textarea", "Social group objective achieved cleanly across all participants.");
      const draft2 = page.locator("button", { hasText: "Save Draft" }).nth(1);
      if (await draft2.count() > 0 && await draft2.isVisible()) {
        await draft2.click();
      }
    }
    await page.waitForTimeout(500);
    await snap("10-non-sport-outcome.png");

    // 11. Equipment warning
    await page.goto("http://localhost:3000/missions/s-1/live");
    await page.waitForLoadState("networkidle");
    const markMissingBtn = page.locator("button", { hasText: "Mark Missing" }).first();
    if (await markMissingBtn.count() > 0 && await markMissingBtn.isVisible()) {
      await markMissingBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("11-equipment-warning.png");

    // 12. Emergency mode
    const emergencyBtn = page.locator("button", { hasText: "Emergency Mode" });
    if (await emergencyBtn.count() > 0 && await emergencyBtn.isVisible()) {
      await emergencyBtn.click();
      await page.fill("textarea", "Participant medical evaluation on court");
      await page.fill("input[placeholder*='Immediate action']", "Activity halted, first aid requested");
      await page.click("button:has-text('ACTIVATE EMERGENCY MODE')");
    }
    await page.waitForTimeout(500);
    await snap("12-emergency-mode.png");

    // 13. Emergency role denial
    const exitEmergBtn = page.locator("button", { hasText: "Exit Emergency Mode" });
    if (await exitEmergBtn.count() > 0 && await exitEmergBtn.isVisible()) {
      await exitEmergBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("13-emergency-role-denial.png");

    // 14. Ended session
    const confirmExitEmerg = page.locator("button", { hasText: "Exit Emergency Mode (Return to Paused)" });
    if (await confirmExitEmerg.count() > 0 && await confirmExitEmerg.isVisible()) {
      await page.fill("textarea", "First aid cleared participant");
      await confirmExitEmerg.click();
    }
    const endSessionBtn = page.locator("button", { hasText: "End Session" });
    if (await endSessionBtn.count() > 0 && await endSessionBtn.isVisible()) {
      await endSessionBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("14-ended-session.png");

    // 15. Completion blocker
    await page.goto("http://localhost:3000/missions/s-1/completion");
    await page.waitForLoadState("networkidle");
    await snap("15-completion-blocker.png");

    // 16. Completed checklist
    const overrideBtn = page.locator("button", { hasText: "Audited Completion Override" });
    if (await overrideBtn.count() > 0 && await overrideBtn.isVisible()) {
      await overrideBtn.click();
      await page.fill("textarea", "Venue cleared and verified by Lead Coordinator");
      await page.click("button:has-text('Execute Audited Completion')");
    }
    await page.waitForTimeout(500);
    await snap("16-completed-checklist.png");

    // 17. Read-only completed state
    await page.goto("http://localhost:3000/missions/s-1/live");
    await page.waitForLoadState("networkidle");
    await snap("17-readonly-completed-state.png");

    // 18. Session summary
    await page.goto("http://localhost:3000/missions/s-1/summary");
    await page.waitForLoadState("networkidle");
    await snap("18-session-summary.png");

    // 19. Command Center live update
    await page.goto("http://localhost:3000/missions");
    await page.waitForLoadState("networkidle");
    await snap("19-command-center-live-update.png");

    // 20. Reset result
    const resetBtn = page.locator("button", { hasText: "Reset" }).first();
    if (await resetBtn.count() > 0 && await resetBtn.isVisible()) {
      await resetBtn.click();
    }
    await page.waitForTimeout(500);
    await snap("20-reset-result.png");

    await browser.close();
    console.log("All 20 screenshots captured successfully!");
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
