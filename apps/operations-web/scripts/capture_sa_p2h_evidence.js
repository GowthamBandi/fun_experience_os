const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.join(__dirname, "../docs/prototype-evidence/sa-p2h");
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
  console.log("Starting Next.js dev server on port 3006...");
  const server = spawn("npx", ["next", "dev", "-p", "3006"], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "inherit",
  });

  try {
    await waitForServer("http://localhost:3006/tournaments");
    console.log("Next.js dev server is ready at http://localhost:3006");

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
    await page.goto("http://localhost:3006/login");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      window.localStorage.setItem("xos.auth", JSON.stringify({ operatorId: "op-1", roleId: "platform-owner" }));
    });
    await page.waitForTimeout(500);

    // 2. Tournament Command Center
    await page.goto("http://localhost:3006/tournaments");
    await page.waitForLoadState("networkidle");
    await snap("01-tournament-dashboard.png");

    // 3. Wizard Step 1
    await page.goto("http://localhost:3006/tournaments/new");
    await page.waitForLoadState("networkidle");
    await snap("02-wizard-step1.png");

    // Fill Basic Info & Go to Step 2
    await page.fill("input[placeholder='Enter tournament title']", "Winter Table Tennis Cup");
    await page.click("button:has-text('Continue')");
    await page.waitForTimeout(300);
    await snap("03-wizard-step2.png");

    // Go to Step 3
    await page.click("button:has-text('Continue')");
    await page.waitForTimeout(300);
    await snap("04-wizard-step3.png");

    // Go to Step 4 (Review)
    await page.click("button:has-text('Continue')");
    await page.waitForTimeout(300);
    await snap("05-wizard-step4.png");

    // Create Tournament
    await page.click("button:has-text('Create Tournament')");
    await page.waitForTimeout(1000);
    await snap("06-tournament-created-list.png");

    // 4. Tournament Workspace - Bracket
    await page.goto("http://localhost:3006/tournaments/tr-1");
    await page.waitForLoadState("networkidle");
    await snap("07-workspace-bracket.png");

    // 5. Teams tab
    await page.click("button:has-text('Teams')");
    await page.waitForTimeout(300);
    await snap("08-workspace-teams.png");

    // 6. Matches tab
    await page.click("button:has-text('Matches')");
    await page.waitForTimeout(300);
    await snap("09-workspace-matches.png");

    // 7. Ops & Safety tab
    await page.click("button:has-text('Ops & Safety')");
    await page.waitForTimeout(300);
    await snap("10-workspace-ops-safety.png");

    // 8. Summary tab
    await page.click("button:has-text('Summary')");
    await page.waitForTimeout(300);
    await snap("11-workspace-summary.png");

    // 9. Safety & Disputes Dashboard - Incidents Tab
    await page.goto("http://localhost:3006/safety");
    await page.waitForLoadState("networkidle");
    await snap("12-safety-incidents.png");

    // 10. Safety - Disputes Tab
    await page.click("button:has-text('Disputes Log')");
    await page.waitForTimeout(300);
    await snap("13-safety-disputes.png");

    // 11. Safety - Moderation Cases Tab
    await page.click("button:has-text('Moderation Cases')");
    await page.waitForTimeout(300);
    await snap("14-safety-moderation.png");

    // 12. Safety - Refund Exceptions Tab
    await page.click("button:has-text('Refund Exceptions')");
    await page.waitForTimeout(300);
    await snap("15-safety-refund-exceptions.png");

    // 13. Upgraded Refunds Workspace
    await page.goto("http://localhost:3006/money/refunds");
    await page.waitForLoadState("networkidle");
    await snap("16-refunds-workspace-exceptions.png");

    // 14. Upgraded People Workspace
    await page.goto("http://localhost:3006/people");
    await page.waitForLoadState("networkidle");
    await snap("17-people-workspace-restrictions.png");

    await browser.close();
    console.log("All screenshots captured successfully!");
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
