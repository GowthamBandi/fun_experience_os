// Visit every console route as one operator and report runtime errors, error
// boundaries, not-found cards on valid ids and horizontal overflow.
// Usage: node scripts/crawl.mjs "<Operator Name>" <outDir> [width]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [operatorName, outDir, widthArg] = process.argv.slice(2);
const width = Number(widthArg ?? 1440);
const base = process.env.BASE_URL ?? "http://localhost:3100";
const ROUTES = `/ /access /analytics /approvals /arenas /audit /bookings /bookings/b-1 /bookings/new /catalog /catalog/categories /catalog/categories/cat-cricket /catalog/categories/new /catalog/experiences /catalog/experiences/et-1 /catalog/experiences/et-1/preview /catalog/experiences/et-1/versions /catalog/experiences/new /catalog/templates /cities /cities/c-hyd /cities/new /commercials /customers /events /franchises /franchises/f-1 /franchises/new /identity-patterns /identity-patterns/pat-cr /identity-patterns/new /locations /locations/playing-areas /locations/playing-areas/pa-1 /locations/playing-areas/new /locations/venues /locations/venues/v-1 /locations/venues/v-1/playing-areas/new /locations/venues/new /missions /missions/s-1 /missions/s-1/bookings /missions/s-1/check-in /missions/s-1/completion /missions/s-1/live /missions/s-1/money /missions/s-1/overview /missions/s-1/participants /missions/s-1/results /missions/s-1/reveal /missions/s-1/summary /missions/s-1/teams /missions/s-1/waitlist /missions/s-2/overview /missions/new /money /money/payments /money/reconciliation /money/refunds /notifications /partners /people /people/participants /people/participants/b-1 /people/staff /people/staff/c-1 /people/staff/new /policies /refunds /risk /safety /settings /settlements /setup /staffing /staffing/assign /staffing/availability /staffing/check-in /staffing/health /staffing/todays-work /territories /territories/hvd-central /territories/hvd-central/cities/new /territories/new /tournaments /tournaments/tr-1 /tournaments/tr-2 /tournaments/new /does-not-exist`.split(/\s+/).filter(Boolean);

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width, height: 900 } });
let errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`);
});
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: new RegExp(operatorName) }).first().click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

const problems = [];
for (const route of ROUTES) {
  errors = [];
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const main = document.querySelector("main");
    const text = document.body.innerText;
    return {
      boundary: text.includes("This page ran into a problem") || text.includes("could not start"),
      notFound: /not found|no session with|doesn.t exist|could not be found/i.test(text.slice(0, 4000)),
      denied: text.includes("You don't have access to") || text.includes("You don’t have access to"),
      overflow: Math.max(document.documentElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0),
      loading: text.includes("Opening your workspace"),
    };
  });
  const flags = [];
  if (errors.length) flags.push(...[...new Set(errors)]);
  if (info.boundary) flags.push("ERROR BOUNDARY");
  if (info.notFound && route !== "/does-not-exist") flags.push("not-found text");
  if (info.overflow > 2) flags.push(`horizontal overflow ${info.overflow}px`);
  if (info.loading) flags.push("stuck loading");
  const shot = path.join(outDir, (route === "/" ? "home" : route.slice(1).replace(/\//g, "_")) + ".png");
  await page.screenshot({ path: shot });
  console.log(`${flags.length ? "✗" : "✓"} ${route}${info.denied ? " (denied)" : ""}${flags.length ? "  " + flags.join(" | ") : ""}`);
  if (flags.length) problems.push({ route, flags });
}
console.log(`\n${problems.length} route(s) with problems`);
await browser.close();
