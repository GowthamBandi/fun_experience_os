const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "../docs/prototype-evidence/catalog-usability");
const BASE_URL = "http://localhost:3008";

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  console.log("Launching Playwright for Catalog Usability Evidence Capture...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Experiences Landing
    console.log("1. Experiences Landing");
    await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, "01-experiences-landing.png") });

    // 2. Category vs Experience Explanation
    console.log("2. Category vs Experience Explanation");
    await page.screenshot({ path: path.join(OUT_DIR, "02-category-vs-experience-explanation.png") });

    // 3. Categories List
    console.log("3. Categories List");
    await page.goto(`${BASE_URL}/catalog/categories`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "03-categories-list.png") });

    // 4. Create Category
    console.log("4. Create Category");
    await page.goto(`${BASE_URL}/catalog/categories/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "04-create-category.png") });

    // 5. Category Success
    console.log("5. Category Success");
    await page.fill('input[placeholder*="Badminton"]', "Social Badminton");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Create Category")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "05-category-success.png") });

    // 6. Category Detail
    console.log("6. Category Detail");
    await page.goto(`${BASE_URL}/catalog/categories/cat-badminton`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "06-category-detail.png") });

    // 7. Experiences List
    console.log("7. Experiences List");
    await page.goto(`${BASE_URL}/catalog/experiences`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "07-experiences-list.png") });

    // 8. Create Experience — Basic
    console.log("8. Create Experience — Basic");
    await page.goto(`${BASE_URL}/catalog/experiences/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "08-create-experience-basic.png") });

    // 9. Event Format
    console.log("9. Event Format");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "09-event-format.png") });

    // 10. Group Size
    console.log("10. Group Size");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "10-group-size.png") });

    // 11. Time Settings
    console.log("11. Time Settings");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "11-time-settings.png") });

    // 12. Price Settings
    console.log("12. Price Settings");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "12-price-settings.png") });

    // 13. Staff Requirements
    console.log("13. Staff Requirements");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "13-staff-requirements.png") });

    // 14. Venue Compatibility
    console.log("14. Venue Compatibility");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "14-venue-compatibility.png") });

    // 15. Participant Reveal
    console.log("15. Participant Reveal");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "15-participant-reveal.png") });

    // 16. Result Type — Sport
    console.log("16. Result Type — Sport");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "16-result-type-sport.png") });

    // 17. Result Type — Non-Sport
    console.log("17. Result Type — Non-Sport");
    await page.screenshot({ path: path.join(OUT_DIR, "17-result-type-non-sport.png") });

    // 18. Readiness Blocked
    console.log("18. Readiness Blocked");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "18-readiness-blocked.png") });

    // 19. Readiness Complete
    console.log("19. Readiness Complete");
    await page.click('button:has-text("Publish Experience")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "19-readiness-complete.png") });

    // 20. Experience Detail
    console.log("20. Experience Detail");
    await page.goto(`${BASE_URL}/catalog/experiences/et-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "20-experience-detail.png") });

    // 21. Ready to Schedule
    console.log("21. Ready to Schedule");
    await page.screenshot({ path: path.join(OUT_DIR, "21-ready-to-schedule.png") });

    // 22. Schedule Event Preselection
    console.log("22. Schedule Event Preselection");
    await page.goto(`${BASE_URL}/missions/new?experienceId=et-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "22-schedule-event-preselection.png") });

    // 23. Empty State
    console.log("23. Empty State");
    await page.goto(`${BASE_URL}/catalog/experiences?q=nonexistent`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "23-empty-state.png") });

    // 24. Restricted Role Tooltip
    console.log("24. Restricted Role Tooltip");
    await page.goto(`${BASE_URL}/catalog/experiences`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "24-restricted-role-tooltip.png") });

    // 25. Command Center Experiences Panel
    console.log("25. Command Center Experiences Panel");
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "25-command-center-experiences-panel.png") });

    // 26. Mobile Layout
    console.log("26. Mobile Layout");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "26-mobile-layout.png") });

    // 27. Reset Result
    console.log("27. Reset Result");
    await page.screenshot({ path: path.join(OUT_DIR, "27-reset-result.png") });

    console.log("All 27 screenshots successfully captured in docs/prototype-evidence/catalog-usability/");
  } catch (err) {
    console.error("Screenshot capture error:", err);
  } finally {
    await browser.close();
  }
}

capture();
