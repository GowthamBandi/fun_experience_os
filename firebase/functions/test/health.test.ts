/**
 * Functions health-check test.
 *
 * Verifies the checkHealth callable returns the expected emulator response.
 * Run inside firebase emulators:exec so Functions emulator is already running.
 */

const PROJECT_ID = "demo-experience-os";
const FUNCTIONS_HOST = "127.0.0.1";
const FUNCTIONS_PORT = 5001;

test("checkHealth callable returns ok:true from emulator", async () => {
  const url = `http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/checkHealth`;

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
