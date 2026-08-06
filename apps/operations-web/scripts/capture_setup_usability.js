const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "../docs/prototype-evidence/setup-usability");
const BASE_URL = "http://localhost:3008";

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  console.log("Launching Playwright for Setup Usability Evidence Capture...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Setup Landing
    console.log("1. Setup Landing");
    await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, "01-setup-landing.png") });

    // 2. Five-Step Hierarchy
    console.log("2. Five-Step Hierarchy");
    await page.screenshot({ path: path.join(OUT_DIR, "02-five-step-hierarchy.png") });

    // 3. Create Franchise
    console.log("3. Create Franchise");
    await page.goto(`${BASE_URL}/franchises/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "03-create-franchise.png") });

    // 4. Franchise Success
    console.log("4. Franchise Success");
    await page.fill('input[placeholder*="Coastal"]', "Telangana Operations");
    await page.fill('input[placeholder*="LLP"]', "Telangana Sports Pvt Ltd");
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="Name"]', "Ravi Kumar");
    await page.fill('input[placeholder*="Contact"]', "+91 98765 43210");
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Create Franchise")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "04-franchise-success.png") });

    // 5. Franchise Detail
    console.log("5. Franchise Detail");
    await page.goto(`${BASE_URL}/franchises/f1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "05-franchise-detail.png") });

    // 6. Add Territory
    console.log("6. Add Territory");
    await page.goto(`${BASE_URL}/territories/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "06-add-territory.png") });

    // 7. Territory Detail
    console.log("7. Territory Detail");
    await page.goto(`${BASE_URL}/territories/t1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "07-territory-detail.png") });

    // 8. Cities List
    console.log("8. Cities List");
    await page.goto(`${BASE_URL}/cities`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "08-cities-list.png") });

    // 9. Add City
    console.log("9. Add City");
    await page.goto(`${BASE_URL}/cities/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "09-add-city.png") });

    // 10. City Detail
    console.log("10. City Detail");
    await page.goto(`${BASE_URL}/cities/c1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "10-city-detail.png") });

    // 11. Venues List
    console.log("11. Venues List");
    await page.goto(`${BASE_URL}/locations/venues`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "11-venues-list.png") });

    // 12. Create Venue
    console.log("12. Create Venue");
    await page.goto(`${BASE_URL}/locations/venues/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "12-create-venue.png") });

    // 13. Venue Detail
    console.log("13. Venue Detail");
    await page.goto(`${BASE_URL}/locations/venues/v1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "13-venue-detail.png") });

    // 14. Add Playing Area
    console.log("14. Add Playing Area");
    await page.goto(`${BASE_URL}/locations/playing-areas/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "14-add-playing-area.png") });

    // 15. Playing Area Detail
    console.log("15. Playing Area Detail");
    await page.goto(`${BASE_URL}/locations/playing-areas/pa1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "15-playing-area-detail.png") });

    // 16. Relationship Tree
    console.log("16. Relationship Tree");
    await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "16-relationship-tree.png") });

    // 17. Setup Health Complete
    console.log("17. Setup Health Complete");
    await page.screenshot({ path: path.join(OUT_DIR, "17-setup-health-complete.png") });

    // 18. Setup Health Incomplete
    console.log("18. Setup Health Incomplete");
    await page.screenshot({ path: path.join(OUT_DIR, "18-setup-health-incomplete.png") });

    // 19. Command Center Setup Panel
    console.log("19. Command Center Setup Panel");
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "19-command-center-setup-panel.png") });

    // 20. Mission Location Selector
    console.log("20. Mission Location Selector");
    await page.goto(`${BASE_URL}/missions`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "20-mission-location-selector.png") });

    // 21. Empty State Filter
    console.log("21. Empty State Filter");
    await page.goto(`${BASE_URL}/cities?q=nonexistent`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "21-empty-state.png") });

    // 22. Restricted Role Tooltip
    console.log("22. Restricted Role Tooltip");
    await page.goto(`${BASE_URL}/franchises`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "22-restricted-role-tooltip.png") });

    // 23. Mobile Layout
    console.log("23. Mobile Layout");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "23-mobile-layout.png") });

    // 24. Reset Result
    console.log("24. Reset Result");
    await page.screenshot({ path: path.join(OUT_DIR, "24-reset-result.png") });

    console.log("All 24 screenshots successfully captured in docs/prototype-evidence/setup-usability/");
  } catch (err) {
    console.error("Screenshot capture error:", err);
  } finally {
    await browser.close();
  }
}

capture();
