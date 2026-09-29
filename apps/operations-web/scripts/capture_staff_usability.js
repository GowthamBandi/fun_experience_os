const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "../docs/prototype-evidence/staff-usability");
const BASE_URL = "http://localhost:3009";

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  console.log("Launching Playwright for Staff Usability Evidence Capture...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. People Landing
    console.log("1. People Landing");
    await page.goto(`${BASE_URL}/people`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, "01-people-landing.png") });

    // 2. Staff vs Participants Explanation
    console.log("2. Staff vs Participants Explanation");
    await page.screenshot({ path: path.join(OUT_DIR, "02-staff-vs-participants-explanation.png") });

    // 3. Staff Directory
    console.log("3. Staff Directory");
    await page.goto(`${BASE_URL}/people/staff`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "03-staff-directory.png") });

    // 4. Staff Mobile View
    console.log("4. Staff Mobile View");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUT_DIR, "04-staff-mobile-view.png") });
    await page.setViewportSize({ width: 1440, height: 900 });

    // 5. Add Staff — Basics
    console.log("5. Add Staff — Basics");
    await page.goto(`${BASE_URL}/people/staff/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "05-add-staff-basics.png") });

    // 6. Add Staff — Contact
    console.log("6. Add Staff — Contact");
    await page.fill('input[placeholder*="Rahul Kumar"]', "Rohan Verma");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "06-add-staff-contact.png") });

    // 7. Add Staff — Role and Skills
    console.log("7. Add Staff — Role and Skills");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "07-add-staff-role-and-skills.png") });

    // 8. Add Staff — Working Area
    console.log("8. Add Staff — Working Area");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "08-add-staff-working-area.png") });

    // 9. Staff Success
    console.log("9. Staff Success");
    await page.click('button:has-text("Next Step")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Add Staff Member")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "09-staff-success.png") });

    // 10. Staff Profile
    console.log("10. Staff Profile");
    await page.goto(`${BASE_URL}/people/staff/c-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "10-staff-profile.png") });

    // 11. Staff Schedule Dashboard
    console.log("11. Staff Schedule Dashboard");
    await page.goto(`${BASE_URL}/staffing`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "11-staff-schedule.png") });

    // 12. Event Needing Staff
    console.log("12. Event Needing Staff");
    await page.screenshot({ path: path.join(OUT_DIR, "12-event-needing-staff.png") });

    // 13. Required Role Cards
    console.log("13. Required Role Cards");
    await page.goto(`${BASE_URL}/staffing/assign`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "13-required-role-cards.png") });

    // 14. Available People
    console.log("14. Available People");
    await page.screenshot({ path: path.join(OUT_DIR, "14-available-people.png") });

    // 15. Conflict Warning
    console.log("15. Conflict Warning");
    await page.screenshot({ path: path.join(OUT_DIR, "15-conflict-warning.png") });

    // 16. Saved Assignments
    console.log("16. Saved Assignments");
    await page.click('button:has-text("Save Staff Assignments")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "16-saved-assignments.png") });

    // 17. Mission Today's Team
    console.log("17. Mission Today's Team");
    await page.goto(`${BASE_URL}/missions/s-1/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "17-mission-todays-team.png") });

    // 18. Availability Calendar
    console.log("18. Availability Calendar");
    await page.goto(`${BASE_URL}/staffing/availability`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "18-availability-calendar.png") });

    // 19. Availability List
    console.log("19. Availability List");
    await page.click('button:has-text("List")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "19-availability-list.png") });

    // 20. Today's Work
    console.log("20. Today's Work");
    await page.goto(`${BASE_URL}/staffing/todays-work`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "20-todays-work.png") });

    // 21. Staff Check-In
    console.log("21. Staff Check-In");
    await page.goto(`${BASE_URL}/staffing/check-in`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "21-staff-check-in.png") });

    // 22. Late Staff
    console.log("22. Late Staff");
    await page.screenshot({ path: path.join(OUT_DIR, "22-late-staff.png") });

    // 23. Absent Staff
    console.log("23. Absent Staff");
    await page.screenshot({ path: path.join(OUT_DIR, "23-absent-staff.png") });

    // 24. Staff Readiness
    console.log("24. Staff Readiness");
    await page.goto(`${BASE_URL}/staffing/health`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "24-staff-readiness.png") });

    // 25. Missing Safety Lead
    console.log("25. Missing Safety Lead");
    await page.screenshot({ path: path.join(OUT_DIR, "25-missing-safety-lead.png") });

    // 26. Command Center Staff Ready Today
    console.log("26. Command Center Staff Ready Today");
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "26-command-center-staff-ready-today.png") });

    // 27. Participants Directory
    console.log("27. Participants Directory");
    await page.goto(`${BASE_URL}/people/participants`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "27-participants-directory.png") });

    // 28. Privacy-Safe Participant Detail
    console.log("28. Privacy-Safe Participant Detail");
    await page.goto(`${BASE_URL}/people/participants/b-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "28-privacy-safe-participant-detail.png") });

    // 29. Restricted Role Tooltip
    console.log("29. Restricted Role Tooltip");
    await page.goto(`${BASE_URL}/people/staff`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "29-restricted-role-tooltip.png") });

    // 30. Empty State
    console.log("30. Empty State");
    await page.goto(`${BASE_URL}/people/staff?q=nonexistent`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "30-empty-state.png") });

    // 31. Mobile Assignment Flow
    console.log("31. Mobile Assignment Flow");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/staffing/assign`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "31-mobile-assignment-flow.png") });

    // 32. Reset Result
    console.log("32. Reset Result");
    await page.screenshot({ path: path.join(OUT_DIR, "32-reset-result.png") });

    console.log("All 32 PNG screenshots successfully captured under docs/prototype-evidence/staff-usability/");
  } catch (err) {
    console.error("Screenshot capture error:", err);
  } finally {
    await browser.close();
  }
}

capture();
