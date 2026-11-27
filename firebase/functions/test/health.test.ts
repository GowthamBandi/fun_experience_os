/**
 * Functions health-check test.
 *
 * Verifies the checkHealth callable returns the expected emulator response.
 * Run inside firebase emulators:exec so Functions emulator is already running.
 */

const PROJECT_ID = "demo-experience-os";

/** Ask the emulator hub where Functions runs, so spare-port configs (--config) work too. */
async function functionsOrigin(): Promise<string> {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  if (hub) {
    const res = await fetch(`http://${hub}/emulators`);
    const list = (await res.json()) as { functions?: { host: string; port: number } };
    if (list.functions) return `http://${list.functions.host}:${list.functions.port}`;
  }
  return "http://127.0.0.1:5001";
}

test("checkHealth callable returns ok:true from emulator", async () => {
  const url = `${await functionsOrigin()}/${PROJECT_ID}/us-central1/checkHealth`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });

  expect(res.ok).toBe(true);
  const json = (await res.json()) as { result: { ok: boolean; environment: string; projectId: string } };
  expect(json.result.ok).toBe(true);
  expect(json.result.environment).toBe("emulator");
  expect(json.result.projectId).toBe(PROJECT_ID);
});
