/**
 * Smoke: the console, built WITHOUT a Firebase data mode, must fail closed on
 * /login with the explicit configuration message (no Firebase needed).
 *
 *   npm run smoke
 *
 * Builds into .next-smoke with NEXT_PUBLIC_DATA_MODE unset, runs `next start`,
 * and drives Chromium via the playwright library. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE
 * to use a specific browser binary (e.g. a preinstalled one).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.SMOKE_PORT ?? 3107);
const BASE = `http://127.0.0.1:${PORT}`;
const DIST = ".next-smoke";
const EXPECTED = "Console requires NEXT_PUBLIC_DATA_MODE=firebase-emulator (local) or firebase-live";

function env() {
  const e = { ...process.env, NEXT_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: "1" };
  delete e.NEXT_PUBLIC_DATA_MODE;
  return e;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env(), stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

function browserPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const candidate = path.join(root, dir, "chrome-linux", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start did not become ready");
}

if (!process.argv.includes("--skip-build")) await run("npx", ["next", "build"]);
// Own process group so the whole server tree is stopped afterwards.
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env: env(), stdio: "ignore", detached: true });
let browser;
try {
  await waitForServer(Date.now() + 60_000);
  browser = await chromium.launch({ executablePath: browserPath() });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`);
  const notice = page.getByTestId("configuration-notice");
  await notice.waitFor({ timeout: 15_000 });
  const text = await notice.innerText();
  if (!text.includes(EXPECTED)) throw new Error(`configuration message missing, got: ${text}`);
  if (!(await page.getByRole("button", { name: /sign in/i }).isDisabled())) throw new Error("sign-in button must be disabled");
  console.log("✓ /login shows the configuration message and disables sign-in");

  await page.goto(`${BASE}/missions`);
  await page.waitForURL(`${BASE}/login`, { timeout: 15_000 });
  console.log("✓ console routes redirect to /login when misconfigured (fail closed)");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
console.log("smoke passed");
