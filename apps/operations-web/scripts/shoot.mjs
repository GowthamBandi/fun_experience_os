// Usage: node scripts/shoot.mjs <outDir> <operatorName> <path> [<path>...]
// Signs into the local workspace as the named operator and screenshots each path at desktop width.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [outDir, operatorName, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3100";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const width = Number(process.env.WIDTH ?? 1440);
const page = await browser.newPage({ viewport: { width, height: Number(process.env.HEIGHT ?? 900) } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: new RegExp(operatorName) }).first().click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
for (const p of paths) {
  await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const file = path.join(outDir, (p === "/" ? "home" : p.replace(/^\//, "").replace(/[\/\[\]]/g, "_")) + ".png");
  await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
  console.log("shot", file);
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
