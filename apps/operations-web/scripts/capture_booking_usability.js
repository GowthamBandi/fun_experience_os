const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PORT = 3008;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = path.join(__dirname, "..", "docs", "prototype-evidence", "booking-usability");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  console.log("Launching Playwright for Booking Usability Evidence Capture...");
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch (e) {
    browser = await chromium.launch();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    // 1. Bookings Overview
    console.log("1. Bookings Overview");
    await page.goto(`${BASE_URL}/bookings`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, "01-bookings-overview.png") });

    // 2. Bookings Mobile View
    console.log("2. Bookings Mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "02-bookings-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 900 });

    // 3. Operator Hint Panel
    console.log("3. Operator Hint");
    await page.screenshot({ path: path.join(OUT_DIR, "03-operator-hint.png") });

    // 4. Add Booking - Choose Event
    console.log("4. Add Booking - Choose Event");
    await page.goto(`${BASE_URL}/bookings/new`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "04-add-booking-choose-event.png") });

    // 5. Add Booking - Spaces
    console.log("5. Add Booking - Check Spaces");
    const chooseButtons = await page.$$("button:has-text('Choose Event')");
    if (chooseButtons.length > 0) {
      await chooseButtons[0].click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "05-add-booking-spaces.png") });

    // 6. Add Booking - Participant
    console.log("6. Add Booking - Participant");
    const continueBtn1 = await page.$("button:has-text('Continue')");
    if (continueBtn1) {
      await continueBtn1.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "06-add-booking-participant.png") });

    // 7. Add Booking - Payment
    console.log("7. Add Booking - Payment");
    await page.fill("input[placeholder*='John Doe']", "TestRunner-42");
    const continueBtn2 = await page.$("button:has-text('Continue')");
    if (continueBtn2) {
      await continueBtn2.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "07-add-booking-payment.png") });

    // 8. Booking Success
    console.log("8. Booking Success");
    const continueBtn3 = await page.$("button:has-text('Continue')");
    if (continueBtn3) {
      await continueBtn3.click();
      await page.waitForTimeout(500);
    }
    const confirmBtn = await page.$("button:has-text('Confirm Booking')");
    if (confirmBtn) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "08-booking-success.png") });

    // 9. Booking Details
    console.log("9. Booking Details");
    await page.goto(`${BASE_URL}/bookings/b-1`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "09-booking-details.png") });

    // 10. Booking Timeline
    console.log("10. Booking Timeline");
    await page.screenshot({ path: path.join(OUT_DIR, "10-booking-timeline.png") });

    // 11. Payment Countdown (view b-2 if pending)
    console.log("11. Payment Countdown");
    await page.goto(`${BASE_URL}/bookings/b-22`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "11-payment-countdown.png") });

    // 12. Payment Problem
    console.log("12. Payment Problem");
    await page.goto(`${BASE_URL}/bookings/b-80`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "12-payment-problem.png") });

    // 13. Event Full (s-3)
    console.log("13. Event Full");
    await page.goto(`${BASE_URL}/missions/s-3/bookings`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "13-event-full.png") });

    // 14. Waiting List
    console.log("14. Waiting List");
    await page.goto(`${BASE_URL}/missions/s-1/waitlist`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "14-waiting-list.png") });

    // 15. Space Offer
    console.log("15. Space Offer");
    await page.screenshot({ path: path.join(OUT_DIR, "15-space-offer.png") });

    // 16. Cancellation Modal
    console.log("16. Cancellation Modal");
    await page.goto(`${BASE_URL}/bookings/b-1`);
    await page.waitForTimeout(500);
    const cancelBtn = await page.$("button:has-text('Cancel Booking')");
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "16-cancellation.png") });

    // 17. Refund Request
    console.log("17. Refund Request");
    await page.goto(`${BASE_URL}/money/refunds`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "17-refund-request.png") });

    // 18. Refund Review
    console.log("18. Refund Review");
    await page.screenshot({ path: path.join(OUT_DIR, "18-refund-review.png") });

    // 19. Refund Completed
    console.log("19. Refund Completed");
    await page.screenshot({ path: path.join(OUT_DIR, "19-refund-completed.png") });

    // 20. Payments Page
    console.log("20. Payments Page");
    await page.goto(`${BASE_URL}/money/payments`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "20-payments.png") });

    // 21. Payment Check (Reconciliation)
    console.log("21. Payment Check");
    await page.goto(`${BASE_URL}/money/reconciliation`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "21-payment-check.png") });

    // 22. Event Bookings
    console.log("22. Event Bookings");
    await page.goto(`${BASE_URL}/missions/s-1/bookings`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "22-event-bookings.png") });

    // 23. Missions Booking Health
    console.log("23. Missions Booking Health");
    await page.goto(`${BASE_URL}/missions`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "23-missions-booking-health.png") });

    // 24. Empty State Filter
    console.log("24. Empty State Filter");
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForTimeout(500);
    await page.fill("input[placeholder*='Search']", "nonexistentqueryXYZ");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "24-empty-state.png") });

    // 25. Restricted Role Tooltip
    console.log("25. Restricted Role Tooltip");
    await page.goto(`${BASE_URL}/money/refunds`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "25-restricted-role-tooltip.png") });

    // 26. Reset Result
    console.log("26. Reset Result");
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "26-reset-result.png") });

    console.log("All 26 screenshots successfully captured in docs/prototype-evidence/booking-usability/");
  } catch (err) {
    console.error("Screenshot capture error:", err);
  } finally {
    await browser.close();
  }
}

capture();
